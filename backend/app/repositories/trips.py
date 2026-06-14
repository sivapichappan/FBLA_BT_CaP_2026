"""Data access for saved trips (SQL only, §5).

``stops`` is a JSONB snapshot of the planned itinerary — like favorites, a
saved trip keeps rendering even if a stop's source business later disappears.
"""

from __future__ import annotations

from typing import Any, Optional

from psycopg.types.json import Json

from app.db.connection import query, transaction


def create(user_id: int, title: str, params: dict, stops: list[dict]) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO trips (user_id, title, params, stops)
               VALUES (%s, %s, %s, %s)
               RETURNING id, title, params, stops, created_at""",
            [user_id, title, Json(params), Json(stops)],
        ).fetchone()
    return row


def list_for_user(user_id: int) -> list[dict[str, Any]]:
    return query(
        "SELECT id, title, params, stops, created_at FROM trips WHERE user_id = %s ORDER BY created_at DESC",
        [user_id],
    )


def get(trip_id: int, user_id: int) -> Optional[dict[str, Any]]:
    rows = query(
        "SELECT id, title, params, stops, created_at FROM trips WHERE id = %s AND user_id = %s",
        [trip_id, user_id],
    )
    return rows[0] if rows else None


def delete(trip_id: int, user_id: int) -> bool:
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM trips WHERE id = %s AND user_id = %s RETURNING id",
            [trip_id, user_id],
        ).fetchone()
    return row is not None
