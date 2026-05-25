"""Semantic-ish chunker.

Splits text along the most meaningful boundary that fits:
  1. paragraphs (blank line separated)
  2. line breaks
  3. sentence ends (. ؟ ! ; :)
  4. whitespace
  5. raw character cut (last resort)

Adds a small overlap between adjacent chunks so a sentence near the
boundary isn't lost to retrieval.
"""
from __future__ import annotations

import re
from typing import List

# Sentence boundary matchers — keep Arabic/Latin punctuation.
_SENTENCE_SPLIT = re.compile(r"(?<=[\.\!\?\؟\؛])\s+")


def _split_paragraphs(text: str) -> List[str]:
    return [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]


def _split_lines(text: str) -> List[str]:
    return [l.strip() for l in text.split("\n") if l.strip()]


def _split_sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]


def _greedy_pack(units: List[str], chunk_size: int, overlap: int, joiner: str) -> List[str]:
    """Pack small `units` into chunks ≤ chunk_size, keeping last `overlap`
    chars on each chunk's tail to seed the next one."""
    chunks: List[str] = []
    buf = ""
    for u in units:
        if not buf:
            buf = u
            continue
        candidate = buf + joiner + u
        if len(candidate) <= chunk_size:
            buf = candidate
            continue
        chunks.append(buf)
        # carry overlap from the previous chunk's tail
        if overlap > 0 and len(buf) > overlap:
            buf = buf[-overlap:].lstrip() + joiner + u
        else:
            buf = u
    if buf:
        chunks.append(buf)
    return chunks


def _hard_split(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Char-based fallback for a single unit that's still larger than chunk_size."""
    out: List[str] = []
    n = len(text)
    start = 0
    step = max(1, chunk_size - overlap)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            window_start = max(end - 120, start)
            break_at = text.rfind(" ", window_start, end)
            if break_at != -1 and break_at > start:
                end = break_at
        piece = text[start:end].strip()
        if piece:
            out.append(piece)
        if end >= n:
            break
        start = end - overlap if end - overlap > start else start + step
    return out


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    # 1) Paragraphs that already fit get kept whole; oversize ones recurse.
    units: List[str] = []
    for para in _split_paragraphs(text):
        if len(para) <= chunk_size:
            units.append(para)
            continue
        # paragraph too long → split on sentences, then on words
        sentences = _split_sentences(para)
        if any(len(s) > chunk_size for s in sentences):
            # last resort: hard char split
            for big in sentences:
                if len(big) <= chunk_size:
                    units.append(big)
                else:
                    units.extend(_hard_split(big, chunk_size, overlap))
        else:
            units.extend(_greedy_pack(sentences, chunk_size, overlap, " "))

    # 2) Pack the units into max-size chunks (paragraphs are joined back with
    #    blank lines so the model still sees the original structure).
    return _greedy_pack(units, chunk_size, overlap, "\n\n")
