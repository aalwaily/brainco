from __future__ import annotations

from typing import AsyncIterator, Dict, List, Optional

from .config import settings
from .doc_builder import build_document
from .doc_intent import detect_document_intent, infer_format
from .employee_lookup import resolve as resolve_employees
from .logger import logger
from .providers import get_provider, list_providers, LLMError
from .vectorstore import keyword_search, query
from .warnings import detect_warning_intent, generate_warning

# In-memory cache of the last document spec built per session, so follow-up
# edit requests ("change the date") can build on the previous content.
# Lost on restart — acceptable for an editing convenience.
_LAST_DOC_SPEC: Dict[int, Dict] = {}

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


# ---- Document generation helpers -------------------------------------------

def _gather_context(message: str) -> str:
    """Retrieve company-file context (exact lookup + vector + keyword) and
    format it for an LLM prompt. Shared by chat and document generation."""
    exact = resolve_employees(message)
    rag_chunks = query(message)
    kw_chunks = keyword_search(message, settings.KEYWORD_TOP_K)
    seen: set = set()
    chunks: List[Dict] = []
    for c in exact + rag_chunks + kw_chunks:
        m = c.get("metadata", {}) or {}
        key = (m.get("source"), m.get("row"), m.get("page"), m.get("sheet"))
        if key in seen:
            continue
        seen.add(key)
        chunks.append(c)
    return _format_context(chunks)


def _extract_json(text: str) -> Optional[Dict]:
    """Pull the first JSON object out of an LLM reply (handles ```json fences
    and stray prose around it)."""
    if not text:
        return None
    fence = _json.loads if False else None  # noqa (keep mypy quiet)
    # Strip code fences
    cleaned = text.strip()
    cleaned = _re_sub_fence(cleaned)
    # Find the outermost {...}
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    blob = cleaned[start : end + 1]
    try:
        return _json.loads(blob)
    except Exception:
        # last resort: try trimming trailing commas
        try:
            import re as _re
            blob2 = _re.sub(r",\s*([}\]])", r"\1", blob)
            return _json.loads(blob2)
        except Exception:
            return None


def _re_sub_fence(text: str) -> str:
    import re as _re
    return _re.sub(r"```[a-zA-Z0-9]*\n?|```", "", text)


DOC_SPEC_SYSTEM = (
    "You are a document generation engine for a Saudi company assistant.\n"
    "Given a user request (and optional company data + a previous document to "
    "edit), output a SINGLE JSON object describing the document to build.\n\n"
    "Schema:\n"
    "{\n"
    '  "type": "pdf|docx|xlsx|md|txt",\n'
    '  "filename": "short_snake_or_arabic_name_without_extension",\n'
    '  "title": "Document title",\n'
    '  "body": "Markdown content: use #/##/### headings, - bullets, 1. numbers, **bold**, blank lines between paragraphs",\n'
    '  "table": { "columns": ["A","B"], "rows": [["x","y"]] }   // OPTIONAL, omit if not tabular\n'
    "}\n\n"
    "Rules:\n"
    "- Write real, complete, professional content — never placeholders like {{NAME}}.\n"
    "- If the user gave employee/company data, USE it (names, iqama, dates, amounts).\n"
    "- LANGUAGE: write the document in EXACTLY the language specified in the\n"
    "  'Target language' line of the user turn. Title, body, table headers,\n"
    "  filename — ALL must be in that language. Do NOT mix languages unless\n"
    "  asked. (Saudi proper names like 'Ahmed' can stay transliterated.)\n"
    "- For spreadsheets/tables prefer type xlsx with a table.\n"
    "- Output ONLY the JSON. No explanation, no code fence."
)


_LANG_LABEL = {
    "ar": "Arabic (العربية) — write everything in Arabic.",
    "en": "English — write everything in English.",
}


async def _generate_doc_spec(
    message: str,
    provider,
    fmt: Optional[str],
    prev_spec: Optional[Dict],
    language: str = "en",
) -> Dict:
    """Ask the LLM to produce a document spec, then normalize it."""
    context = _gather_context(message)
    lang_line = _LANG_LABEL.get(language, _LANG_LABEL["en"])
    parts = [
        f"Target language: {lang_line}",
        f"\nUser request:\n{message}",
    ]
    if context and context != "(no context retrieved)":
        parts.append(f"\nCompany data you may use:\n{context}")
    if prev_spec:
        parts.append(
            "\nThis is the previous document the user wants to EDIT. Apply their "
            "requested change and return the FULL updated document (still in the "
            "target language above):\n"
            + _json.dumps(prev_spec, ensure_ascii=False)
        )
    if fmt:
        parts.append(f"\nThe document MUST be of type: {fmt}")
    user_prompt = "\n".join(parts)

    reply = await provider.chat(
        [
            {"role": "system", "content": DOC_SPEC_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )
    spec = _extract_json(reply) or {}
    # Normalize / fill defaults
    if fmt:
        spec["type"] = fmt
    spec.setdefault("type", "pdf")
    if prev_spec and not spec.get("type"):
        spec["type"] = prev_spec.get("type", "pdf")
    spec.setdefault("title", "Document")
    spec.setdefault("filename", spec.get("title") or "document")
    spec.setdefault("body", "")
    return spec


async def _handle_document(message, provider, intent, session_id):
    """Build a document and return (assistant_text, filename). Raises on failure."""
    prev = _LAST_DOC_SPEC.get(session_id) if (session_id and intent.get("is_edit")) else None
    fmt = intent.get("fmt") or (prev or {}).get("type")
    language = intent.get("language") or "en"
    spec = await _generate_doc_spec(message, provider, fmt, prev, language)
    meta = build_document(spec, group="Documents")
    if session_id:
        _LAST_DOC_SPEC[session_id] = spec
    # Confirmation message also matches the target language so the chat reply
    # feels native (an Arabic-asked doc gets an Arabic confirmation).
    is_edit = intent.get("is_edit")
    if language == "ar":
        verb = "تم تحديث" if is_edit else "تم إنشاء"
        suffix = "" if is_edit else " — أو أخبرني بأي تعديل تريده."
        text = f"{verb} **{meta['filename']}** ({meta['type'].upper()}). يمكنك تحميله بالأسفل{suffix}"
    else:
        verb = "Updated" if is_edit else "Created"
        suffix = "" if is_edit else " — or tell me what to change."
        text = f"{verb} **{meta['filename']}** ({meta['type'].upper()}). You can download it below.{suffix}"
    return text, meta["filename"]


async def stream_answer(
    message: str,
    provider_name: Optional[str] = None,
    session_id: Optional[int] = None,
) -> AsyncIterator[str]:
    # Tool: universal document generation (PDF / Word / Excel / Markdown).
    doc_intent = detect_document_intent(message)
    if doc_intent:
        try:
            provider = get_provider(provider_name)
            yield _ev({"type": "provider", "id": provider.id, "label": provider.label})
            text, filename = await _handle_document(message, provider, doc_intent, session_id)
            yield _ev({"type": "sources", "sources": []})
            yield _ev({"type": "token", "content": text})
            yield _ev({"type": "done", "answer": text, "generated_file": filename})
            return
        except LLMError as e:
            yield _ev({"type": "error", "message": str(e)})
            return
        except Exception as e:
            logger.exception("Document generation failed")
            yield _ev({"type": "error", "message": f"Could not build the document: {e}"})
            return

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
