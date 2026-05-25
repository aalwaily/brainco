"""Google Gemini provider via the official `google-genai` SDK."""
from __future__ import annotations

import re
from typing import AsyncIterator, Dict, List, Optional, Tuple

from ..config import settings
from ..logger import logger
from .base import LLMError, LLMProvider


def _parse_gemini_error(exc: Exception) -> LLMError:
    """Turn a raw google-genai exception into a clean LLMError. Handles 429
    rate-limit responses specifically — extracts retry seconds + a short
    user-facing message."""
    msg = str(exc)
    status = 0
    # google-genai surfaces HTTP status either on the exception or in the message.
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if isinstance(code, int):
        status = code
    if not status:
        m = re.search(r"\b(\d{3})\b", msg)
        if m:
            try: status = int(m.group(1))
            except ValueError: pass

    retry_s = 0.0
    m = re.search(r"retry in ([\d.]+)\s*s", msg, re.IGNORECASE) or \
        re.search(r"retryDelay['\"]?:\s*['\"](\d+)s", msg) or \
        re.search(r"retry_delay\s*[:=]\s*(\d+)", msg, re.IGNORECASE)
    if m:
        try: retry_s = float(m.group(1))
        except ValueError: pass

    if status == 429:
        if retry_s > 0:
            friendly = (
                f"Google Gemini hit its rate limit (try again in ~{int(retry_s)}s). "
                f"Free tier for {settings.GEMINI_MODEL} is very low — switch to a "
                "higher-quota model or use the DeepSeek provider."
            )
        else:
            friendly = (
                "Google Gemini rate limit reached. Switch to DeepSeek in Settings, "
                "or upgrade your Gemini plan."
            )
        return LLMError(friendly, status=429, retry_after_s=retry_s)

    # generic
    short = msg.splitlines()[0][:200]
    return LLMError(f"Gemini error: {short}", status=status, retry_after_s=retry_s)


def _convert_messages(
    messages: List[Dict[str, str]],
) -> Tuple[Optional[str], List[Dict]]:
    """Translate an OpenAI-style messages list (with `system` / `user` /
    `assistant` roles) into Gemini's (system_instruction, contents) shape.

    Gemini uses 'user' and 'model' roles, with the system prompt passed
    separately on the request `config` rather than as a message.
    """
    system_parts: List[str] = []
    contents: List[Dict] = []
    for m in messages:
        role = m.get("role")
        text = m.get("content", "") or ""
        if not text:
            continue
        if role == "system":
            system_parts.append(text)
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})
        else:  # user / default
            contents.append({"role": "user", "parts": [{"text": text}]})
    system = "\n\n".join(system_parts) if system_parts else None
    return system, contents


class GeminiProvider(LLMProvider):
    id = "gemini"
    label = "Google Gemini"

    def __init__(self):
        self._client = None

    @property
    def model(self) -> str:
        return settings.GEMINI_MODEL

    def is_available(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    def _ensure_client(self):
        if self._client is not None:
            return self._client
        try:
            from google import genai  # type: ignore
        except Exception as e:
            raise LLMError(f"google-genai SDK not installed: {e}")
        if not settings.GEMINI_API_KEY:
            raise LLMError("GEMINI_API_KEY is not set.")
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self._client

    # ----------------------------------------------------------------------

    async def chat(self, messages: List[Dict[str, str]], temperature: float = 0.2) -> str:
        client = self._ensure_client()
        system, contents = _convert_messages(messages)
        try:
            resp = await client.aio.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config={
                    "temperature": temperature,
                    **({"system_instruction": system} if system else {}),
                },
            )
            text = (getattr(resp, "text", None) or "").strip()
            if not text:
                # Fallback: walk candidates
                cand = getattr(resp, "candidates", None) or []
                if cand:
                    parts = getattr(cand[0].content, "parts", None) or []
                    text = "".join(getattr(p, "text", "") or "" for p in parts).strip()
            return text
        except Exception as e:
            err = _parse_gemini_error(e)
            logger.warning(f"Gemini chat failed: {err}")
            raise err

    async def stream(
        self, messages: List[Dict[str, str]], temperature: float = 0.2,
    ) -> AsyncIterator[str]:
        client = self._ensure_client()
        system, contents = _convert_messages(messages)
        try:
            stream = await client.aio.models.generate_content_stream(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config={
                    "temperature": temperature,
                    **({"system_instruction": system} if system else {}),
                },
            )
            async for chunk in stream:
                t = getattr(chunk, "text", None)
                if t:
                    yield t
        except Exception as e:
            err = _parse_gemini_error(e)
            logger.warning(f"Gemini stream failed: {err}")
            raise err
