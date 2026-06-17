"""Ranking + scoring math shared by search and the concierge.

Phase 1 provides the building blocks and a ``sort_results`` for the search
sort modes. The full intent-weighted composite ranker (BUILD_SPEC §9.3) is
layered on in Phase 2 — these same helpers feed it.

Two techniques worth explaining in Q&A:

* **Empirical-Bayes rating smoothing** — a raw average rewards a 5.0 from a
  single review over a 4.6 from 400. We shrink each rating toward a global
  prior so sample size matters:
      score = (n / (n + m)) * avg + (m / (n + m)) * C
  with prior mean ``C ≈ 3.7`` and prior strength ``m ≈ 15`` (≈15 "virtual"
  average reviews). A 4.9★/5-review place lands near 4.3; a 4.6★/400-review
  place stays ~4.59 and correctly ranks higher.
* **Haversine distance** — great-circle distance between two lat/lng points in
  kilometers (the earth is round; flat math is wrong over a city). The
  user-facing distance is this scaled by a road-circuity factor (``driving_km``),
  because you drive the streets, not a straight line.
"""

from __future__ import annotations

import math

# Prior for empirical-Bayes smoothing. C = the rating a brand-new place is
# assumed to "deserve" before evidence; m = how many average reviews of
# evidence it takes to move halfway off that prior.
BAYES_PRIOR_MEAN = 3.7
BAYES_PRIOR_STRENGTH = 15


def bayesian_rating(avg: float, count: int,
                    c: float = BAYES_PRIOR_MEAN, m: int = BAYES_PRIOR_STRENGTH) -> float:
    """Empirical-Bayes shrunk rating in [0, 5] (see module docstring)."""
    if count <= 0:
        return c
    return (count / (count + m)) * avg + (m / (count + m)) * c


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two coordinates, in kilometers."""
    r = 6371.0  # mean earth radius (km)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Roads aren't straight lines: real driving distance is longer than the
# great-circle "as the crow flies" distance. The ratio (route circuity) is
# well-studied — roughly 1.3 on average across the US, higher in dense one-way
# grids — so we scale by 1.4 for the NYC demo metro. A single uniform factor
# keeps it free, instant, and offline-safe (no routing API to fail mid-demo);
# the trade-off vs a live Routes call is that it can't model one specific
# river-crossing detour — it inflates every distance by the same realistic ratio.
CIRCUITY_FACTOR = 1.4


def driving_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Estimated driving distance (km): the great-circle distance scaled by the
    road-circuity factor. This is the "X km away" users see and the distance the
    closeness ranking uses — a more honest "how far is it really" than a straight
    line over rooftops."""
    return haversine_km(lat1, lng1, lat2, lng2) * CIRCUITY_FACTOR


def sort_results(results: list[dict], sort: str) -> list[dict]:
    """Sort canonical business dicts by the requested mode.

    * ``distance``  → nearest first (needs ``distance_km``)
    * ``rating``    → best **smoothed** rating first (low-sample outliers can't
                      top the list — the §8.3 acceptance test)
    * ``reviews``   → most-reviewed first
    * ``best_match``→ a blend of smoothed rating and proximity (default)
    """
    if sort == "distance":
        return sorted(results, key=lambda b: b.get("distance_km") if b.get("distance_km") is not None else 9e9)

    if sort == "rating":
        return sorted(
            results,
            key=lambda b: bayesian_rating(b.get("average_rating") or 0, b.get("review_count") or 0),
            reverse=True,
        )

    if sort == "reviews":
        return sorted(results, key=lambda b: b.get("review_count") or 0, reverse=True)

    # best_match: quality (smoothed rating) + closeness + independence together —
    # the LocalLens default deliberately rewards verified locals (the product's
    # whole point; the vs-Google toggle contrasts this with popularity-only order).
    def best_match_key(b: dict) -> float:
        rating_score = bayesian_rating(b.get("average_rating") or 0, b.get("review_count") or 0) / 5.0
        dist = b.get("distance_km")
        # Gaussian proximity term: 1.0 right here, decaying with distance.
        proximity = math.exp(-((dist or 0) ** 2) / (2 * DISTANCE_SIGMA_KM**2)) if dist is not None else 0.5
        independence = _independence_score(b)
        return 0.45 * rating_score + 0.3 * proximity + 0.25 * independence

    return sorted(results, key=best_match_key, reverse=True)


# ═════════════════ Intent-weighted composite ranking (§9.3) ═════════════════
# Used by the concierge: eight normalized factors, each weighted, with the
# weights RE-SHAPED by the detected intent and renormalized to sum to 1.
# Example: OPEN_NOW multiplies the open-status weight ×5, so "what's open?"
# actually ranks open places first instead of just nearby ones.

# Gaussian decay length, expressed in DRIVING km. Scaled by the circuity factor
# so the proximity curve stays calibrated to the same real-world closeness as
# before the straight-line→driving switch (≈ the old 2 km straight-line):
# score ≈ 0.61 at 2.8 driving-km, 0.14 at 5.6.
DISTANCE_SIGMA_KM = round(2.0 * CIRCUITY_FACTOR, 1)  # 2.8

DEFAULT_WEIGHTS: dict[str, float] = {
    "distance": 0.25, "rating": 0.22, "review_count": 0.13, "independence": 0.14,
    "customer_facing": 0.06, "price_fit": 0.08, "category_match": 0.07, "open_status": 0.05,
}

INTENT_MULTIPLIERS: dict[str, dict[str, float]] = {
    "CHEAP_BUDGET":      {"price_fit": 4.0, "distance": 0.8, "rating": 0.7},
    "NEARBY_CLOSEST":    {"distance": 3.5, "rating": 0.5, "review_count": 0.4},
    "HIGHLY_RATED":      {"rating": 3.0, "review_count": 2.5, "distance": 0.6},
    "SPECIFIC_CATEGORY": {"category_match": 4.0},
    "OPEN_NOW":          {"open_status": 5.0, "distance": 1.5},
    "SUPPORT_LOCAL":     {"independence": 4.0, "distance": 0.8},
    "EXPLORATORY":       {"independence": 1.5, "distance": 0.7},
    "GENERAL_CHAT":      {},
}

# Types that aren't consumer destinations get down-ranked (corporate offices
# that slip through Places searches).
_NON_CUSTOMER_FACING = {"corporate_office", "warehouse", "wholesaler", "distribution_center"}


def _independence_score(b: dict) -> float:
    """0–1 from the classifier's confidence (0.5 when undetermined)."""
    conf = b.get("local_confidence")
    if conf is not None:
        return float(conf)
    if b.get("is_independent") is True:
        return 0.9
    if b.get("is_independent") is False:
        return 0.1
    return 0.5


def _norm_price_fit(level: int | None, direction: str | None) -> float:
    """How well the price level matches the asked-for direction."""
    if level is None:
        return 0.5
    if direction == "cheap":
        return (5 - level) / 4          # $ → 1.0 … $$$$ → 0.25
    if direction == "expensive":
        return level / 4                # $$$$ → 1.0
    return 1.0 - abs(level - 2.5) / 2.5  # no preference: mid-priced ≈ neutral best


def _norm_category(categories: list[str] | None, query: str | None) -> float:
    """Token overlap between the business's categories and the search query."""
    if not query:
        return 0.5
    if not categories:
        return 0.0
    q_tokens = set(query.lower().split())
    for cat in categories:
        c_tokens = set(cat.lower().replace("_", " ").split())
        if q_tokens & c_tokens:
            return 1.0
    return 0.0


def _norm_open(is_open: bool | None) -> float:
    return 1.0 if is_open is True else (0.2 if is_open is False else 0.5)


def rank_businesses(businesses: list[dict], intent: dict) -> list[dict]:
    """Composite-score and sort candidates for the concierge.

    ``intent`` is the classifier's output: {intent, search_query,
    price_direction, …}. Each business gets ``composite_score`` attached so
    the ordering is inspectable in Q&A and the glass-box UI.
    """
    multipliers = INTENT_MULTIPLIERS.get(intent.get("intent", "EXPLORATORY"), {})
    weights = {k: v * multipliers.get(k, 1.0) for k, v in DEFAULT_WEIGHTS.items()}
    total = sum(weights.values())
    weights = {k: v / total for k, v in weights.items()}  # renormalize to Σ=1

    scored = []
    for b in businesses:
        dist = b.get("distance_km")
        factors = {
            "distance": math.exp(-((dist or 0) ** 2) / (2 * DISTANCE_SIGMA_KM**2)) if dist is not None else 0.5,
            "rating": bayesian_rating(b.get("average_rating") or 0, b.get("review_count") or 0) / 5.0,
            "review_count": min(1.0, math.log1p(b.get("review_count") or 0) / math.log1p(500)),
            "independence": _independence_score(b),
            "customer_facing": 0.0 if (b.get("primary_type") in _NON_CUSTOMER_FACING) else 1.0,
            "price_fit": _norm_price_fit(b.get("price_level"), intent.get("price_direction")),
            "category_match": _norm_category(b.get("categories"), intent.get("search_query")),
            "open_status": _norm_open(b.get("is_open_now")),
        }
        b = dict(b)
        b["composite_score"] = round(sum(weights[k] * factors[k] for k in weights), 4)
        scored.append(b)

    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    return scored
