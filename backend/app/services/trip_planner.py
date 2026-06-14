"""The small-business trip planner — multi-stop local itineraries (§plan D).

EVERYTHING here is independent-only by construction: candidates come from
``search_service.search()``, whose classifier pipeline hides chains from every
result — so a chain can never appear in an itinerary.

Deterministic core (works offline, fully explainable):
  1. The user's INTERESTS drive the day. Each selected chip (Coffee, Bookstore,
     Restaurant, …) becomes a stop of that kind; the day is padded to the
     duration's target stop count and ordered morning→evening.
  2. Candidates are fetched PER category (a category-driven search per kind), so
     a slot is never empty just because the generic "nearest 20" happened to
     contain no coffee shop or bar. Each slot is filled greedily: among that
     kind's unpicked candidates, score = 0.6·proximity-to-previous-stop
     (Gaussian, σ=1.2 km — walking scale) + 0.4·smoothed-rating. Greedy
     nearest-good-neighbor keeps the route walkable without a TSP solver.
  3. Legs get haversine distances and walking times (12 min/km); stops get a
     running clock from the start time with per-kind dwell durations.

We return SEVERAL itineraries, not one (the user picks). Each option optimises
for a different idea of a good day — best overall, top-rated, shortest walk —
and each AVOIDS the businesses already used by earlier options, so the trips are
genuinely different places, not the same route re-scored. The pools are fetched
ONCE and reused across options, so offering three trips costs no extra Google or
Gemini calls. Sparse areas may yield fewer than three distinct options; any that
come out identical are collapsed.

An LLM narration (grounded ONLY in the chosen stops) is layered on top with a
templated fallback — same contract as the concierge; each option carries
``mode``. Only the top option is LLM-narrated (one call), the rest are
templated — this keeps the request within the 20/day Gemini quota.
"""

from __future__ import annotations

import datetime as dt
import math
from typing import Any, Optional

from app.config import settings
from app.models.business import SearchParams
from app.services import llm, ranker, search_service

# Each interest chip → how it becomes a stop: the categories to FETCH for it,
# the role label shown in the UI, the dwell time, and a chronological rank so
# the finished day flows coffee (morning) → browse → meal → dessert → drinks.
CHIP_SLOTS: dict[str, dict[str, Any]] = {
    "Coffee":     {"cats": ["Coffee", "Cafe"],     "role": "coffee",  "dwell": 45, "rank": 1},
    "Bookstore":  {"cats": ["Bookstore"],          "role": "browse",  "dwell": 40, "rank": 2},
    "Retail":     {"cats": ["Retail"],             "role": "shop",    "dwell": 40, "rank": 2},
    "Grocery":    {"cats": ["Grocery"],            "role": "market",  "dwell": 30, "rank": 2},
    "Restaurant": {"cats": ["Restaurant", "Food"], "role": "eat",     "dwell": 75, "rank": 3},
    "Dessert":    {"cats": ["Dessert", "Bakery"],  "role": "dessert", "dwell": 30, "rank": 4},
    "Bar":        {"cats": ["Bar"],                "role": "drinks",  "dwell": 60, "rank": 5},
}

# Stops per duration (matches the UI hints: ~2h/3, ~4h/4, ~7h/6).
TARGET_STOPS: dict[str, int] = {"quick": 3, "half": 4, "full": 6}
# A balanced default day when the user picks no interests, and the padding pool.
DEFAULT_CHIPS = ["Coffee", "Restaurant", "Dessert", "Bookstore", "Bar"]
MAX_PER_CHIP = 2  # at most two coffee stops, two meals, etc.

WALK_MIN_PER_KM = 12      # ~5 km/h city walking pace
TRIP_RADIUS_M = 4000      # candidates within a short walk/transit of the start

# The day "shapes" we offer. Each scores stops differently — ``prox_w`` is the
# weight on walking-proximity (the rest goes to rating), ``sigma`` is the
# Gaussian decay length for "walkable from here". "best" balances both; "rated"
# chases the best-reviewed independents even if they're farther; "walk" keeps a
# tight loop. Later options also avoid earlier options' businesses (NOVELTY_*),
# so the three trips visit different places. Order = the order shown to the user.
STRATEGIES: list[dict[str, Any]] = [
    {"key": "best",  "label": "Best overall",  "prox_w": 0.60, "sigma": 1.2},
    {"key": "rated", "label": "Top rated",     "prox_w": 0.35, "sigma": 1.6},
    {"key": "walk",  "label": "Shortest walk", "prox_w": 0.85, "sigma": 0.8},
]
# A business reused from an earlier option must score 5× better to be picked over
# a fresh one — so options diverge, yet a sparse area can still reuse rather than
# leave a slot empty (graceful degradation, never a hole in the day).
NOVELTY_PENALTY = 0.2


def _plan_chips(duration: str, interests: list[str]) -> list[str]:
    """Turn the duration + interests into an ORDERED list of stop kinds (chips).

    Interests come first (so the day reflects what the user asked for), a meal
    is always anchored, the list is padded to the target count by repeating the
    user's picks before reaching for defaults, and finally ordered by time of
    day. This is why changing interests now visibly changes the plan."""
    target = TARGET_STOPS.get(duration, 4)
    wanted = list(dict.fromkeys(c for c in interests if c in CHIP_SLOTS))
    if not wanted:
        wanted = DEFAULT_CHIPS[:]
    # Every day out includes a meal.
    if not any(CHIP_SLOTS[c]["role"] == "eat" for c in wanted):
        wanted.append("Restaurant")

    chips: list[str] = []
    counts: dict[str, int] = {}

    def _try_add(c: str) -> None:
        if counts.get(c, 0) < MAX_PER_CHIP:
            chips.append(c)
            counts[c] = counts.get(c, 0) + 1

    # Round-robin the user's picks first, then top up from the defaults.
    for source in (wanted, DEFAULT_CHIPS):
        i = 0
        while len(chips) < target and i < 4 * len(source):
            _try_add(source[i % len(source)])
            i += 1
        if len(chips) >= target:
            break

    chips.sort(key=lambda c: CHIP_SLOTS[c]["rank"])
    return chips[:target]


async def _fetch_pools(chips: list[str], lat: float, lng: float) -> dict[str, list[dict]]:
    """One category-driven search per distinct kind → real candidates of that
    kind near the start. Fetching per kind is what guarantees a slot is never
    empty for lack of, say, an independent coffee shop in the generic pool."""
    pools: dict[str, list[dict]] = {}
    for chip in dict.fromkeys(chips):  # distinct, order-stable
        result = await search_service.search(SearchParams(
            lat=lat, lng=lng, radius_m=TRIP_RADIUS_M, categories=CHIP_SLOTS[chip]["cats"],
        ))
        pools[chip] = [b.model_dump() for b in result.results]
    return pools


def _slot_score(candidate: dict, prev_lat: float, prev_lng: float, *,
                prox_w: float, sigma: float, avoid: set[str]) -> float:
    """How good is this candidate for the CURRENT stop, walking from HERE?
    ``prox_w`` trades off walkability vs. rating per the chosen day-shape; a
    business already used by an earlier option is heavily penalised so options
    visit different places (but can still be reused if nothing else is left)."""
    distance_km = ranker.haversine_km(prev_lat, prev_lng, candidate["lat"], candidate["lng"])
    proximity = math.exp(-(distance_km**2) / (2 * sigma**2))
    rating = ranker.bayesian_rating(
        candidate.get("average_rating") or 0, candidate.get("review_count") or 0
    ) / 5.0
    score = prox_w * proximity + (1.0 - prox_w) * rating
    if candidate["ref"] in avoid:
        score *= NOVELTY_PENALTY
    return score


# Keep the day varied: never more than this many stops of the same role, so a
# coffee/restaurant/dessert day can't degrade into five restaurants just because
# restaurants are the most abundant kind nearby.
MAX_PER_ROLE = 2


def _build_stops(chips: list[str], pools: dict[str, list[dict]], start_lat: float,
                 start_lng: float, start_time: dt.time, *, strategy: dict[str, Any],
                 avoid: set[str]) -> list[dict]:
    """Greedy fill, kind by kind in the day's order. Each stop is labelled by
    the POOL it was drawn from (its role/dwell), so a restaurant fetched as a
    substitute reads as "eat", not mislabelled by its category order. When a
    kind is used up, we borrow from another of the user's chosen kinds —
    preferring the least-used role and never exceeding MAX_PER_ROLE — so the day
    reaches its length while staying varied and on-theme. ``strategy`` sets the
    proximity/rating trade-off; ``avoid`` (earlier options' picks) steers this
    option toward fresh businesses."""
    stops: list[dict[str, Any]] = []
    picked: set[str] = set()
    role_counts: dict[str, int] = {}
    prev_lat, prev_lng = start_lat, start_lng
    clock = dt.datetime.combine(dt.date.today(), start_time)
    distinct = list(dict.fromkeys(chips))

    def _available(chip: str) -> list[dict]:
        role = CHIP_SLOTS[chip]["role"]
        if role_counts.get(role, 0) >= MAX_PER_ROLE:
            return []
        return [c for c in pools.get(chip, []) if c["ref"] not in picked]

    for chip in chips:
        # This kind first; then the user's other kinds, least-used role first.
        order = [chip] + sorted(
            (c for c in distinct if c != chip),
            key=lambda c: role_counts.get(CHIP_SLOTS[c]["role"], 0),
        )
        choice = next(((src, _available(src)) for src in order if _available(src)), None)
        if not choice:
            continue  # nothing left that keeps the day varied
        src, pool = choice

        best = max(pool, key=lambda c: _slot_score(
            c, prev_lat, prev_lng,
            prox_w=strategy["prox_w"], sigma=strategy["sigma"], avoid=avoid))
        role = CHIP_SLOTS[src]["role"]
        dwell = CHIP_SLOTS[src]["dwell"]
        picked.add(best["ref"])
        role_counts[role] = role_counts.get(role, 0) + 1

        walk_km = round(ranker.haversine_km(prev_lat, prev_lng, best["lat"], best["lng"]), 2)
        walk_min = round(walk_km * WALK_MIN_PER_KM)
        clock += dt.timedelta(minutes=walk_min)

        stops.append({
            **best,
            "slot": role,
            "arrive": clock.strftime("%-I:%M %p"),
            "dwell_min": dwell,
            "walk_from_prev_km": walk_km,
            "walk_from_prev_min": walk_min,
        })
        clock += dt.timedelta(minutes=dwell)
        prev_lat, prev_lng = best["lat"], best["lng"]

    return stops


def _templated_narrative(stops: list[dict]) -> str:
    """Deterministic narration — grounded by construction."""
    if not stops:
        return "No independent spots matched that plan nearby — try fewer interests or a longer day."
    lines = [
        f"{s['arrive']} — {s['name']} ({s['slot']}, "
        f"{s['average_rating']:.1f}★{', ' + str(s['walk_from_prev_min']) + ' min walk' if s['walk_from_prev_min'] else ''})"
        for s in stops
    ]
    return "Your all-independent day:\n" + "\n".join(lines)


async def plan(*, lat: Optional[float], lng: Optional[float], duration: str,
               interests: list[str], start_time: str) -> dict:
    """Build SEVERAL itineraries (the user picks). Returns ``options`` — each a
    distinct day with its own stops, totals, narrative and mode — plus the shared
    duration/interests/start the day was planned for."""
    start_lat = lat if lat is not None else settings.demo_lat
    start_lng = lng if lng is not None else settings.demo_lng
    try:
        parsed_start = dt.time.fromisoformat(start_time)
    except ValueError:
        parsed_start = dt.time(10, 0)

    chips = _plan_chips(duration, interests)
    pools = await _fetch_pools(chips, start_lat, start_lng)  # fetched once, reused

    # Build one day per strategy. Each avoids the businesses chosen by accepted
    # earlier options, so the options visit different places; any option whose
    # stop-set duplicates an earlier one (sparse area) is collapsed away.
    options: list[dict[str, Any]] = []
    used: set[str] = set()
    signatures: set[frozenset[str]] = set()
    for strat in STRATEGIES:
        stops = _build_stops(chips, pools, start_lat, start_lng, parsed_start,
                             strategy=strat, avoid=set(used))
        if not stops:
            continue
        sig = frozenset(s["ref"] for s in stops)
        if sig in signatures:
            continue
        signatures.add(sig)
        used |= sig
        options.append({
            "key": strat["key"],
            "label": strat["label"],
            "stops": stops,
            "total_walk_km": round(sum(s["walk_from_prev_km"] for s in stops), 2),
        })

    # Narrate the TOP option with the LLM (one call — protects the 20/day Gemini
    # quota); template the rest. Each narration is grounded only in its own stops.
    for idx, opt in enumerate(options):
        narrative = await llm.generate_trip_narrative(opt["stops"]) if idx == 0 else None
        opt["mode"] = "llm" if narrative else "deterministic"
        opt["narrative"] = narrative or _templated_narrative(opt["stops"])

    if not options:  # nothing matched anywhere — one empty option carries the note
        options = [{
            "key": "best", "label": "Your day", "stops": [], "total_walk_km": 0.0,
            "narrative": _templated_narrative([]), "mode": "deterministic",
        }]

    return {
        "options": options,
        "duration": duration,
        "interests": interests,
        "start": {"lat": start_lat, "lng": start_lng, "time": start_time},
    }
