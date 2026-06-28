"""The user-side "My Local Impact" report (§11/§17) — the consumer mirror of the
owner analytics report, and the second half of the rubric's CUSTOMIZABLE output
report.

It is parameterized exactly like the owner report so the two share a mental model
(and a frontend): a **date range**, a **section selection** (only requested
sections are computed), and a roll-up **granularity** (day/week/month). On top of
the raw aggregates this layer adds the "analyze" features:

  * **period-over-period comparison** — every headline number is diffed against
    the immediately-preceding window of equal length;
  * an **auto-generated narrative** — plain-English sentences derived purely from
    the numbers (no LLM, fully explainable);
  * a **trust-score breakdown** — reconstructing where the user's points came
    from, using the same per-action weights the app awards at runtime.

All aggregation is SQL in [app.repositories.reports]; this module is pure Python
over those results, so it unit-tests with a fake repo and no database.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from app.repositories import reports as reports_repo
from app.repositories import reviews as reviews_repo
from app.repositories import visits as visits_repo

# The section catalog — the report page's multi-select mirrors these keys.
ALL_SECTIONS = {
    "summary", "spend_by_category", "spend_by_city",
    "visits_trend", "reviews_trend", "top_businesses", "trust_breakdown",
}

# Per-action trust weights. The two named ones are imported so they can never
# drift from the source of truth; redemption/favorite are literals in their repos
# (deals_repo +5, favorites_repo +2), restated here with that provenance.
TRUST_REVIEW = reviews_repo.TRUST_REVIEW                # 10
TRUST_VERIFIED_VISIT = visits_repo.TRUST_VERIFIED_VISIT  # 5
TRUST_REDEMPTION = 5
TRUST_FAVORITE = 2

# KPIs that get a period-over-period comparison badge.
_COMPARED = (
    "verified_visits", "distinct_businesses", "money_local_cents",
    "reviews_written", "avg_rating_given", "deals_redeemed", "favorites_added",
)


def _previous_window(start: dt.datetime, end: dt.datetime) -> tuple[dt.datetime, dt.datetime]:
    """The equal-length window immediately before [start, end] — for 'vs prior'."""
    length = end - start
    return start - length, start


def _tenure_days(created_at: Any, end: dt.datetime) -> int:
    """Days since the account was created (clamped at 0)."""
    if not created_at:
        return 0
    created = created_at if isinstance(created_at, dt.datetime) else dt.datetime.fromisoformat(str(created_at))
    return max((end - created).days, 0)


def _change(cur: float, prev: float) -> dict[str, Optional[float]]:
    """Absolute and percentage change. ``pct`` is None when there's no prior base
    to divide by (so the UI can say 'new' instead of a misleading +100%)."""
    delta = round(cur - prev, 2)
    pct = round(100.0 * (cur - prev) / prev, 1) if prev else None
    return {"abs": delta, "pct": pct}


def _changes(cur: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
    return {k: _change(float(cur[k]), float(prev[k])) for k in _COMPARED}


def _dollars(cents: int) -> str:
    return f"${cents / 100:,.0f}"


def _plural(n: int, word: str) -> str:
    """Count + word, pluralized. Words ending in a sibilant (s/x/z/ch/sh) take
    '-es' so 'business' → 'businesses', not 'businesss'."""
    if n == 1:
        return f"1 {word}"
    suffix = "es" if word.endswith(("s", "x", "z", "ch", "sh")) else "s"
    return f"{n} {word}{suffix}"


def _narrative(report: dict[str, Any]) -> list[str]:
    """Plain-English highlights, derived only from the assembled numbers."""
    s = report.get("summary")
    if s and (s["verified_visits"] or s["reviews_written"]):
        lines = [
            f"You kept {_dollars(s['money_local_cents'])} in the local economy across "
            f"{_plural(s['verified_visits'], 'verified visit')} to "
            f"{_plural(s['distinct_businesses'], 'business')}."
        ]
        money_chg = s.get("change", {}).get("money_local_cents", {})
        if money_chg.get("pct") is not None and s["previous"]["money_local_cents"]:
            direction = "up" if money_chg["pct"] >= 0 else "down"
            lines.append(f"That's {direction} {abs(money_chg['pct']):.0f}% versus the previous period.")
        if s["reviews_written"]:
            lines.append(
                f"You wrote {_plural(s['reviews_written'], 'review')}, "
                f"averaging {s['avg_rating_given']:.1f}★."
            )
    elif s:
        return ["No verified activity in this period yet — check in at a local spot to start your impact story."]
    else:
        lines = []

    cats = report.get("spend_by_category")
    if cats:
        top = cats[0]
        lines.append(
            f"Your top category was {top['category']} "
            f"({_dollars(top['spend_cents'])} over {_plural(top['visits'], 'visit')})."
        )
    cities = report.get("spend_by_city")
    if cities and len(cities) > 1:
        lines.append(f"You supported businesses across {len(cities)} cities, led by {cities[0]['city']}.")
    return lines


def _trust_breakdown(user_id: int) -> dict[str, Any]:
    """Reconstruct the lifetime trust score by source from current activity, using
    the same weights awarded at runtime. (May differ slightly from the stored
    counter if past reviews/favorites were removed — this reflects activity today.)"""
    c = reports_repo.trust_counts(user_id)
    components = [
        {"source": "Reviews written", "count": int(c["reviews"]),
         "points": int(c["reviews"]) * TRUST_REVIEW},
        {"source": "Verified visits", "count": int(c["verified_visits"]),
         "points": int(c["verified_visits"]) * TRUST_VERIFIED_VISIT},
        {"source": "Deals redeemed", "count": int(c["redemptions"]),
         "points": int(c["redemptions"]) * TRUST_REDEMPTION},
        {"source": "Favorites saved", "count": int(c["favorites"]),
         "points": int(c["favorites"]) * TRUST_FAVORITE},
    ]
    return {"total": sum(x["points"] for x in components), "components": components}


def build_report(user_id: int, created_at: Any, start: dt.datetime, end: dt.datetime,
                 sections: set[str], granularity: str) -> dict[str, Any]:
    """Assemble exactly the sections requested, plus the always-on narrative."""
    report: dict[str, Any] = {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "granularity": granularity,
        "sections": sorted(sections),
    }

    if "summary" in sections:
        cur = reports_repo.user_summary(user_id, start, end)
        prev_start, prev_end = _previous_window(start, end)
        prev = reports_repo.user_summary(user_id, prev_start, prev_end)
        cur["tenure_days"] = _tenure_days(created_at, end)
        cur["previous"] = prev
        cur["change"] = _changes(cur, prev)
        report["summary"] = cur
    if "spend_by_category" in sections:
        report["spend_by_category"] = reports_repo.spend_by_category(user_id, start, end)
    if "spend_by_city" in sections:
        report["spend_by_city"] = reports_repo.spend_by_city(user_id, start, end)
    if "visits_trend" in sections:
        report["visits_trend"] = reports_repo.visits_trend(user_id, start, end, granularity)
    if "reviews_trend" in sections:
        report["reviews_trend"] = reports_repo.reviews_trend(user_id, start, end, granularity)
    if "top_businesses" in sections:
        report["top_businesses"] = reports_repo.top_businesses(user_id, start, end)
    if "trust_breakdown" in sections:
        report["trust_breakdown"] = _trust_breakdown(user_id)

    report["narrative"] = _narrative(report)
    return report
