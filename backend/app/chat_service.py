from __future__ import annotations

from typing import AsyncIterator, Dict, List, Optional

from .config import settings
from .employee_lookup import resolve as resolve_employees
from .logger import logger
from .providers import get_provider, list_providers, LLMError
from .vectorstore import keyword_search, query
from .warnings import detect_warning_intent, generate_warning

SYSTEM_PROMPT = (
    "You are 'AI Company Brain', an internal assistant for a Saudi company.\n"
    "\n"
    "You have two sources of knowledge:\n"
    "1. The company's own files (employees, contracts, policies, templates, etc.) — passed as 'Company files context' in the user turn.\n"
    "2. Your own general knowledge — math, code, world facts, language, definitions, casual conversation, etc.\n"
    "\n"
    "How to choose:\n"
    "- If the user's question is about the company (employees, HR, contracts, policies, internal docs) AND the context contains relevant information, answer from the context and stay accurate to it.\n"
    "- If the context is empty, irrelevant, or only loosely related, answer from your general knowledge instead. Do NOT refuse and do NOT ask the user to upload anything.\n"
    "- Never say 'the provided context does not contain' or similar phrases. If the company files don't help, just answer normally.\n"
    "\n"
    "Style:\n"
    "- Reply in the same language as the user (Arabic, English, or mixed).\n"
    "- Be concise and well-structured. Use markdown headings / bullets / tables when they help.\n"
    "- Do NOT include source citations, reference tags, or bracketed labels like [Source N], [1], [doc:...]."
)


def _format_context(chunks: List[Dict]) -> str:
    if not chunks:
        return "(no context retrieved)"
    lines = []
    for i, c in enumerate(chunks, 1):
        meta = c.get("metadata", {}) or {}
        ref_parts = [meta.get("source", "unknown")]
        if meta.get("page"):
            ref_parts.append(f"page {meta['page']}")
        if meta.get("sheet"):
            ref_parts.append(f"sheet {meta['sheet']}")
        if meta.get("row"):
            ref_parts.append(f"row {meta['row']}")
        ref = ", ".join(str(x) for x in ref_parts)
        lines.append(f"[Source {i}] ({ref})\n{c['text']}")
    return "\n\n".join(lines)


def _format_sources(chunks: List[Dict]) -> List[Dict]:
    out = []
    for c in chunks:
        m = c.get("metadata", {}) or {}
        out.append(
            {
                "source": m.get("source"),
                "page": m.get("page"),
                "sheet": m.get("sheet"),
                "row": m.get("row"),
                "type": m.get("type"),
                "distance": c.get("distance"),
            }
        )
    return out


async def answer(message: str, provider_name: Optional[str] = None) -> Dict:
    # Tool: warning generation intent
    intent = detect_warning_intent(message)
    if intent:
        try:
            result = generate_warning(intent["identifier"], intent["reason"])
            text = (
                f"Generated a warning letter for {result['employee']['name']} "
                f"(iqama {result['employee']['iqama']}).\n"
                f"Reason: {result['reason']}\n"
                f"File: generated/warnings/{result['filename']}"
            )
            if result["missing_placeholders"]:
                text += (
                    "\n\nNote: these placeholders were not found in the template and "
                    "were left unreplaced: " + ", ".join(result["missing_placeholders"])
                )
            return {
                "answer": text,
                "sources": [],
                "generated_file": result["filename"],
            }
        except FileNotFoundError as e:
            logger.warning(str(e))
            return {"answer": str(e), "sources": [], "generated_file": None}
        except Exception as e:
            logger.exception("Warning generation failed")
            return {
                "answer": f"Failed to generate warning: {e}",
                "sources": [],
                "generated_file": None,
            }

    # Structured lookup tool: when the user mentions an iqama / badge /
    # 'employee N', pull the exact rows from employees.xlsx first. RAG over
    # ~1k near-identical rows can miss the right one, so we prepend the
    # deterministic matches and dedupe against any RAG hits.
    exact      = resolve_employees(message)
    rag_chunks = query(message)
    kw_chunks  = keyword_search(message, settings.KEYWORD_TOP_K)

    seen_keys: set[tuple] = set()
    chunks: List[Dict] = []
    # Order matters: exact lookup first, then vector matches, then keyword.
    for c in exact + rag_chunks + kw_chunks:
        m = c.get("metadata", {}) or {}
        key = (m.get("source"), m.get("row"), m.get("page"), m.get("sheet"))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        chunks.append(c)

    context = _format_context(chunks)

    user_prompt = (
        f"Company files context (use only if relevant, otherwise ignore):\n{context}\n\n"
        f"User question: {message}"
    )
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    reply, used_provider = await _chat_with_fallback(messages, provider_name)
    return {
        "answer": reply,
        "sources": _format_sources(chunks),
        "generated_file": None,
        "provider": used_provider,
    }


def _fallback_provider(preferred: str) -> Optional[str]:
    """Pick the first other available provider (e.g. preferred=gemini → deepseek)."""
    for p in list_providers():
        if p["id"] != preferred and p.get("available"):
            return p["id"]
    return None


async def _chat_with_fallback(
    messages: List[Dict[str, str]],
    provider_name: Optional[str],
) -> tuple[str, str]:
    """Non-streaming call with one transparent fallback on rate-limit."""
    primary = get_provider(provider_name)
    try:
        return await primary.chat(messages), primary.id
    except LLMError as e:
        if not e.is_rate_limited:
            raise
        alt = _fallback_provider(primary.id)
        if not alt:
            raise
        logger.warning(f"{primary.id} rate-limited, falling back to {alt}")
        secondary = get_provider(alt)
        return await secondary.chat(messages), secondary.id


# ----------------------------------------------------------------------------
# Streaming variant. Yields newline-delimited JSON events:
#   {"type":"sources","sources":[...]}
#   {"type":"token","content":"..."}
#   {"type":"done","answer":"...","generated_file":...}
#   {"type":"error","message":"..."}
# Final "done" carries the full assembled answer so the caller can persist it.
# ----------------------------------------------------------------------------

import json as _json  # local alias to avoid colliding with stdlib at top


def _ev(obj: Dict) -> str:
    return _json.dumps(obj, ensure_ascii=False) + "\n"


async def stream_answer(message: str, provider_name: Optional[str] = None) -> AsyncIterator[str]:
    # Tool: warning generation intent — single shot, no token streaming.
    intent = detect_warning_intent(message)
    if intent:
        try:
            result = generate_warning(intent["identifier"], intent["reason"])
            text = (
                f"Generated a warning letter for {result['employee']['name']} "
                f"(iqama {result['employee']['iqama']}).\n"
                f"Reason: {result['reason']}\n"
                f"File: generated/warnings/{result['filename']}"
            )
            if result["missing_placeholders"]:
                text += (
                    "\n\nNote: these placeholders were not found in the template and "
                    "were left unreplaced: " + ", ".join(result["missing_placeholders"])
                )
            yield _ev({"type": "sources", "sources": []})
            yield _ev({"type": "token", "content": text})
            yield _ev({"type": "done", "answer": text, "generated_file": result["filename"]})
            return
        except FileNotFoundError as e:
            msg = str(e)
            yield _ev({"type": "token", "content": msg})
            yield _ev({"type": "done", "answer": msg, "generated_file": None})
            return
        except Exception as e:
            logger.exception("Warning generation failed")
            yield _ev({"type": "error", "message": f"Failed to generate warning: {e}"})
            return

    # Standard RAG path with token streaming.
    try:
        exact = resolve_employees(message)
        rag_chunks = query(message)

        seen_keys: set[tuple] = set()
        chunks: List[Dict] = []
        for c in exact + rag_chunks:
            m = c.get("metadata", {}) or {}
            key = (m.get("source"), m.get("row"), m.get("page"), m.get("sheet"))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            chunks.append(c)

        # Emit sources up front so the UI can render citations immediately.
        yield _ev({"type": "sources", "sources": _format_sources(chunks)})

        context = _format_context(chunks)
        user_prompt = (
            f"Company files context (use only if relevant, otherwise ignore):\n{context}\n\n"
            f"User question: {message}"
        )
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        provider = get_provider(provider_name)
        yield _ev({"type": "provider", "id": provider.id, "label": provider.label})

        assembled: List[str] = []
        try:
            async for chunk in provider.stream(messages):
                assembled.append(chunk)
                yield _ev({"type": "token", "content": chunk})
        except LLMError as e:
            # Rate-limited BEFORE any tokens arrived → transparently retry on
            # the other provider so the user never sees the error.
            if e.is_rate_limited and not assembled:
                alt = _fallback_provider(provider.id)
                if alt:
                    logger.warning(
                        f"{provider.id} rate-limited (mid-stream), "
                        f"falling back to {alt}"
                    )
                    fallback = get_provider(alt)
                    yield _ev({
                        "type": "provider",
                        "id": fallback.id,
                        "label": fallback.label,
                        "fallback_from": provider.id,
                        "reason": "rate_limit",
                    })
                    async for chunk in fallback.stream(messages):
                        assembled.append(chunk)
                        yield _ev({"type": "token", "content": chunk})
                else:
                    raise
            else:
                raise

        yield _ev({"type": "done", "answer": "".join(assembled), "generated_file": None})
    except Exception as e:
        logger.exception("stream_answer failed")
        yield _ev({"type": "error", "message": str(e)})
