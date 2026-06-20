"""Data access for Verified Visits (SQL only, §5 layering).

Holds the visit rows (the state machine) and their checkpoint audit trail. The
service (``visits_service``) owns all decision logic; every statement that
touches the database lives here.

Visits are single-user objects (one user, one business), so — unlike the deal
redemption path, where many users race for one capped deal — we do NOT need a
``SELECT ... FOR UPDATE`` row lock here. The status guards in the service plus
the per-(user,business) daily cap are sufficient.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from app.db.connection import query, transaction

# Trust economy (mirrors reviews.TRUST_REVIEW = 10, redemption +5, favorite +2):
# a verified visit is worth +5, awarded in the SAME transaction that finalizes it.
TRUST_VERIFIED_VISIT = 5

# Every column the service reasons about. (rejection_reason is selected for our
# own audit use; the VisitOut model never exposes it to a client.)
_COLS = (
    "id, user_id, business_id, method, status, latitude, longitude, "
    "gps_accuracy_m, distance_m, mock_location_flag, initiated_at, "
    "first_checkpoint_at, verified_at, expires_at, verification_strength, "
    "spend_cents, rejection_reason, created_at"
)

# Columns ``update_visit`` is allowed to set. The keys are matched against this
# fixed set before they are ever interpolated into SQL, so the dynamic UPDATE
# can never be steered by caller input.
_UPDATABLE = {
    "status", "latitude", "longitude", "gps_accuracy_m", "distance_m",
    "mock_location_flag", "first_checkpoint_at", "verified_at",
    "verification_strength", "rejection_reason", "spend_cents",
}


def create(user_id: int, business_id: int, method: str, expires_at: dt.datetime) -> dict:
    with transaction() as conn:
        row = conn.execute(
            f"""INSERT INTO visits (user_id, business_id, method, status, expires_at)
                VALUES (%s, %s, %s, 'PENDING', %s)
                RETURNING {_COLS}""",
            [user_id, business_id, method, expires_at],
        ).fetchone()
    return row


def get(visit_id: int) -> Optional[dict[str, Any]]:
    rows = query(f"SELECT {_COLS} FROM visits WHERE id = %s", [visit_id])
    return rows[0] if rows else None


def get_active(user_id: int, business_id: int) -> Optional[dict[str, Any]]:
    """A still-open (PENDING/AWAITING_DWELL, not expired) visit for this
    (user, business) — lets ``initiate`` be idempotent instead of spawning
    duplicate visits on a double-tap."""
    rows = query(
        f"""SELECT {_COLS} FROM visits
            WHERE user_id = %s AND business_id = %s
              AND status IN ('PENDING', 'AWAITING_DWELL')
              AND expires_at > now()
            ORDER BY initiated_at DESC
            LIMIT 1""",
        [user_id, business_id],
    )
    return rows[0] if rows else None


def record_checkpoint(
    visit_id: int,
    lat: float,
    lng: float,
    accuracy_m: Optional[float],
    distance_m: float,
    inside: bool,
    mock: bool,
    client_ts: Optional[dt.datetime],
) -> None:
    """Append one location sample to the audit trail (server_ts defaults to now)."""
    with transaction() as conn:
        conn.execute(
            """INSERT INTO visit_checkpoints
                   (visit_id, latitude, longitude, gps_accuracy_m, distance_m,
                    inside_geofence, mock_location, client_ts)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            [visit_id, lat, lng, accuracy_m, distance_m, inside, mock, client_ts],
        )


def last_accepted_checkpoint(user_id: int) -> Optional[dict[str, Any]]:
    """The user's most recent INSIDE-geofence checkpoint anywhere — the anchor
    for the cross-visit impossible-travel check."""
    rows = query(
        """SELECT c.latitude, c.longitude, c.server_ts
           FROM visit_checkpoints c
           JOIN visits v ON v.id = c.visit_id
           WHERE v.user_id = %s AND c.inside_geofence = TRUE
           ORDER BY c.server_ts DESC
           LIMIT 1""",
        [user_id],
    )
    return rows[0] if rows else None


def count_verified_recent(user_id: int, business_id: int, within_hours: int = 24) -> int:
    """How many times this user has verified at this business in the window —
    the anti-farming cap."""
    rows = query(
        """SELECT count(*) AS n FROM visits
           WHERE user_id = %s AND business_id = %s AND status = 'VERIFIED'
             AND verified_at >= now() - make_interval(hours => %s)""",
        [user_id, business_id, within_hours],
    )
    return rows[0]["n"]


def prior_verified_count(user_id: int) -> int:
    """Total verified visits by this user (account history → strength bonus)."""
    rows = query("SELECT count(*) AS n FROM visits WHERE user_id = %s AND status = 'VERIFIED'", [user_id])
    return rows[0]["n"]


def update_visit(visit_id: int, **fields: Any) -> dict:
    """Set an allowlisted subset of columns and return the fresh row. Used for the
    non-finalize transitions (AWAITING_DWELL, FAILED, REJECTED, EXPIRED)."""
    cols = {k: v for k, v in fields.items() if k in _UPDATABLE}
    if not cols:
        return get(visit_id)
    assignments = ", ".join(f"{col} = %s" for col in cols)  # keys are from _UPDATABLE only
    with transaction() as conn:
        row = conn.execute(
            f"UPDATE visits SET {assignments} WHERE id = %s RETURNING {_COLS}",
            list(cols.values()) + [visit_id],
        ).fetchone()
    return row


def finalize_verified(
    visit_id: int,
    user_id: int,
    *,
    lat: float,
    lng: float,
    accuracy_m: Optional[float],
    distance_m: float,
    mock: bool,
    strength: int,
    spend_cents: Optional[int],
) -> dict:
    """Mark VERIFIED, record the winning checkpoint's evidence, AND award the
    visit's trust points — all in ONE transaction so the trust score can never
    drift from the verified-visit count (the same atomic pattern as reviews)."""
    with transaction() as conn:
        row = conn.execute(
            f"""UPDATE visits SET
                    status = 'VERIFIED', verified_at = now(),
                    latitude = %s, longitude = %s, gps_accuracy_m = %s,
                    distance_m = %s, mock_location_flag = %s,
                    verification_strength = %s, spend_cents = %s
                WHERE id = %s
                RETURNING {_COLS}""",
            [lat, lng, accuracy_m, distance_m, mock, strength, spend_cents, visit_id],
        ).fetchone()
        conn.execute(
            "UPDATE users SET trust_score = trust_score + %s WHERE id = %s",
            [TRUST_VERIFIED_VISIT, user_id],
        )
    return row


def redeem_qr(business_id: int, user_id: int, period: int, token: str, visit_id: int) -> bool:
    """Record a single-use QR redemption. Returns False if this (business, user,
    period) was already redeemed — i.e. the same code is being replayed within
    its window. The UNIQUE(business_id, user_id, period) index does the work."""
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO qr_redemptions (business_id, user_id, period, token, visit_id)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (business_id, user_id, period) DO NOTHING
               RETURNING id""",
            [business_id, user_id, period, token, visit_id],
        ).fetchone()
    return row is not None


def list_for_user(user_id: int) -> list[dict[str, Any]]:
    """A user's visits with the business name attached (the passport / history)."""
    return query(
        """SELECT v.id, v.business_id, b.name AS business_name, v.method, v.status,
                  v.verified_at, v.verification_strength, v.spend_cents, v.initiated_at
           FROM visits v
           JOIN businesses b ON b.id = v.business_id
           WHERE v.user_id = %s
           ORDER BY v.initiated_at DESC""",
        [user_id],
    )


def set_spend(visit_id: int, user_id: int, spend_cents: int) -> bool:
    """Record an (optional) self-reported spend on a VERIFIED visit — powers the
    'money kept local' counter. Only the owner of the visit can set it."""
    with transaction() as conn:
        row = conn.execute(
            "UPDATE visits SET spend_cents = %s "
            "WHERE id = %s AND user_id = %s AND status = 'VERIFIED' RETURNING id",
            [spend_cents, visit_id, user_id],
        ).fetchone()
    return row is not None


# ── Passport / impact aggregates (§17) — all derived from VERIFIED visits ────
def passport_stats(user_id: int) -> dict[str, Any]:
    """Headline counters for a user's check-in passport."""
    return query(
        """SELECT
               count(*) FILTER (WHERE status = 'VERIFIED')                       AS total_verified,
               count(DISTINCT business_id) FILTER (WHERE status = 'VERIFIED')    AS distinct_businesses,
               COALESCE(sum(spend_cents) FILTER (WHERE status = 'VERIFIED'), 0)  AS total_spend_cents
           FROM visits WHERE user_id = %s""",
        [user_id],
    )[0]


def category_visit_counts(user_id: int) -> list[dict[str, Any]]:
    """How many distinct businesses of each category the user has verified at
    (drives the category 'stamp' badges). Materialized Google businesses carry no
    category links, so they simply don't contribute to category stamps."""
    return query(
        """SELECT c.name AS category, count(DISTINCT v.business_id) AS n
           FROM visits v
           JOIN business_categories bc ON bc.business_id = v.business_id
           JOIN categories c ON c.id = bc.category_id
           WHERE v.user_id = %s AND v.status = 'VERIFIED'
           GROUP BY c.name ORDER BY n DESC, c.name""",
        [user_id],
    )


def verified_visit_dates(user_id: int) -> list[Any]:
    """The distinct local-time dates the user verified a visit (for the streak)."""
    rows = query(
        """SELECT DISTINCT (verified_at AT TIME ZONE 'America/New_York')::date AS d
           FROM visits WHERE user_id = %s AND status = 'VERIFIED' ORDER BY d""",
        [user_id],
    )
    return [r["d"] for r in rows]
