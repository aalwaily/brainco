from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .config import settings


# --- Schema ----------------------------------------------------------------
# Sessions are ChatGPT-style conversations. Each conversation has many
# messages. Older code wrote to `chat_history` (one row per Q/A); we keep
# that table around for legacy compat but new chats land in the two-table
# model below.
SCHEMA_NEW = """
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    role        TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    sources     TEXT,
    generated_file TEXT,
    created_at  TEXT    NOT NULL,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
"""

SCHEMA_LEGACY = """
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources TEXT,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _connect():
    conn = sqlite3.connect(str(settings.sqlite_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(SCHEMA_LEGACY + SCHEMA_NEW)
        conn.commit()


# --- Sessions API ---------------------------------------------------------

def _title_from_message(message: str) -> str:
    one_line = " ".join((message or "").split())
    return (one_line[:60] + "…") if len(one_line) > 60 else (one_line or "New chat")


def create_session(title: str) -> int:
    init_db()
    now = _now()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO chat_sessions (title, created_at, updated_at) VALUES (?, ?, ?)",
            (title or "New chat", now, now),
        )
        conn.commit()
        return cur.lastrowid


def add_message(
    session_id: int,
    role: str,
    content: str,
    sources: str = "",
    generated_file: Optional[str] = None,
) -> int:
    init_db()
    now = _now()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, sources, generated_file, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, role, content, sources, generated_file, now),
        )
        conn.execute(
            "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        conn.commit()
        return cur.lastrowid


def list_sessions(limit: int = 80) -> List[Dict]:
    init_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.title, s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count,
                   (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY id LIMIT 1) AS first_message
            FROM chat_sessions s
            ORDER BY s.updated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_session(session_id: int) -> Optional[Dict]:
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        return dict(row) if row else None


def get_session_messages(session_id: int) -> List[Dict]:
    init_db()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, role, content, sources, generated_file, created_at "
            "FROM chat_messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def rename_session(session_id: int, title: str) -> int:
    init_db()
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
            (title or "New chat", _now(), session_id),
        )
        conn.commit()
        return cur.rowcount


def delete_session(session_id: int) -> int:
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
        cur = conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        conn.commit()
        return cur.rowcount


def clear_all_sessions() -> int:
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM chat_messages")
        cur = conn.execute("DELETE FROM chat_sessions")
        conn.commit()
        return cur.rowcount


def truncate_after_message(session_id: int, message_id: int) -> int:
    """Delete every message in `session_id` whose id is > `message_id`.
    Used by Edit (keep up to the edited user message) and Regenerate
    (drop the last assistant reply so a fresh one can replace it)."""
    init_db()
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM chat_messages WHERE session_id = ? AND id > ?",
            (session_id, message_id),
        )
        conn.commit()
        return cur.rowcount


def last_message(session_id: int, role: Optional[str] = None) -> Optional[Dict]:
    init_db()
    with _connect() as conn:
        if role:
            row = conn.execute(
                "SELECT id, role, content, sources, generated_file, created_at "
                "FROM chat_messages WHERE session_id = ? AND role = ? ORDER BY id DESC LIMIT 1",
                (session_id, role),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id, role, content, sources, generated_file, created_at "
                "FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 1",
                (session_id,),
            ).fetchone()
        return dict(row) if row else None


def delete_message(session_id: int, message_id: int) -> int:
    init_db()
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM chat_messages WHERE session_id = ? AND id = ?",
            (session_id, message_id),
        )
        conn.commit()
        return cur.rowcount


# --- Legacy (per-Q/A) — kept for back-compat, no longer used by the new UI ---

def save(question: str, answer: str, sources: str = "") -> int:
    init_db()
    now = _now()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO chat_history (question, answer, sources, created_at) VALUES (?, ?, ?, ?)",
            (question, answer, sources, now),
        )
        conn.commit()
        return cur.lastrowid


def list_history(limit: int = 50) -> List[Dict]:
    init_db()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, question, answer, sources, created_at FROM chat_history ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def clear() -> int:
    init_db()
    with _connect() as conn:
        cur = conn.execute("DELETE FROM chat_history")
        conn.commit()
        return cur.rowcount


def delete(item_id: int) -> int:
    init_db()
    with _connect() as conn:
        cur = conn.execute("DELETE FROM chat_history WHERE id = ?", (item_id,))
        conn.commit()
        return cur.rowcount
