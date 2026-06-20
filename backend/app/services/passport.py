"""The gamified check-in passport (§17): badges, a streak, and the
'money kept local' impact counter — all DERIVED from verified visits, so they're
cheat-resistant (you can't earn a stamp from your couch). Plain, explainable
Python over the visit aggregates; no hidden scoring.
"""

from __future__ import annotations

from typing import Any

from app.repositories import visits as visits_repo

# Milestone badges keyed off a single counter (need = threshold, metric = stat).
_MILESTONES = [
    {"key": "first", "label": "First Verified Visit", "icon": "📍",
     "metric": "total_verified", "need": 1,
     "desc": "Check in and verify your very first visit."},
    {"key": "regular", "label": "Local Regular", "icon": "🔁",
     "metric": "total_verified", "need": 5,
     "desc": "Verify 5 visits to local businesses."},
    {"key": "legend", "label": "Local Legend", "icon": "🏅",
     "metric": "total_verified", "need": 15,
     "desc": "Verify 15 visits — a true local."},
    {"key": "explorer", "label": "Neighborhood Explorer", "icon": "🧭",
     "metric": "distinct_businesses", "need": 8,
     "desc": "Verify visits to 8 different businesses."},
]

# Category 'stamps': verified visits to N businesses of a kind earn a themed badge.
_CATEGORY_BADGES = {
    "Coffee": {"label": "Caffeine Crawler", "icon": "☕", "need": 3},
    "Restaurant": {"label": "Tastemaker", "icon": "🍽️", "need": 3},
    "Bookstore": {"label": "Bibliophile", "icon": "📚", "need": 2},
    "Bar": {"label": "Night Owl", "icon": "🌙", "need": 2},
    "Dessert": {"label": "Sweet Tooth", "icon": "🍰", "need": 2},
    "Bakery": {"label": "Early Riser", "icon": "🥐", "need": 2},
    "Retail": {"label": "Local Shopper", "icon": "🛍️", "need": 3},
}


def _longest_streak(dates: list) -> int:
    """Longest run of consecutive calendar days with a verified visit."""
    if not dates:
        return 0
    best = run = 1
    for prev, cur in zip(dates, dates[1:]):
        run = run + 1 if (cur - prev).days == 1 else 1
        best = max(best, run)
    return best


def _badge(spec_key, label, icon, desc, have, need) -> dict[str, Any]:
    return {"key": spec_key, "label": label, "icon": icon, "desc": desc,
            "have": have, "need": need, "earned": have >= need}


def build(user_id: int) -> dict[str, Any]:
    """Everything the passport screen needs in one call."""
    stats = visits_repo.passport_stats(user_id)
    cats = {c["category"]: c["n"] for c in visits_repo.category_visit_counts(user_id)}
    streak = _longest_streak(visits_repo.verified_visit_dates(user_id))

    badges = [
        _badge(m["key"], m["label"], m["icon"], m["desc"],
               int(stats.get(m["metric"]) or 0), m["need"])
        for m in _MILESTONES
    ]
    # Only show a category stamp once the user has at least one visit of that kind.
    for cat, spec in _CATEGORY_BADGES.items():
        have = int(cats.get(cat, 0))
        if have:
            badges.append(_badge(
                f"cat_{cat.lower()}", spec["label"], spec["icon"],
                f"Verify visits to {spec['need']} {cat.lower()} spots.",
                have, spec["need"]))
    badges.append(_badge("streak", "On a Roll", "🔥",
                         "Verify visits on 3 days in a row.", streak, 3))

    recent = [v for v in visits_repo.list_for_user(user_id) if v["status"] == "VERIFIED"][:8]

    return {
        "total_verified": int(stats.get("total_verified") or 0),
        "distinct_businesses": int(stats.get("distinct_businesses") or 0),
        "streak_days": streak,
        "money_local_cents": int(stats.get("total_spend_cents") or 0),
        "badges": badges,
        "recent": recent,
    }
