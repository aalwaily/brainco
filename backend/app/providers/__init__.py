"""Pluggable LLM providers.

Each provider implements the same interface (`LLMProvider`) and is
registered in `_PROVIDERS`. The chat layer asks for a provider by name
(taken from the request, otherwise from `settings.LLM_PROVIDER`).
"""
from __future__ import annotations

from typing import Dict, List, Optional

from ..config import settings
from .base import LLMProvider, LLMError
from .deepseek import DeepSeekProvider
from .gemini import GeminiProvider


_PROVIDERS: Dict[str, LLMProvider] = {
    "deepseek": DeepSeekProvider(),
    "gemini":   GeminiProvider(),
}


def list_providers() -> List[Dict]:
    """Return metadata for every registered provider — used by the UI to
    populate the Settings dropdown."""
    return [
        {
            "id": p.id,
            "label": p.label,
            "model": p.model,
            "available": p.is_available(),
        }
        for p in _PROVIDERS.values()
    ]


def get_provider(name: Optional[str] = None) -> LLMProvider:
    key = (name or settings.LLM_PROVIDER or "deepseek").strip().lower()
    p = _PROVIDERS.get(key)
    if not p:
        raise LLMError(f"Unknown LLM provider '{key}'. Available: {list(_PROVIDERS)}")
    if not p.is_available():
        raise LLMError(
            f"Provider '{key}' is not configured (missing API key). "
            f"Add it to backend/.env and restart."
        )
    return p


__all__ = ["LLMProvider", "LLMError", "get_provider", "list_providers"]
