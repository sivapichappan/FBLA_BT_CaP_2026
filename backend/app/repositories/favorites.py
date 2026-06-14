"""Data access for favorites (SQL only, §5).

``business_ref`` is a local id as text (e.g. '9') or a Google place id
('gp_...'), so one table serves both sources. ``snapshot_json`` (JSONB) holds a
denormalized copy so a favorite survives the source being deleted.
"""

from __future__ import annotations

from typing import Any

from psycopg.types.json import Json

from app.db.connection import query, transaction


def list_for_user(user_id: int) -> list[dict[str, Any]]:
    return query(
        "SELECT id, business_ref, snapshot_json AS snapshot, created_at "
        "FROM favorites WHERE user_id = %s ORDER BY created_at DESC",
        [user_id],
    )


def is_favorited(user_id: int, business_ref: str) -> bool:
    return bool(query(
        "SELECT 1 FROM favorites WHERE user_id = %s AND business_ref = %s", [user_id, business_ref]
    ))


def add(user_id: int, business_ref: str, snapshot: dict) -> dict:
    """Upsert: favoriting again refreshes the stored snapshot.

    Trust: +2 only on a genuinely NEW favorite. ``xmax = 0`` is Postgres's
    tell for "this row was inserted, not updated, by this statement" — the
    standard way to distinguish the two arms of an upsert.
    """
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO favorites (user_id, business_ref, snapshot_json)
               VALUES (%s, %s, %s)
               ON CONFLICT (user_id, business_ref)
               DO UPDATE SET snapshot_json = EXCLUDED.snapshot_json
               RETURNING id, business_ref, snapshot_json AS snapshot, created_at,
                         (xmax = 0) AS inserted""",
            [user_id, business_ref, Json(snapshot)],
        ).fetchone()
        if row.pop("inserted"):
            conn.execute(
                "UPDATE users SET trust_score = trust_score + 2 WHERE id = %s", [user_id]
            )
    return row


def remove(user_id: int, business_ref: str) -> bool:
    """Delete a favorite; returns True if a row was removed. Trust: −2 when a
    row actually went away (floored at zero)."""
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM favorites WHERE user_id = %s AND business_ref = %s RETURNING id",
            [user_id, business_ref],
        ).fetchone()
        if row is not None:
            conn.execute(
                "UPDATE users SET trust_score = GREATEST(trust_score - 2, 0) WHERE id = %s",
                [user_id],
            )
    return row is not None
