"""Data access for the ``users`` table. SQL lives here only (BUILD_SPEC §5).

Every query is parameterized (``%s``) — never string-formatted — so it is
injection-safe. Reads use the pooled ``query`` helper; writes that must be
atomic use ``transaction``.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from app.db.connection import query, transaction

# Columns returned for an authenticated user (never the password hash).
_PUBLIC_COLS = (
    "id, email, username, role, trust_score, default_lat, default_lng, created_at"
)


def get_by_id(user_id: int) -> Optional[dict[str, Any]]:
    rows = query(f"SELECT {_PUBLIC_COLS} FROM users WHERE id = %s", [user_id])
    return rows[0] if rows else None


def get_by_email(email: str) -> Optional[dict[str, Any]]:
    """Full row INCLUDING auth fields (password_hash, lockout) — for login only."""
    rows = query("SELECT * FROM users WHERE lower(email) = lower(%s)", [email])
    return rows[0] if rows else None


def username_exists(username: str) -> bool:
    return bool(query("SELECT 1 FROM users WHERE lower(username) = lower(%s)", [username]))


def email_exists(email: str) -> bool:
    return bool(query("SELECT 1 FROM users WHERE lower(email) = lower(%s)", [email]))


def create_user(
    *,
    email: str,
    password_hash: str,
    username: str,
    role: str,
    default_lat: Optional[float],
    default_lng: Optional[float],
) -> dict[str, Any]:
    """Insert a user and return its public row."""
    with transaction() as conn:
        row = conn.execute(
            f"""INSERT INTO users (email, password_hash, username, role, default_lat, default_lng)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING {_PUBLIC_COLS}""",
            [email, password_hash, username, role, default_lat, default_lng],
        ).fetchone()
    return row


def record_failed_login(user_id: int, locked_until: Optional[dt.datetime]) -> None:
    """Increment the failed-login counter and optionally set a lockout time."""
    with transaction() as conn:
        conn.execute(
            "UPDATE users SET failed_logins = failed_logins + 1, locked_until = %s WHERE id = %s",
            [locked_until, user_id],
        )


def reset_login_state(user_id: int) -> None:
    """Clear the failed-login counter + lockout after a successful login."""
    with transaction() as conn:
        conn.execute(
            "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = %s",
            [user_id],
        )


def update_profile(
    user_id: int,
    *,
    username: Optional[str],
    default_lat: Optional[float],
    default_lng: Optional[float],
) -> dict[str, Any]:
    """Patch profile fields; COALESCE keeps unspecified fields unchanged."""
    with transaction() as conn:
        row = conn.execute(
            f"""UPDATE users SET
                    username    = COALESCE(%s, username),
                    default_lat = COALESCE(%s, default_lat),
                    default_lng = COALESCE(%s, default_lng)
                WHERE id = %s
                RETURNING {_PUBLIC_COLS}""",
            [username, default_lat, default_lng, user_id],
        ).fetchone()
    return row


def update_password(user_id: int, password_hash: str) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s", [password_hash, user_id]
        )
