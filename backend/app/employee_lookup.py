"""Exact-match employee lookup tool.

RAG (cosine over MiniLM) is unreliable when the question targets a single
row inside a large, homogeneous sheet (e.g. 800+ employees with similar
iqama numbers). This module gives the chat layer a deterministic fallback:
if the user mentions an iqama, badge, or 'employee <id>' token, we pull
the exact row(s) straight from the spreadsheet and feed them to the model
as additional context.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Dict, List, Optional

import pandas as pd

from .config import settings
from .logger import logger

EMPLOYEES_FILENAME = "employees.xlsx"

# Iqama numbers are typically 10 digits; we accept 7-12 to be safe.
_IQAMA_RE = re.compile(r"\b(\d{7,12})\b")
# Badge formats vary but our sample uses "SA-1234"; allow letters-dash-digits.
_BADGE_RE = re.compile(r"\b([A-Za-z]{1,5}-\d{2,6})\b")
# Explicit "employee <id>" / "emp <id>" / "id <id>"
_EXPLICIT_RE = re.compile(
    r"\b(?:employee|emp|iqama|id|badge)\s*[:#]?\s*([A-Za-z0-9_-]+)", re.IGNORECASE
)


@lru_cache(maxsize=1)
def _load() -> Optional[pd.DataFrame]:
    path = settings.company_data_path / EMPLOYEES_FILENAME
    if not path.exists():
        return None
    try:
        return pd.read_excel(path).fillna("")
    except Exception as e:
        logger.error(f"employee_lookup: failed reading {path}: {e}")
        return None


def _pick_col(cols: Dict[str, str], *exact: str, contains: Optional[str] = None) -> Optional[str]:
    for c in exact:
        if c in cols:
            return cols[c]
    if contains:
        for k, c in cols.items():
            if contains in k:
                return c
    return None


def _row_to_record(row: pd.Series, source: str, row_index: int) -> Dict:
    fields = {k: ("" if pd.isna(v) else str(v)) for k, v in row.to_dict().items()}
    text = " | ".join(f"{k}: {v}" for k, v in fields.items() if str(v).strip())
    return {
        "text": text,
        "metadata": {
            "source": source,
            "type": "xlsx",
            "row": row_index + 2,  # account for header row
        },
        "distance": 0.0,
    }


def extract_identifiers(message: str) -> List[str]:
    """Return identifiers worth looking up, in priority order."""
    ids: List[str] = []
    seen: set[str] = set()

    def push(v: Optional[str]) -> None:
        if not v:
            return
        v = v.strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            ids.append(v)

    for m in _EXPLICIT_RE.finditer(message):
        push(m.group(1))
    for m in _IQAMA_RE.finditer(message):
        push(m.group(1))
    for m in _BADGE_RE.finditer(message):
        push(m.group(1))
    return ids


def lookup(identifiers: List[str]) -> List[Dict]:
    """Resolve identifiers against employees.xlsx. Returns chunk-shaped dicts."""
    df = _load()
    if df is None or df.empty or not identifiers:
        return []
    cols = {c.lower().strip(): c for c in df.columns}
    iqama_col = _pick_col(cols, "iqama", contains="iqama")
    name_col  = _pick_col(cols, "name", "employee name", "full name", contains="name")
    badge_col = _pick_col(cols, "badge", contains="badge")

    out: List[Dict] = []
    seen_idx: set[int] = set()

    def add_matches(mask: pd.Series) -> None:
        for idx, row in df[mask].head(5).iterrows():
            if idx in seen_idx:
                continue
            seen_idx.add(idx)
            out.append(_row_to_record(row, EMPLOYEES_FILENAME, idx))

    for ident in identifiers:
        if iqama_col:
            add_matches(df[iqama_col].astype(str).str.strip() == ident)
        if badge_col:
            add_matches(df[badge_col].astype(str).str.strip().str.lower() == ident.lower())
        if name_col and not ident.isdigit():
            add_matches(
                df[name_col].astype(str).str.contains(ident, case=False, na=False, regex=False)
            )
    return out


def resolve(message: str) -> List[Dict]:
    return lookup(extract_identifiers(message))
