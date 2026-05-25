"""Company-data categorization.

Three canonical folders live under `company_data/`:
    HR/
    Accounts/
    Operations and Project/

Files are auto-routed by filename keywords (e.g. "employees.xlsx" -> HR).
Anything ambiguous falls back to `DEFAULT_CATEGORY`. Users can also pass
an explicit `category` on upload to override.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Dict, List, Optional

from .config import settings
from .logger import logger

CATEGORIES: List[str] = ["HR", "Accounts", "Operations and Project"]
DEFAULT_CATEGORY = "Operations and Project"

# Keyword catalogue per category. Lowercased substring match against filename.
CATEGORY_RULES: Dict[str, List[str]] = {
    "HR": [
        "employee", "employees", "hr", "personnel", "staff", "payroll",
        "salary", "leave", "attendance", "vacation", "recruit", "recruitment",
        "training", "iqama", "badge", "warning", "termination", "resign",
        "interview", "promotion", "appraisal", "performance",
    ],
    "Accounts": [
        "invoice", "receipt", "payment", "ledger", "account", "accounts",
        "finance", "financial", "expense", "expenses", "budget", "tax",
        "vat", "balance", "income", "revenue", "billing", "audit",
        "cashflow", "p&l", "pnl", "purchase",
    ],
    "Operations and Project": [
        "project", "contract", "contracts", "proposal", "sow", "plan",
        "schedule", "operation", "operations", "vendor", "supplier",
        "site", "delivery", "milestone", "report", "spec", "scope",
        "kpi", "rfp", "rfq", "policy", "procedure",
    ],
}


def safe_category(name: str) -> str:
    """Return a valid category name (case-insensitive match) or raise ValueError."""
    n = (name or "").strip()
    for c in CATEGORIES:
        if c.lower() == n.lower():
            return c
    raise ValueError(
        f"Invalid category '{name}'. Allowed: {CATEGORIES}"
    )


def classify_filename(filename: str) -> tuple[str, int]:
    """Score-based filename classifier. Returns (best_category, score).
    Score ≥ 3 ≈ confident, ≤ 2 ≈ ambiguous (caller should ask the AI).
    """
    name = (filename or "").lower()
    if not name:
        return DEFAULT_CATEGORY, 0
    bare = re.sub(r"\.[^.]+$", "", name)
    tokens = set(re.findall(r"[a-z0-9]+", bare))

    scores: Dict[str, int] = {cat: 0 for cat in CATEGORIES}
    for cat, keywords in CATEGORY_RULES.items():
        for kw in keywords:
            if " " in kw:
                if kw in name:
                    scores[cat] += 2
            else:
                if kw in tokens:
                    scores[cat] += 2
                elif kw in name:
                    scores[cat] += 1

    best = max(scores, key=lambda c: (scores[c], -CATEGORIES.index(c)))
    return best, scores[best]


def classify(filename: str) -> str:
    """Keyword-only classification (no AI). Used for the startup migration of
    pre-existing flat files. For new uploads, prefer `classify_smart`."""
    best, score = classify_filename(filename)
    return best if score > 0 else DEFAULT_CATEGORY


# --- AI-powered classification --------------------------------------------

SNIPPET_CHARS = 2500
KEYWORD_CONFIDENCE = 3   # score ≥ this means we trust the filename match


def extract_snippet(path: Path) -> str:
    """Pull a short content preview for AI classification."""
    # Local import — `loaders` imports `config` which we already use, but
    # categories.py is imported very early so we keep this lazy.
    from .loaders import load_file
    records = load_file(path)
    if not records:
        return f"(empty file: {path.name})"
    parts: List[str] = []
    total = 0
    for text, _meta in records:
        if not text:
            continue
        room = SNIPPET_CHARS - total
        if room <= 0:
            break
        chunk = text[:room].strip()
        if chunk:
            parts.append(chunk)
            total += len(chunk)
    return "\n".join(parts).strip() or path.name


async def classify_with_ai(filename: str, snippet: str) -> str:
    """Ask DeepSeek to pick exactly one category. Falls back to DEFAULT if
    the model returns something unparseable or the API errors out."""
    from .deepseek import chat_completion, DeepSeekError  # lazy import

    cats_block = "\n".join(f"- {c}" for c in CATEGORIES)
    sys_msg = (
        "You are a strict file-routing assistant for a company knowledge base. "
        "You will receive a filename and a short preview of the file content. "
        "Choose EXACTLY ONE category name from the allowed list. Reply with "
        "the category name only — no quotes, no punctuation, no explanation."
    )
    user_msg = (
        f"Allowed categories (pick exactly one):\n{cats_block}\n\n"
        f"Filename: {filename}\n\n"
        f"Content preview (first ~2.5KB):\n{snippet[:SNIPPET_CHARS]}\n\n"
        "Category:"
    )
    try:
        reply = await chat_completion(
            [
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
        )
    except DeepSeekError as e:
        logger.warning(f"AI classify failed for {filename}: {e}")
        return DEFAULT_CATEGORY

    answer = (reply or "").strip().splitlines()[0].strip().strip(".:,;\"'`")
    # Exact (case-insensitive) match first
    for c in CATEGORIES:
        if c.lower() == answer.lower():
            return c
    # Loose substring (model sometimes adds "the" or punctuation)
    low = answer.lower()
    for c in CATEGORIES:
        if c.lower() in low:
            return c
    logger.warning(f"AI classify gave unrecognized '{answer}' for {filename}; using {DEFAULT_CATEGORY}")
    return DEFAULT_CATEGORY


async def classify_smart(path: Path) -> tuple[str, str]:
    """Best-effort classification.

    Returns (category, method) where method is 'keyword' or 'ai'. Keyword
    wins instantly when the filename is obvious (score ≥ 3) — otherwise we
    extract a content preview and ask the LLM.
    """
    best, score = classify_filename(path.name)
    if score >= KEYWORD_CONFIDENCE:
        return best, "keyword"
    snippet = extract_snippet(path)
    cat = await classify_with_ai(path.name, snippet)
    return cat, "ai"


def ensure_dirs() -> None:
    base = settings.company_data_path
    base.mkdir(parents=True, exist_ok=True)
    for cat in CATEGORIES:
        (base / cat).mkdir(parents=True, exist_ok=True)


def migrate_flat_files() -> int:
    """Move any loose files in company_data/ root into the right category folder.
    Returns the number of files moved. Safe to run on every startup.
    """
    base = settings.company_data_path
    if not base.exists():
        return 0
    ensure_dirs()
    moved = 0
    for p in list(base.iterdir()):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        cat = classify(p.name)
        target_dir = base / cat
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / p.name
        if target.exists():
            # avoid clobber: skip; existing file wins
            logger.warning(f"Skipped migration of {p.name}: already exists in {cat}")
            continue
        shutil.move(str(p), str(target))
        moved += 1
        logger.info(f"Migrated {p.name} -> {cat}/")
    return moved


def category_of_path(path: Path) -> Optional[str]:
    """Return the category name for a file that lives under company_data/<Category>/..."""
    base = settings.company_data_path
    try:
        rel = path.resolve().relative_to(base.resolve())
    except ValueError:
        return None
    parts = rel.parts
    if not parts:
        return None
    head = parts[0]
    for c in CATEGORIES:
        if head == c:
            return c
    return None


def find_by_name(filename: str) -> Optional[Path]:
    """Locate a file by its basename across all category folders."""
    base = settings.company_data_path
    safe = Path(filename).name
    # Look in each category first, then in root as a fallback.
    for cat in CATEGORIES:
        p = base / cat / safe
        if p.exists() and p.is_file():
            return p
    p = base / safe
    if p.exists() and p.is_file():
        return p
    return None
