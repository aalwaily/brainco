"""Detect when the user wants a downloadable document built, and infer the
target format. Kept separate from chat_service so it's easy to test/tune.
"""
from __future__ import annotations

import re
from typing import Dict, Optional

# Action verbs that signal "produce something" (EN + AR).
_CREATE_VERBS = [
    "create", "make", "generate", "write", "build", "design", "draft",
    "produce", "export", "prepare", "compose", "issue",
    "أنشئ", "انشئ", "اكتب", "أكتب", "اعمل", "سوي", "سوّي", "صمم", "صمّم",
    "جهز", "جهّز", "حضّر", "حضر", "اصدر", "أصدر", "صدر", "صمملي", "اعملي",
    "ابغى", "ابي", "أبي", "أبغى", "عطني", "اعطني",
]

# Document nouns / formats (EN + AR).
_DOC_NOUNS = [
    "document", "doc", "file", "report", "letter", "memo", "warning",
    "contract", "invoice", "certificate", "spreadsheet", "sheet", "table",
    "form", "agreement", "receipt", "statement", "policy",
    "ملف", "مستند", "وثيقة", "تقرير", "خطاب", "رساله", "رسالة", "إنذار", "انذار",
    "عقد", "فاتورة", "شهادة", "جدول", "نموذج", "اتفاقية", "إيصال", "ايصال",
    "مذكرة", "كشف", "بيان", "سياسة", "محضر",
]

# Explicit format keywords → file type.
_FORMAT_MAP = [
    (r"\bpdf\b|بي\s*دي\s*اف|بيدياف", "pdf"),
    (r"\bword\b|\bdocx?\b|وورد|ورد", "docx"),
    (r"\bexcel\b|\bxlsx?\b|اكسل|إكسل|اكسيل|spreadsheet|جدول\s*بيانات", "xlsx"),
    (r"\bmarkdown\b|\bmd\b|ماركداون", "md"),
    (r"\btxt\b|نص\s*عادي|plain\s*text", "txt"),
]

_EDIT_VERBS = [
    "edit", "change", "update", "modify", "revise", "fix", "adjust", "replace",
    "عدل", "عدّل", "غير", "غيّر", "تعديل", "صحح", "صحّح", "حدّث", "حدث", "بدّل", "بدل",
]


def _matches_any(text: str, words) -> bool:
    return any(re.search(r"(?<!\w)" + re.escape(w) + r"(?!\w)", text) for w in words)


def infer_format(text: str) -> Optional[str]:
    low = text.lower()
    for pat, fmt in _FORMAT_MAP:
        if re.search(pat, low):
            return fmt
    return None


def detect_document_intent(message: str) -> Optional[Dict]:
    """Return {fmt, is_edit} if the user wants a document built, else None.

    Rule: needs a creation/edit verb AND (an explicit format OR a document noun).
    """
    if not message:
        return None
    low = message.lower()
    fmt = infer_format(low)
    has_create = _matches_any(low, [v.lower() for v in _CREATE_VERBS])
    has_edit   = _matches_any(low, [v.lower() for v in _EDIT_VERBS])
    has_noun   = _matches_any(low, [n.lower() for n in _DOC_NOUNS])

    # Editing an existing doc: "عدّل التاريخ في الإنذار" / "change the date in the pdf"
    if has_edit and (fmt or has_noun):
        return {"fmt": fmt, "is_edit": True}

    # Creating a new doc: needs a creation verb + (format or doc noun)
    if has_create and (fmt or has_noun):
        return {"fmt": fmt, "is_edit": False}

    # Strong format-only signal: "... as PDF" / "بصيغة pdf" with a doc noun nearby
    if fmt and has_noun:
        return {"fmt": fmt, "is_edit": False}

    return None
