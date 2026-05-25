from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from .chunker import chunk_text
from .config import settings
from .loaders import iter_company_files, load_file
from .logger import logger
from .vectorstore import add_chunks, delete_by_source, reset_collection, stats


def _file_overview(path: Path, records: list) -> tuple[str, Dict] | None:
    """A small synthetic chunk per file: filename + type + opening lines.
    Helps retrieval for "what is in X.docx" style questions even when the
    body chunks don't match keywords."""
    if not records:
        return None
    full = "\n".join((t or "").strip() for t, _ in records if t).strip()
    if not full:
        return None
    head = full[:600]
    parts = [
        f"FILE OVERVIEW: {path.name}",
        f"Type: {path.suffix.lower().lstrip('.')}",
        f"Length: {len(full)} characters across {len(records)} record(s)",
        "Opening content:",
        head,
    ]
    text = "\n".join(parts)
    meta = {"source": path.name, "type": path.suffix.lower().lstrip("."), "overview": True}
    return text, meta


def ingest_path(path: Path) -> int:
    """Load a single file, chunk it, embed it, and add to vector store.
    Returns the number of chunks added. Removes any prior chunks for the
    same source first so re-uploads do not pile up.
    """
    if not path.exists():
        logger.warning(f"File not found: {path}")
        return 0
    delete_by_source(path.name)
    records = load_file(path)

    chunks: List[str] = []
    metas: List[Dict] = []

    # 1) Per-file overview chunk — single, small, always present.
    overview = _file_overview(path, records)
    if overview:
        chunks.append(overview[0])
        metas.append(overview[1])

    # 2) Body chunks from each record, split by the semantic-ish chunker.
    for text, meta in records:
        for piece in chunk_text(text, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP):
            chunks.append(piece)
            metas.append(dict(meta))

    if chunks:
        added = add_chunks(chunks, metas)
        logger.info(f"Ingested {path.name}: {added} chunks")
        return added
    logger.info(f"No content extracted from {path.name}")
    return 0


def ingest_all(reset: bool = True) -> Dict:
    if reset:
        reset_collection()
    base = settings.company_data_path
    base.mkdir(parents=True, exist_ok=True)
    files = list(iter_company_files(base))
    logger.info(f"Found {len(files)} files in {base}")
    total = 0
    per_file = {}
    for f in files:
        added = ingest_path(f)
        per_file[str(f.relative_to(base))] = added
        total += added
    s = stats()
    logger.info(f"Ingestion complete. Total chunks: {total}. Store size: {s['count']}")
    return {"total_chunks": total, "files": per_file, "store": s}
