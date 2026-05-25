from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from typing import Dict, List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from .config import settings
from .embeddings import embed_texts
from .logger import logger

COLLECTION_NAME = "company_brain"


@lru_cache(maxsize=1)
def get_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(
        path=str(settings.chroma_path),
        settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
    )


def get_collection():
    client = get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def reset_collection() -> None:
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
        logger.info("Cleared existing collection")
    except Exception:
        pass


def _make_id(source: str, idx: int, text: str) -> str:
    h = hashlib.sha1(f"{source}:{idx}:{text[:64]}".encode("utf-8")).hexdigest()[:16]
    return f"{source}:{idx}:{h}"


def add_chunks(chunks: List[str], metadatas: List[Dict]) -> int:
    if not chunks:
        return 0
    coll = get_collection()
    embeddings = embed_texts(chunks)
    ids = [
        _make_id(meta.get("source", "unknown"), i, text)
        for i, (text, meta) in enumerate(zip(chunks, metadatas))
    ]
    # upsert so re-ingesting the same file replaces rather than duplicates / errors
    coll.upsert(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)
    return len(chunks)


def delete_by_source(source: str) -> None:
    coll = get_collection()
    try:
        coll.delete(where={"source": source})
    except Exception as e:
        logger.warning(f"delete_by_source({source}) failed: {e}")


def query(text: str, top_k: Optional[int] = None) -> List[Dict]:
    if not text.strip():
        return []
    coll = get_collection()
    if coll.count() == 0:
        return []
    k = top_k or settings.TOP_K
    embedding = embed_texts([text])[0]
    res = coll.query(
        query_embeddings=[embedding],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )
    out: List[Dict] = []
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    for doc, meta, dist in zip(docs, metas, dists):
        out.append({"text": doc, "metadata": meta or {}, "distance": float(dist)})
    return out


def stats() -> Dict:
    coll = get_collection()
    return {"count": coll.count(), "collection": COLLECTION_NAME}


def keyword_search(text: str, top_k: int = 6) -> List[Dict]:
    """Cheap literal keyword scan over every stored document.

    Ranks chunks by the count of *distinct* query tokens they contain plus
    a small bonus for exact phrase match. Complements vector search for
    queries that hinge on a specific number, name, or filename — things
    embeddings sometimes blur together.
    """
    q = (text or "").strip()
    if not q:
        return []
    coll = get_collection()
    if coll.count() == 0:
        return []

    # Tokenize: keep alphanumerics + Arabic letters, length ≥ 2.
    tokens = [t for t in re.findall(r"[A-Za-z0-9؀-ۿ]+", q.lower()) if len(t) >= 2]
    if not tokens:
        return []
    phrase = q.lower()

    raw = coll.get(include=["documents", "metadatas"])
    docs = raw.get("documents") or []
    metas = raw.get("metadatas") or []

    scored: List[tuple[float, str, Dict]] = []
    for doc, meta in zip(docs, metas):
        low = (doc or "").lower()
        if not low:
            continue
        # distinct-token coverage
        hits = sum(1 for tok in set(tokens) if tok in low)
        if hits == 0:
            continue
        score = float(hits)
        if phrase and phrase in low:
            score += 2.5  # strong bonus for exact phrase
        scored.append((score, doc, meta or {}))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {"text": d, "metadata": m, "distance": 0.0, "score": s}
        for s, d, m in scored[:top_k]
    ]
