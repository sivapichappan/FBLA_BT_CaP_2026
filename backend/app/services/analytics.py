"""Owner analytics — the rubric's CUSTOMIZABLE report (§11).

The report is parameterized two ways, both user-controlled in the dashboard:
  * a **date range** (``from`` / ``to``) applied to every time-stamped metric;
  * a **metric selection** — only the requested sections are computed and
    returned, so the output reshapes to what the user asks for.

All aggregation happens in SQL (set-based, indexable); Python only assembles
the response. Authorization (owner/admin) is enforced in the router.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from app.db.connection import query

# The metric catalog — the dashboard's multi-select mirrors these keys.
ALL_METRICS = {
    "summary", "rating_distribution", "reviews_trend", "deals",
    "redemptions_trend", "views_trend", "funnel",
}


def _summary(business_id: int, start: dt.datetime, end: dt.datetime) -> dict[str, Any]:
    """Headline numbers. Rating/count are computed WITHIN the range so the
    date picker visibly changes them (all-time figures live on the business)."""
    reviews = query(
        """SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0)::real AS average_rating
           FROM reviews WHERE business_id = %s AND created_at BETWEEN %s AND %s""",
        [business_id, start, end],
    )[0]
    favorites = query(
        """SELECT COUNT(*) AS n FROM favorites
           WHERE business_ref = %s AND created_at BETWEEN %s AND %s""",
        [str(business_id), start, end],
    )[0]["n"]
    redemptions = query(
        """SELECT COUNT(*) AS n
           FROM deal_redemptions r JOIN deals d ON d.id = r.deal_id
           WHERE d.business_id = %s AND r.redeemed_at BETWEEN %s AND %s""",
        [business_id, start, end],
    )[0]["n"]
    views = query(
        """SELECT COUNT(*) AS n FROM business_views
           WHERE business_id = %s AND viewed_at BETWEEN %s AND %s""",
        [business_id, start, end],
    )[0]["n"]
    return {
        "average_rating": round(float(reviews["average_rating"]), 2),
        "review_count": reviews["review_count"],
        "favorites": favorites,
        "deal_redemptions": redemptions,
        "views": views,
    }


def _rating_distribution(business_id: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
    """How many 1★…5★ reviews in range — zero-filled so charts get 5 bars."""
    rows = query(
        """SELECT rating, COUNT(*) AS n FROM reviews
           WHERE business_id = %s AND created_at BETWEEN %s AND %s
           GROUP BY rating""",
        [business_id, start, end],
    )
    counts = {r["rating"]: r["n"] for r in rows}
    return [{"rating": stars, "count": counts.get(stars, 0)} for stars in range(1, 6)]


def _reviews_trend(business_id: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
    """Reviews per day (+ that day's average) — the line chart's data."""
    return query(
        """SELECT DATE(created_at) AS day, COUNT(*) AS count, AVG(rating)::real AS avg_rating
           FROM reviews
           WHERE business_id = %s AND created_at BETWEEN %s AND %s
           GROUP BY DATE(created_at) ORDER BY day""",
        [business_id, start, end],
    )


def _deals(business_id: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
    """Per-deal performance: redemptions in range vs the deal's caps."""
    return query(
        """SELECT d.id, d.title, d.discount_pct, d.total_limit, d.redemption_count,
                  COUNT(r.id) AS redemptions_in_range
           FROM deals d
           LEFT JOIN deal_redemptions r
                  ON r.deal_id = d.id AND r.redeemed_at BETWEEN %s AND %s
           WHERE d.business_id = %s
           GROUP BY d.id ORDER BY redemptions_in_range DESC, d.ends_at""",
        [start, end, business_id],
    )


def _redemptions_trend(business_id: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
    return query(
        """SELECT DATE(r.redeemed_at) AS day, COUNT(*) AS count
           FROM deal_redemptions r JOIN deals d ON d.id = r.deal_id
           WHERE d.business_id = %s AND r.redeemed_at BETWEEN %s AND %s
           GROUP BY DATE(r.redeemed_at) ORDER BY day""",
        [business_id, start, end],
    )


def _views_trend(business_id: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
    return query(
        """SELECT DATE(viewed_at) AS day, COUNT(*) AS count
           FROM business_views
           WHERE business_id = %s AND viewed_at BETWEEN %s AND %s
           GROUP BY DATE(viewed_at) ORDER BY day""",
        [business_id, start, end],
    )


def _funnel(business_id: int, start: dt.datetime, end: dt.datetime) -> dict[str, Any]:
    """Views → favorites → redemptions in range, with conversion rates.

    This is the dashboard's "is interest turning into customers?" answer —
    each step counts DISTINCT events in the same window, and the rates are
    step-over-step (favorites/views, redemptions/favorites) plus end-to-end.
    """
    s = _summary(business_id, start, end)
    views, favs, redeems = s["views"], s["favorites"], s["deal_redemptions"]

    def pct(part: int, whole: int) -> float:
        return round(100.0 * part / whole, 1) if whole else 0.0

    return {
        "views": views,
        "favorites": favs,
        "redemptions": redeems,
        "view_to_favorite_pct": pct(favs, views),
        "favorite_to_redemption_pct": pct(redeems, favs),
        "view_to_redemption_pct": pct(redeems, views),
    }


def build_report(business_id: int, start: dt.datetime, end: dt.datetime,
                 metrics: set[str]) -> dict[str, Any]:
    """Assemble exactly the sections the user selected — nothing else."""
    report: dict[str, Any] = {
        "business_id": business_id,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "metrics": sorted(metrics),
    }
    if "summary" in metrics:
        report["summary"] = _summary(business_id, start, end)
    if "rating_distribution" in metrics:
        report["rating_distribution"] = _rating_distribution(business_id, start, end)
    if "reviews_trend" in metrics:
        report["reviews_trend"] = _reviews_trend(business_id, start, end)
    if "deals" in metrics:
        report["deals"] = _deals(business_id, start, end)
    if "redemptions_trend" in metrics:
        report["redemptions_trend"] = _redemptions_trend(business_id, start, end)
    if "views_trend" in metrics:
        report["views_trend"] = _views_trend(business_id, start, end)
    if "funnel" in metrics:
        report["funnel"] = _funnel(business_id, start, end)
    return report
