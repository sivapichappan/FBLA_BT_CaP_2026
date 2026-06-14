"""Data access for reviews (SQL only, §5).

The create/update/delete functions each run the write **and** the business
rating re-aggregation inside ONE transaction (BUILD_SPEC §8.2), so the
denormalized ``businesses.average_rating`` / ``review_count`` can never drift
out of sync with the review rows — even under concurrent writes.
"""

from __future__ import annotations

from typing import Any, Optional

import psycopg

from app.db.connection import query, transaction

# Sort modes for the reviews list.
_SORT_SQL = {
    "recent": "r.created_at DESC",
    "rating_high": "r.rating DESC, r.created_at DESC",
    "rating_low": "r.rating ASC, r.created_at DESC",
    "helpful": "r.helpful_count DESC, r.created_at DESC",
}

_REVIEW_COLS = "r.id, r.business_id, r.user_id, u.username, r.rating, r.body, r.helpful_count, r.created_at"


def _recompute(conn: psycopg.Connection, business_id: int) -> None:
    """Recompute a business's avg rating + count from its review rows (same txn)."""
    conn.execute(
        """UPDATE businesses SET
               average_rating = COALESCE((SELECT AVG(rating)::real FROM reviews WHERE business_id = %s), 0),
               review_count   = (SELECT COUNT(*) FROM reviews WHERE business_id = %s)
           WHERE id = %s""",
        [business_id, business_id, business_id],
    )


def list_for_business(business_id: int, sort: str = "recent", limit: int = 50, offset: int = 0) -> list[dict]:
    """Reviews + each one's owner reply (LEFT JOIN: most reviews have none)."""
    order = _SORT_SQL.get(sort, _SORT_SQL["recent"])
    rows = query(
        f"""SELECT {_REVIEW_COLS},
                   rr.body AS reply_body, rr.created_at AS reply_created_at,
                   ou.username AS reply_owner
            FROM reviews r
            JOIN users u ON u.id = r.user_id
            LEFT JOIN review_replies rr ON rr.review_id = r.id
            LEFT JOIN users ou ON ou.id = rr.owner_id
            WHERE r.business_id = %s
            ORDER BY {order} LIMIT %s OFFSET %s""",
        [business_id, limit, offset],
    )
    # Fold the flat JOIN columns into the nested `reply` shape the API returns.
    for row in rows:
        body = row.pop("reply_body", None)
        created = row.pop("reply_created_at", None)
        owner = row.pop("reply_owner", None)
        row["reply"] = (
            {"body": body, "owner_username": owner, "created_at": created}
            if body is not None
            else None
        )
    return rows


def list_for_user(user_id: int) -> list[dict[str, Any]]:
    """A user's own reviews with the business name attached (profile page)."""
    return query(
        f"""SELECT {_REVIEW_COLS}, b.name AS business_name
            FROM reviews r
            JOIN users u ON u.id = r.user_id
            JOIN businesses b ON b.id = r.business_id
            WHERE r.user_id = %s
            ORDER BY r.created_at DESC""",
        [user_id],
    )


def get(review_id: int) -> Optional[dict[str, Any]]:
    rows = query(
        f"SELECT {_REVIEW_COLS} FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = %s",
        [review_id],
    )
    return rows[0] if rows else None


def user_has_reviewed(business_id: int, user_id: int) -> bool:
    return bool(query("SELECT 1 FROM reviews WHERE business_id = %s AND user_id = %s", [business_id, user_id]))


# Trust-score rules (documented in the README; the seed applies the same math):
# a review is worth +10, a deal redemption +5, a favorite +2. Scores are
# adjusted IN THE SAME TRANSACTION as the action, floored at zero on deduction.
TRUST_REVIEW = 10


def create(business_id: int, user_id: int, rating: int, body: str) -> dict:
    with transaction() as conn:
        new_id = conn.execute(
            "INSERT INTO reviews (business_id, user_id, rating, body) VALUES (%s, %s, %s, %s) RETURNING id",
            [business_id, user_id, rating, body],
        ).fetchone()["id"]
        _recompute(conn, business_id)
        conn.execute(
            "UPDATE users SET trust_score = trust_score + %s WHERE id = %s",
            [TRUST_REVIEW, user_id],
        )
        row = conn.execute(
            f"SELECT {_REVIEW_COLS} FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = %s",
            [new_id],
        ).fetchone()
    return row


def update(review_id: int, business_id: int, *, rating: Optional[int], body: Optional[str]) -> dict:
    with transaction() as conn:
        conn.execute(
            """UPDATE reviews SET rating = COALESCE(%s, rating), body = COALESCE(%s, body)
               WHERE id = %s""",
            [rating, body, review_id],
        )
        _recompute(conn, business_id)
        row = conn.execute(
            f"SELECT {_REVIEW_COLS} FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = %s",
            [review_id],
        ).fetchone()
    return row


def delete(review_id: int, business_id: int, author_id: int) -> None:
    """Delete + re-aggregate + deduct the AUTHOR's trust points (not the
    caller's — an admin removing a review deducts from its writer)."""
    with transaction() as conn:
        conn.execute("DELETE FROM reviews WHERE id = %s", [review_id])
        _recompute(conn, business_id)
        conn.execute(
            "UPDATE users SET trust_score = GREATEST(trust_score - %s, 0) WHERE id = %s",
            [TRUST_REVIEW, author_id],
        )


def upsert_reply(review_id: int, owner_id: int, body: str) -> dict:
    """Create or update the (single) owner reply for a review."""
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO review_replies (review_id, owner_id, body)
               VALUES (%s, %s, %s)
               ON CONFLICT (review_id)
               DO UPDATE SET body = EXCLUDED.body, owner_id = EXCLUDED.owner_id
               RETURNING body, created_at""",
            [review_id, owner_id, body],
        ).fetchone()
    return row


def delete_reply(review_id: int) -> bool:
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM review_replies WHERE review_id = %s RETURNING id", [review_id]
        ).fetchone()
    return row is not None


def mark_helpful(review_id: int) -> Optional[int]:
    """Increment helpful_count; returns the new count (or None if missing)."""
    with transaction() as conn:
        row = conn.execute(
            "UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = %s RETURNING helpful_count",
            [review_id],
        ).fetchone()
    return row["helpful_count"] if row else None
