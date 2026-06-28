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
from typing import Any, Optional

from app.db.connection import query
from app.repositories import reports as reports_repo

# The metric catalog — the dashboard's multi-select mirrors these keys.
ALL_METRICS = {
    "summary", "rating_distribution", "reviews_trend", "deals",
    "redemptions_trend", "views_trend", "funnel",
}

# The day/week/month roll-ups the trend charts can bucket by (shared with the
# user report's repo whitelist, so both reports speak the same granularities).
GRANULARITIES = reports_repo.GRANULARITIES

# Headline numbers that get a period-over-period comparison badge.
_COMPARED = (
    "average_rating", "review_count", "favorites",
    "deal_redemptions", "views", "local_spend_cents",
)


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
        # "Money kept local" for THIS business — spend reported on verified visits.
        "local_spend_cents": reports_repo.business_local_spend(business_id, start, end),
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


def _reviews_trend(business_id: int, start: dt.datetime, end: dt.datetime, gran: str = "day") -> list[dict]:
    """Reviews per bucket (+ that bucket's average) — the line chart's data.
    ``gran`` rolls the buckets up to day/week/month."""
    return query(
        """SELECT date_trunc(%s, created_at)::date AS day, COUNT(*) AS count,
                  AVG(rating)::real AS avg_rating
           FROM reviews
           WHERE business_id = %s AND created_at BETWEEN %s AND %s
           GROUP BY 1 ORDER BY 1""",
        [gran, business_id, start, end],
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


def _redemptions_trend(business_id: int, start: dt.datetime, end: dt.datetime, gran: str = "day") -> list[dict]:
    return query(
        """SELECT date_trunc(%s, r.redeemed_at)::date AS day, COUNT(*) AS count
           FROM deal_redemptions r JOIN deals d ON d.id = r.deal_id
           WHERE d.business_id = %s AND r.redeemed_at BETWEEN %s AND %s
           GROUP BY 1 ORDER BY 1""",
        [gran, business_id, start, end],
    )


def _views_trend(business_id: int, start: dt.datetime, end: dt.datetime, gran: str = "day") -> list[dict]:
    return query(
        """SELECT date_trunc(%s, viewed_at)::date AS day, COUNT(*) AS count
           FROM business_views
           WHERE business_id = %s AND viewed_at BETWEEN %s AND %s
           GROUP BY 1 ORDER BY 1""",
        [gran, business_id, start, end],
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


def _previous_window(start: dt.datetime, end: dt.datetime) -> tuple[dt.datetime, dt.datetime]:
    """The equal-length window immediately before [start, end] — for 'vs prior'."""
    length = end - start
    return start - length, start


def _change(cur: float, prev: float) -> dict[str, Optional[float]]:
    """Absolute + percentage change; ``pct`` is None with no prior base to divide
    by (so the UI shows 'new' rather than a misleading percentage)."""
    pct = round(100.0 * (cur - prev) / prev, 1) if prev else None
    return {"abs": round(cur - prev, 2), "pct": pct}


def _changes(cur: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
    return {k: _change(float(cur[k]), float(prev[k])) for k in _COMPARED}


def _plural(n: int, word: str) -> str:
    """Count + word with a regular -s plural (every noun in the narrative is
    regular: view(s), favorite(s), redemption(s), review(s))."""
    return f"{n:,} {word}{'' if n == 1 else 's'}"


def _narrative(report: dict[str, Any]) -> list[str]:
    """Plain-English highlights for the owner, derived only from the numbers."""
    s = report.get("summary")
    if not s:
        return []
    lines = [
        f"In this period your listing drew {_plural(s['views'], 'view')}, "
        f"{_plural(s['favorites'], 'new favorite')}, and "
        f"{_plural(s['deal_redemptions'], 'deal redemption')}."
    ]
    vchg = s.get("change", {}).get("views", {})
    if vchg.get("pct") is not None and s["previous"]["views"]:
        direction = "up" if vchg["pct"] >= 0 else "down"
        lines.append(f"Views are {direction} {abs(vchg['pct']):.0f}% versus the previous period.")
    if s["review_count"]:
        lines.append(
            f"Your average rating was {s['average_rating']:.1f}★ across "
            f"{_plural(s['review_count'], 'review')}."
        )
    if s["local_spend_cents"]:
        lines.append(f"${s['local_spend_cents'] / 100:,.0f} was kept local through verified visits.")
    # Busiest day, if the views trend was requested.
    trend = report.get("views_trend") or []
    if trend:
        peak = max(trend, key=lambda r: r["count"])
        lines.append(f"Your busiest bucket was {peak['day']} with {_plural(peak['count'], 'view')}.")
    return lines


def build_report(business_id: int, start: dt.datetime, end: dt.datetime,
                 metrics: set[str], granularity: str = "day") -> dict[str, Any]:
    """Assemble exactly the sections the user selected — nothing else.

    ``granularity`` rolls trend buckets up to day/week/month. When ``summary`` is
    requested it also carries a period-over-period comparison against the prior
    equal-length window, and the report gains an always-on plain-English narrative.
    """
    report: dict[str, Any] = {
        "business_id": business_id,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "granularity": granularity,
        "metrics": sorted(metrics),
    }
    if "summary" in metrics:
        cur = _summary(business_id, start, end)
        prev_start, prev_end = _previous_window(start, end)
        cur["previous"] = _summary(business_id, prev_start, prev_end)
        cur["change"] = _changes(cur, cur["previous"])
        # An average has no meaningful baseline when the prior period had no
        # reviews — drop its comparison so the UI never badges a rating "new".
        if not cur["previous"]["review_count"]:
            cur["change"].pop("average_rating", None)
        report["summary"] = cur
    if "rating_distribution" in metrics:
        report["rating_distribution"] = _rating_distribution(business_id, start, end)
    if "reviews_trend" in metrics:
        report["reviews_trend"] = _reviews_trend(business_id, start, end, granularity)
    if "deals" in metrics:
        report["deals"] = _deals(business_id, start, end)
    if "redemptions_trend" in metrics:
        report["redemptions_trend"] = _redemptions_trend(business_id, start, end, granularity)
    if "views_trend" in metrics:
        report["views_trend"] = _views_trend(business_id, start, end, granularity)
    if "funnel" in metrics:
        report["funnel"] = _funnel(business_id, start, end)
    report["narrative"] = _narrative(report)
    return report
