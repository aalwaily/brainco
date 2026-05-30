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

# Explicit language-override phrases. If any of these appear, the user is
# overriding the script of their message and asking for a specific output
# language (e.g. user types in English but says "make it Arabic").
_LANG_OVERRIDE_AR = [
    "in arabic", "بالعربي", "بالعربية", "بالعربيه", "باللغه العربيه",
    "باللغة العربية", "اجعله عربي", "اجعله بالعربي", "عربي", "عربى",
    "خليه عربي", "خليها عربي", "as arabic",
]
_LANG_OVERRIDE_EN = [
    "in english", "بالانجليزي", "بالإنجليزي", "بالانجليزية", "بالإنجليزية",
    "باللغه الانجليزيه", "باللغة الإنجليزية", "اجعله انجليزي", "اجعله إنجليزي",
    "إنجليزي", "انجليزي", "خليه انجليزي", "خليها انجليزي", "as english",
]

# Arabic Unicode block — used to detect the "natural" script of the message.
_ARABIC_RANGE = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")


def _matches_any(text: str, words) -> bool:
    return any(re.search(r"(?<!\w)" + re.escape(w) + r"(?!\w)", text) for w in words)


def _contains_phrase(text: str, phrases) -> bool:
    """Loose substring match (phrases may contain spaces, so word-boundary regex
    isn't reliable across Latin/Arabic mixes)."""
    return any(p in text for p in phrases)


def infer_format(text: str) -> Optional[str]:
    low = text.lower()
    for pat, fmt in _FORMAT_MAP:
        if re.search(pat, low):
            return fmt
    return None


def detect_language(message: str) -> str:
    """Pick the target language for a generated document.

    Rules (in order):
      1. Explicit override in the message ("in Arabic" / "بالإنجليزي") wins.
      2. Otherwise, the script of the message body decides:
         - any meaningful Arabic char count → 'ar'
         - else → 'en'

    Returns 'ar' or 'en'.
    """
    if not message:
        return "en"
    low = message.lower()

    # 1. Explicit override wins regardless of script.
    if _contains_phrase(low, _LANG_OVERRIDE_AR):
        return "ar"
    if _contains_phrase(low, _LANG_OVERRIDE_EN):
        return "en"

    # 2. Script detection: count Arabic vs Latin letters in the *non-format*
    #    portion of the message (so "make a pdf" with one Arabic word still
    #    correctly reads as Arabic, but a 99%-English message with the word
    #    "pdf" doesn't get misclassified by stray characters).
    ar_chars = len(_ARABIC_RANGE.findall(message))
    en_chars = len(re.findall(r"[A-Za-z]", message))
    if ar_chars >= 3 and ar_chars >= en_chars * 0.3:
        return "ar"
    if ar_chars > en_chars:
        return "ar"
    return "en"


def detect_document_intent(message: str) -> Optional[Dict]:
    """Return {fmt, is_edit, language} if the user wants a document built, else None.

    Rule: needs a creation/edit verb AND (an explicit format OR a document noun).
    The `language` field is the inferred output language ('ar' | 'en').
    """
    if not message:
        return None
    low = message.lower()
    fmt = infer_format(low)
    has_create = _matches_any(low, [v.lower() for v in _CREATE_VERBS])
    has_edit   = _matches_any(low, [v.lower() for v in _EDIT_VERBS])
    has_noun   = _matches_any(low, [n.lower() for n in _DOC_NOUNS])
    language   = detect_language(message)

    # Editing an existing doc: "عدّل التاريخ في الإنذار" / "change the date in the pdf"
    if has_edit and (fmt or has_noun):
        return {"fmt": fmt, "is_edit": True, "language": language}

    # Creating a new doc: needs a creation verb + (format or doc noun)
    if has_create and (fmt or has_noun):
        return {"fmt": fmt, "is_edit": False, "language": language}

    # Strong format-only signal: "... as PDF" / "بصيغة pdf" with a doc noun nearby
    if fmt and has_noun:
        return {"fmt": fmt, "is_edit": False, "language": language}

    return None
