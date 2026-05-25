from __future__ import annotations

import json
from typing import AsyncIterator, Dict, List

import httpx

from .config import settings
from .logger import logger


class DeepSeekError(RuntimeError):
    pass


async def chat_completion(messages: List[Dict[str, str]], temperature: float = 0.2) -> str:
    if not settings.DEEPSEEK_API_KEY:
        raise DeepSeekError(
            "DEEPSEEK_API_KEY is not set. Add it to backend/.env"
        )
    url = f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"].strip()
    except httpx.HTTPStatusError as e:
        body = e.response.text[:500] if e.response is not None else ""
        logger.error(f"DeepSeek HTTP {e.response.status_code}: {body}")
        raise DeepSeekError(f"DeepSeek API error {e.response.status_code}: {body}")
    except httpx.HTTPError as e:
        logger.error(f"DeepSeek transport error: {e}")
        raise DeepSeekError(f"DeepSeek transport error: {e}")
    except (KeyError, IndexError) as e:
        logger.error(f"DeepSeek malformed response: {e}")
        raise DeepSeekError("Malformed response from DeepSeek")


async def stream_chat_completion(
    messages: List[Dict[str, str]],
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    """Yield content deltas from DeepSeek's SSE stream."""
    if not settings.DEEPSEEK_API_KEY:
        raise DeepSeekError("DEEPSEEK_API_KEY is not set. Add it to backend/.env")
    url = f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode("utf-8", "ignore")[:500]
                    logger.error(f"DeepSeek HTTP {r.status_code}: {body}")
                    raise DeepSeekError(f"DeepSeek API error {r.status_code}: {body}")
                async for raw in r.aiter_lines():
                    if not raw:
                        continue
                    line = raw.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    try:
                        delta = obj["choices"][0].get("delta") or {}
                        chunk = delta.get("content")
                        if chunk:
                            yield chunk
                    except (KeyError, IndexError):
                        continue
    except httpx.HTTPError as e:
        logger.error(f"DeepSeek stream transport error: {e}")
        raise DeepSeekError(f"DeepSeek stream transport error: {e}")
