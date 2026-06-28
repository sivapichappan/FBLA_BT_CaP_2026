"""Read-model aggregates for the user-side "My Local Impact" report (§11/§17).

This is the consumer mirror of the owner analytics report: every figure is
derived from the user's OWN verified visits, reviews, favorites, and deal
redemptions, sliced to a date range. As with the rest of the app, ALL SQL lives
in the repository layer — the service ([app.services.user_report]) only assembles
and reasons over what these functions return.

Every aggregate is set-based (GROUP BY / scalar subqueries), parameterized
(never string-interpolated — §15), and scoped to one ``user_id`` plus a
``[start, end]`` window so the report's date picker visibly reshapes the output.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from app.db.connection import query

# date_trunc() buckets we allow the report to roll up by. Whitelisted in the
# router AND here so an unexpected value can never reach SQL (defence in depth —
# the value is parameterized too, so this is belt-and-suspenders).
GRANULARITIES = {"day", "week", "month"}


def user_summary(user_id: int, start: dt.datetime, end: dt.datetime) -> dict[str, Any]:
    """Headline counters for one user within the window. Each figure is a small,
    independently-defensible query (mirrors the owner report's ``_summary``)."""
    visits = query(
        """SELECT
               count(*)                                  AS verified_visits,
               count(DISTINCT business_id)               AS distinct_businesses,
               COALESCE(sum(spend_cents), 0)             AS money_local_cents
           FROM visits
           WHERE user_id = %s AND status = 'VERIFIED'
             AND verified_at BETWEEN %s AND %s""",
        [user_id, start, end],
    )[0]
    reviews = query(
        """SELECT count(*) AS reviews_written,
                  COALESCE(AVG(rating), 0)::real AS avg_rating_given
           FROM reviews WHERE user_id = %s AND created_at BETWEEN %s AND %s""",
        [user_id, start, end],
    )[0]
    redemptions = query(
        """SELECT count(*) AS deals_redeemed FROM deal_redemptions
           WHERE user_id = %s AND redeemed_at BETWEEN %s AND %s""",
        [user_id, start, end],
    )[0]["deals_redeemed"]
    favorites = query(
        """SELECT count(*) AS favorites_added FROM favorites
           WHERE user_id = %s AND created_at BETWEEN %s AND %s""",
        [user_id, start, end],
    )[0]["favorites_added"]
    return {
        "verified_visits": int(visits["verified_visits"]),
        "distinct_businesses": int(visits["distinct_businesses"]),
        "money_local_cents": int(visits["money_local_cents"]),
        "reviews_written": int(reviews["reviews_written"]),
        "avg_rating_given": round(float(reviews["avg_rating_given"]), 2),
        "deals_redeemed": int(redemptions),
        "favorites_added": int(favorites),
    }


def spend_by_category(user_id: int, start: dt.datetime, end: dt.datetime) -> list[dict[str, Any]]:
    """Verified visits + spend grouped by each business's PRIMARY category.

    A business can carry several categories; attributing a visit's spend to all of
    them would double-count, so we pick ONE — the lowest ``category_id`` (the
    first/most-canonical link) — via a correlated subquery. Materialized Google
    businesses have no category links, so they fall into 'Other'."""
    return query(
        """SELECT
               COALESCE((
                   SELECT c.name
                   FROM business_categories bc JOIN categories c ON c.id = bc.category_id
                   WHERE bc.business_id = v.business_id
                   ORDER BY bc.category_id LIMIT 1
               ), 'Other')                       AS category,
               count(*)                          AS visits,
               COALESCE(sum(v.spend_cents), 0)   AS spend_cents
           FROM visits v
           WHERE v.user_id = %s AND v.status = 'VERIFIED'
             AND v.verified_at BETWEEN %s AND %s
           GROUP BY 1
           ORDER BY spend_cents DESC, visits DESC, category""",
        [user_id, start, end],
    )


def spend_by_city(user_id: int, start: dt.datetime, end: dt.datetime) -> list[dict[str, Any]]:
    """Verified visits + spend grouped by city, parsed from the business address.

    Seeded/real addresses follow ``street, City, ST ZIP`` so the city is the 2nd
    comma-separated field. A non-conforming address falls back to 'Unknown'."""
    return query(
        """SELECT
               COALESCE(NULLIF(trim(split_part(b.address, ',', 2)), ''), 'Unknown') AS city,
               count(*)                          AS visits,
               COALESCE(sum(v.spend_cents), 0)   AS spend_cents
           FROM visits v JOIN businesses b ON b.id = v.business_id
           WHERE v.user_id = %s AND v.status = 'VERIFIED'
             AND v.verified_at BETWEEN %s AND %s
           GROUP BY 1
           ORDER BY spend_cents DESC, visits DESC, city""",
        [user_id, start, end],
    )


def visits_trend(user_id: int, start: dt.datetime, end: dt.datetime, trunc: str) -> list[dict[str, Any]]:
    """Verified visits + spend per time bucket (day/week/month) for the line chart."""
    return query(
        """SELECT date_trunc(%s, verified_at)::date AS period,
                  count(*)                          AS visits,
                  COALESCE(sum(spend_cents), 0)     AS spend_cents
           FROM visits
           WHERE user_id = %s AND status = 'VERIFIED'
             AND verified_at BETWEEN %s AND %s
           GROUP BY 1 ORDER BY 1""",
        [trunc, user_id, start, end],
    )


def reviews_trend(user_id: int, start: dt.datetime, end: dt.datetime, trunc: str) -> list[dict[str, Any]]:
    """Reviews written + the average rating given, per time bucket."""
    return query(
        """SELECT date_trunc(%s, created_at)::date AS period,
                  count(*)                          AS count,
                  AVG(rating)::real                 AS avg_rating
           FROM reviews
           WHERE user_id = %s AND created_at BETWEEN %s AND %s
           GROUP BY 1 ORDER BY 1""",
        [trunc, user_id, start, end],
    )


def top_businesses(user_id: int, start: dt.datetime, end: dt.datetime, limit: int = 5) -> list[dict[str, Any]]:
    """The businesses the user supported most in the window, by spend then visits."""
    return query(
        """SELECT v.business_id, b.name,
                  count(*)                          AS visits,
                  COALESCE(sum(v.spend_cents), 0)   AS spend_cents
           FROM visits v JOIN businesses b ON b.id = v.business_id
           WHERE v.user_id = %s AND v.status = 'VERIFIED'
             AND v.verified_at BETWEEN %s AND %s
           GROUP BY v.business_id, b.name
           ORDER BY spend_cents DESC, visits DESC, b.name
           LIMIT %s""",
        [user_id, start, end, limit],
    )


def business_local_spend(business_id: int, start: dt.datetime, end: dt.datetime) -> int:
    """Dollars (in cents) customers reported spending at a business via VERIFIED
    visits in the window — the owner report's 'money kept local' figure."""
    return int(query(
        """SELECT COALESCE(sum(spend_cents), 0) AS cents FROM visits
           WHERE business_id = %s AND status = 'VERIFIED'
             AND verified_at BETWEEN %s AND %s""",
        [business_id, start, end],
    )[0]["cents"])


def trust_counts(user_id: int) -> dict[str, Any]:
    """All-time counts of each trust-earning action, so the service can rebuild
    the 'where your points came from' breakdown. All-time (not windowed) because
    ``users.trust_score`` itself is a lifetime counter."""
    return query(
        """SELECT
               (SELECT count(*) FROM reviews          WHERE user_id = %s)                          AS reviews,
               (SELECT count(*) FROM visits           WHERE user_id = %s AND status = 'VERIFIED')  AS verified_visits,
               (SELECT count(*) FROM deal_redemptions WHERE user_id = %s)                          AS redemptions,
               (SELECT count(*) FROM favorites        WHERE user_id = %s)                          AS favorites""",
        [user_id, user_id, user_id, user_id],
    )[0]
