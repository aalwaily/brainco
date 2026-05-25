"""Abstract LLM provider interface."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, List


class LLMError(RuntimeError):
    """Raised by provider implementations on configuration / API failure.

    Carries optional structured info so the chat layer can decide whether
    to fall back to the other provider transparently.
    """
    def __init__(self, message: str, *, status: int = 0, retry_after_s: float = 0.0):
        super().__init__(message)
        self.status = status
        self.retry_after_s = retry_after_s

    @property
    def is_rate_limited(self) -> bool:
        return self.status == 429 or self.retry_after_s > 0


class LLMProvider(ABC):
    """Each provider exposes the same async surface so the chat layer can
    swap between OpenAI-compatible, Gemini, Anthropic, etc. without
    touching downstream code."""

    id: str          # short key used in URLs / env (e.g. "deepseek")
    label: str       # display name (e.g. "DeepSeek")
    model: str       # current model identifier

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    async def chat(self, messages: List[Dict[str, str]], temperature: float = 0.2) -> str:
        """Non-streaming chat completion. Returns the full assistant message."""

    @abstractmethod
    async def stream(
        self, messages: List[Dict[str, str]], temperature: float = 0.2,
    ) -> AsyncIterator[str]:
        """Token-streaming chat completion. Yields incremental text chunks."""
