"""Data access for concierge sessions + messages (SQL only, §5)."""

from __future__ import annotations

from typing import Any, Optional

from app.db.connection import query, transaction


def create_session(user_id: int) -> int:
    with transaction() as conn:
        row = conn.execute(
            "INSERT INTO chat_sessions (user_id) VALUES (%s) RETURNING id", [user_id]
        ).fetchone()
    return row["id"]


def get_session(session_id: int, user_id: int) -> Optional[dict[str, Any]]:
    """The session, only if it belongs to this user (no cross-user reads)."""
    rows = query(
        "SELECT id, user_id, created_at FROM chat_sessions WHERE id = %s AND user_id = %s",
        [session_id, user_id],
    )
    return rows[0] if rows else None


def add_message(session_id: int, role: str, content: str) -> None:
    with transaction() as conn:
        conn.execute(
            "INSERT INTO chat_messages (session_id, role, content) VALUES (%s, %s, %s)",
            [session_id, role, content],
        )


def recent_messages(session_id: int, limit: int = 10) -> list[dict[str, Any]]:
    """Last N messages in chronological order (the concierge context window)."""
    rows = query(
        """SELECT role, content, created_at FROM chat_messages
           WHERE session_id = %s ORDER BY created_at DESC LIMIT %s""",
        [session_id, limit],
    )
    return list(reversed(rows))
