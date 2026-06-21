"""Data access for deals + redemptions (SQL only, §5).

The redemption path is the concurrency-critical piece (BUILD_SPEC §8.5):
``redeem`` runs entirely inside ONE transaction and takes a ``SELECT … FOR
UPDATE`` row lock on the deal, so two simultaneous redeems serialize — the
second waits, re-reads the updated counts, and is correctly rejected if a limit
was hit. The count increment is ALSO guarded in SQL (``WHERE … <
total_limit``), so even without the lock the total can never exceed the cap.
"""

from __future__ import annotations

import datetime as dt
import secrets
from typing import Any, Optional

from app.db.connection import query, transaction

_DEAL_COLS = """d.id, d.business_id, b.name AS business_name, d.title, d.discount_pct,
                d.per_user_limit, d.total_limit, d.redemption_count, d.starts_at, d.ends_at"""

# A deal is "live" when inside its window and under its total cap.
_LIVE_WHERE = """d.starts_at <= now() AND d.ends_at > now()
                 AND (d.total_limit IS NULL OR d.redemption_count < d.total_limit)"""


def list_active() -> list[dict[str, Any]]:
    return query(
        f"""SELECT {_DEAL_COLS} FROM deals d JOIN businesses b ON b.id = d.business_id
            WHERE {_LIVE_WHERE} ORDER BY d.ends_at ASC"""
    )


def list_for_business(business_id: int) -> list[dict[str, Any]]:
    return query(
        f"""SELECT {_DEAL_COLS} FROM deals d JOIN businesses b ON b.id = d.business_id
            WHERE d.business_id = %s AND {_LIVE_WHERE} ORDER BY d.ends_at ASC""",
        [business_id],
    )


def list_active_for_businesses(business_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    """Active deals for MANY businesses in one query, grouped by business_id — so
    the trip planner can surface deals on its stops without an N+1 of per-stop calls."""
    if not business_ids:
        return {}
    rows = query(
        f"""SELECT {_DEAL_COLS} FROM deals d JOIN businesses b ON b.id = d.business_id
            WHERE d.business_id = ANY(%s) AND {_LIVE_WHERE} ORDER BY d.ends_at ASC""",
        [business_ids],
    )
    out: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        out.setdefault(r["business_id"], []).append(r)
    return out


def get(deal_id: int) -> Optional[dict[str, Any]]:
    rows = query(
        f"SELECT {_DEAL_COLS} FROM deals d JOIN businesses b ON b.id = d.business_id WHERE d.id = %s",
        [deal_id],
    )
    return rows[0] if rows else None


def create(data: dict[str, Any]) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO deals (business_id, title, discount_pct, per_user_limit,
                                  total_limit, starts_at, ends_at)
               VALUES (%(business_id)s, %(title)s, %(discount_pct)s, %(per_user_limit)s,
                       %(total_limit)s, %(starts_at)s, %(ends_at)s)
               RETURNING id""",
            data,
        ).fetchone()
    return get(row["id"])


def user_redemptions(deal_id: int, user_id: int) -> int:
    rows = query(
        "SELECT COUNT(*) AS n FROM deal_redemptions WHERE deal_id = %s AND user_id = %s",
        [deal_id, user_id],
    )
    return rows[0]["n"]


def redeem(deal_id: int, user_id: int) -> dict[str, Any]:
    """Atomically redeem a deal for a user.

    Returns the redemption row, or raises ``ValueError`` with a user-friendly
    reason ('not_found' | 'not_active' | 'sold_out' | 'user_limit').
    See module docstring for why this is race-proof.
    """
    with transaction() as conn:
        # 1) Lock the deal row — concurrent redeems of this deal serialize here.
        deal = conn.execute(
            "SELECT * FROM deals WHERE id = %s FOR UPDATE", [deal_id]
        ).fetchone()
        if deal is None:
            raise ValueError("not_found")

        now = dt.datetime.now(dt.timezone.utc)
        if not (deal["starts_at"] <= now < deal["ends_at"]):
            raise ValueError("not_active")

        # 2) Per-user cap (safe: the deal lock serializes same-deal redemptions).
        used = conn.execute(
            "SELECT COUNT(*) AS n FROM deal_redemptions WHERE deal_id = %s AND user_id = %s",
            [deal_id, user_id],
        ).fetchone()["n"]
        if used >= deal["per_user_limit"]:
            raise ValueError("user_limit")

        # 3) Guarded increment — even in theory, the count can't pass the cap.
        bumped = conn.execute(
            """UPDATE deals SET redemption_count = redemption_count + 1
               WHERE id = %s AND (total_limit IS NULL OR redemption_count < total_limit)
               RETURNING redemption_count""",
            [deal_id],
        ).fetchone()
        if bumped is None:
            raise ValueError("sold_out")

        # 4) Issue the redemption code the user shows at the counter.
        code = secrets.token_hex(4).upper()  # 8 hex chars, e.g. '9F3A21BC'
        row = conn.execute(
            """INSERT INTO deal_redemptions (deal_id, user_id, code)
               VALUES (%s, %s, %s) RETURNING deal_id, code, redeemed_at""",
            [deal_id, user_id, code],
        ).fetchone()
        # Trust: a redemption earns +5, in the same transaction as the claim.
        conn.execute(
            "UPDATE users SET trust_score = trust_score + 5 WHERE id = %s", [user_id]
        )
    return row


def find_redemption_by_code(code: str) -> Optional[dict[str, Any]]:
    """A redemption + its deal/business/customer context, by code (cashier mode).

    The router checks the business's owner against the caller — this just
    fetches; codes are uppercase hex so we match case-insensitively.
    """
    rows = query(
        """SELECT r.id, r.code, r.redeemed_at, r.verified_at, u.username AS customer,
                  d.title, d.discount_pct, b.id AS business_id, b.name AS business_name,
                  b.owner_id
           FROM deal_redemptions r
           JOIN deals d ON d.id = r.deal_id
           JOIN users u ON u.id = r.user_id
           JOIN businesses b ON b.id = d.business_id
           WHERE upper(r.code) = upper(%s)""",
        [code],
    )
    return rows[0] if rows else None


def mark_redemption_used(redemption_id: int) -> bool:
    """Stamp verified_at exactly once; False if it was already used."""
    with transaction() as conn:
        row = conn.execute(
            """UPDATE deal_redemptions SET verified_at = now()
               WHERE id = %s AND verified_at IS NULL RETURNING id""",
            [redemption_id],
        ).fetchone()
    return row is not None


def list_redemptions_for_user(user_id: int) -> list[dict[str, Any]]:
    return query(
        """SELECT r.deal_id, r.code, r.redeemed_at, d.title, d.discount_pct,
                  b.name AS business_name
           FROM deal_redemptions r
           JOIN deals d ON d.id = r.deal_id
           JOIN businesses b ON b.id = d.business_id
           WHERE r.user_id = %s ORDER BY r.redeemed_at DESC""",
        [user_id],
    )
