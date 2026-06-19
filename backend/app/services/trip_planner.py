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
import re
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

WALK_MIN_PER_KM = 13      # ~4.6 km/h — a real sightseeing pace (stops, nav, lights)
TRIP_RADIUS_M = 4000      # candidates within a short walk/transit of the start
MAX_LEG_KM = 1.5          # a single on-foot leg shouldn't exceed ~20 min between stops
DAY_END_MIN = 21 * 60     # don't schedule a NEW stop to ARRIVE after 9:00 PM
# Active-time budget per day shape (walking + dwelling, NOT idle gaps). The day is
# truncated rather than run absurdly long; pairs with the 9 PM cutoff above.
DAY_BUDGET_MIN: dict[str, int] = {"quick": 240, "half": 360, "full": 540}
# Earliest sensible ARRIVAL for time-of-day-bound roles — so a meal can't land at
# 9 AM or a bar at 10 AM. Untimed roles (coffee/browse/shop/market) are any-time.
ROLE_EARLIEST_MIN: dict[str, int] = {"eat": 11 * 60, "drinks": 16 * 60, "dessert": 11 * 60 + 30}
# Wait at most this long for a role's window to open. An early-start day will hold
# for lunch, but a "quick coffee at 8 AM" day won't sit idle until a 4 PM bar —
# that stop is simply skipped (the combo doesn't fit the day).
MAX_WAIT_MIN = 180

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

# ── Natural-language goal parsing (deterministic) ───────────────────────────
# Maps words in a free-text "describe your day" to chip kinds, with an emphasis
# signal from nearby quantity words. Used (a) as the FALLBACK when the LLM
# interpreter is offline / out of quota — so a typed description still shapes the
# day instead of being dropped for the generic default — and (b) for the meal
# guard below. Single-word, prefix-matched tokens keep it cheap and explainable.
_GOAL_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Coffee":     ("coffee", "cafe", "cafes", "espresso", "latte", "cappuccino"),
    "Bookstore":  ("book", "books", "bookshop", "bookstore", "reading"),
    "Retail":     ("shop", "shopping", "shops", "browse", "boutique", "store",
                   "stores", "retail", "thrift", "vintage", "mall"),
    "Grocery":    ("grocery", "groceries", "market", "produce"),
    "Restaurant": ("eat", "eating", "lunch", "dinner", "brunch", "meal", "meals",
                   "food", "hungry", "restaurant", "dine", "dining", "bite"),
    "Dessert":    ("dessert", "desserts", "sweet", "sweets", "cake", "cakes",
                   "bakery", "pastry", "donut", "gelato", "sundae"),
    "Bar":        ("bar", "bars", "drinks", "cocktail", "cocktails", "beer",
                   "wine", "pub", "brewery"),
}
_MORE_WORDS = {"long", "lots", "mostly", "plenty", "tons", "much", "lot", "many"}
_LESS_WORDS = {"quick", "grab", "just", "little", "short", "one"}
_CLOSE_PHRASES = ("close", "nearby", "near", "walkable", "not far", "nothing far")


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def _kw_match(tok: str, kws: tuple[str, ...]) -> bool:
    # Exact match, or a prefix match for keywords long enough to be unambiguous
    # ("shop" → "shopping"; "bar" stays exact so it never matches "barbecue").
    return any(tok == k or (len(k) >= 4 and tok.startswith(k)) for k in kws)


def _keyword_interpret(goals: str, allowed: list[str]) -> Optional[dict]:
    """Deterministic stand-in for the LLM interpreter: pull chip kinds out of the
    free text and order them by emphasis (quantity words sitting next to each
    kind). Returns None when nothing recognisable is mentioned."""
    toks = _tokens(goals)
    scored: list[tuple[int, int, str]] = []
    for chip in allowed:
        idx = next((i for i, t in enumerate(toks)
                    if _kw_match(t, _GOAL_KEYWORDS.get(chip, ()))), None)
        if idx is None:
            continue
        near = set(toks[max(0, idx - 2):idx])  # the word(s) right before the kind
        score = (2 if near & _MORE_WORDS else 0) - (2 if near & _LESS_WORDS else 0)
        scored.append((score, idx, chip))
    if not scored:
        return None
    scored.sort(key=lambda s: (-s[0], s[1]))  # emphasis first, then order of mention
    text = goals.lower()
    return {
        "interests": [c for _, _, c in scored],
        "keep_close": any(p in text for p in _CLOSE_PHRASES),
        "summary": "",
    }


def _mentions_food(goals: str) -> bool:
    """True only when the text actually refers to a meal — the gate for whether a
    Restaurant belongs in the day at all."""
    return any(_kw_match(t, _GOAL_KEYWORDS["Restaurant"]) for t in _tokens(goals))


def _plan_chips(duration: str, interests: list[str]) -> list[str]:
    """Turn the duration + interests into an ORDERED list of stop kinds (chips).

    ``interests`` arrive in PRIORITY order (the goals-interpreter sorts them by
    emphasis: most-wanted first; a chip selection keeps its own order). We honour
    exactly what was asked — NO kind the user didn't request is ever injected
    (so "quick coffee, long shopping" never sprouts a restaurant). The day is
    then padded to the duration's target by giving the leading, most-emphasised
    kind the extra stops ("long shopping" → more shopping), capping the rest so
    the day stays varied, and finally ordered by time of day.

    Only when the user gave NO interests at all do we fall back to a balanced
    DEFAULT day — which deliberately includes a meal."""
    target = TARGET_STOPS.get(duration, 4)
    wanted = list(dict.fromkeys(c for c in interests if c in CHIP_SLOTS))
    if not wanted:
        wanted = DEFAULT_CHIPS[:]  # no input → a balanced default day (with a meal)

    chips: list[str] = []
    counts: dict[str, int] = {}

    def _add(c: str) -> None:
        chips.append(c)
        counts[c] = counts.get(c, 0) + 1

    # 1) One of each requested kind, in priority order, up to the target.
    for c in wanted:
        if len(chips) >= target:
            break
        _add(c)

    # 2) Pad to the target by priority: the FIRST (most-emphasised) kind takes
    #    the extra slots; every other kind is capped at MAX_PER_CHIP so the day
    #    stays varied. The leading kind's cap is the whole day, so a day that's
    #    "mostly shopping" really is mostly shopping.
    for idx, c in enumerate(wanted):
        cap = target if idx == 0 else MAX_PER_CHIP
        while len(chips) < target and counts.get(c, 0) < cap:
            _add(c)

    chips.sort(key=lambda c: CHIP_SLOTS[c]["rank"])
    return chips[:target]


async def _fetch_pools(chips: list[str], lat: float, lng: float,
                       radius_m: int = TRIP_RADIUS_M) -> dict[str, list[dict]]:
    """One category-driven search per distinct kind → real candidates of that
    kind near the start. Fetching per kind is what guarantees a slot is never
    empty for lack of, say, an independent coffee shop in the generic pool.
    ``radius_m`` tightens when the user asked to keep everything close."""
    pools: dict[str, list[dict]] = {}
    for chip in dict.fromkeys(chips):  # distinct, order-stable
        result = await search_service.search(SearchParams(
            lat=lat, lng=lng, radius_m=radius_m, categories=CHIP_SLOTS[chip]["cats"],
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


# Keep the day varied: default per-role ceiling when a plan doesn't say otherwise.
MAX_PER_ROLE = 2
# Browsing / coffee / shopping can repeat to fill a day, but meals, dessert, and
# bars are capped low — three restaurants or three bars back-to-back isn't a real
# day (and the extra ones would land between meal windows anyway).
ROLE_MAX: dict[str, int] = {"eat": 2, "dessert": 2, "drinks": 2}


def _fmt_clock(total_min: int) -> str:
    """Absolute minutes-from-midnight → a 12-hour clock label."""
    total_min %= 24 * 60
    return dt.time(total_min // 60, total_min % 60).strftime("%-I:%M %p")


def _build_stops(chips: list[str], pools: dict[str, list[dict]], start_lat: float,
                 start_lng: float, start_time: dt.time, *, duration: str,
                 strategy: dict[str, Any], avoid: set[str]) -> list[dict]:
    """Greedy fill, kind by kind in the day's order, kept REALISTIC:
      * each leg stays walkable (``MAX_LEG_KM``) — pick the best candidate within a
        short walk; only a scattered area falls back to the nearest, never a hole;
      * a kind can appear as many times as the PLAN asked for (a "mostly shopping"
        day really is mostly shops — the old flat per-role cap truncated those);
      * time-of-day is honoured — a meal/bar can't arrive before its window opens
        (``ROLE_EARLIEST_MIN``); and
      * the day stops before it runs too late or too long (``DAY_END_MIN`` /
        ``DAY_BUDGET_MIN``), so an itinerary never rolls past midnight.

    Each stop is labelled by the POOL it was drawn from (its role/dwell). When a
    kind is used up we borrow from another of the user's chosen kinds, least-used
    role first, so the day reaches its length while staying varied. ``strategy``
    sets the proximity/rating trade-off; ``avoid`` (earlier options' picks) steers
    this option toward fresh businesses."""
    stops: list[dict[str, Any]] = []
    picked: set[str] = set()
    role_counts: dict[str, int] = {}
    # Per-role cap comes from the PLAN itself, so the day matches what was asked
    # for (e.g. a 6-stop shopping day allows 6 shops, not a hardcoded 2).
    role_cap: dict[str, int] = {}
    for ch in chips:
        r = CHIP_SLOTS[ch]["role"]
        role_cap[r] = role_cap.get(r, 0) + 1
    # ...but never more meals/bars/desserts than is realistic for one day.
    role_cap = {r: min(n, ROLE_MAX.get(r, len(chips))) for r, n in role_cap.items()}

    prev_lat, prev_lng = start_lat, start_lng
    start_min = start_time.hour * 60 + start_time.minute
    clock = start_min
    active_min = 0  # walking + dwelling so far (idle gaps don't count)
    budget = DAY_BUDGET_MIN.get(duration, 360)
    distinct = list(dict.fromkeys(chips))

    def _available(chip: str) -> list[dict]:
        role = CHIP_SLOTS[chip]["role"]
        if role_counts.get(role, 0) >= role_cap.get(role, MAX_PER_ROLE):
            return []
        return [c for c in pools.get(chip, []) if c["ref"] not in picked]

    def _leg_km(c: dict) -> float:
        return ranker.haversine_km(prev_lat, prev_lng, c["lat"], c["lng"])

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

        # Walkable leg first: choose the best-scoring candidate within a short
        # walk; only if NONE are close (a genuinely scattered area) take the
        # nearest, so we never cross town for a marginally better rating.
        near = [c for c in pool if _leg_km(c) <= MAX_LEG_KM]
        if near:
            best = max(near, key=lambda c: _slot_score(
                c, prev_lat, prev_lng,
                prox_w=strategy["prox_w"], sigma=strategy["sigma"], avoid=avoid))
        else:
            best = min(pool, key=_leg_km)

        role = CHIP_SLOTS[src]["role"]
        dwell = CHIP_SLOTS[src]["dwell"]
        walk_km = round(_leg_km(best), 2)
        walk_min = round(walk_km * WALK_MIN_PER_KM)
        arrive = clock + walk_min
        # Time-of-day realism: hold for a meal/bar window to open rather than
        # arriving for dinner at 9 AM — but only up to MAX_WAIT_MIN, so an early
        # day doesn't sit idle for hours waiting on a late-window kind (skip it).
        earliest = ROLE_EARLIEST_MIN.get(role)
        if earliest is not None and arrive < earliest:
            if earliest - arrive > MAX_WAIT_MIN:
                continue
            arrive = earliest
        # End the day before it lands too late or its activity load overruns the
        # shape's budget — but always keep the first stop so a day is never empty.
        if arrive > DAY_END_MIN:
            break
        if stops and active_min + walk_min + dwell > budget:
            break

        picked.add(best["ref"])
        role_counts[role] = role_counts.get(role, 0) + 1
        active_min += walk_min + dwell
        stops.append({
            **best,
            "slot": role,
            "arrive": _fmt_clock(arrive),
            "dwell_min": dwell,
            "walk_from_prev_km": walk_km,
            "walk_from_prev_min": walk_min,
        })
        clock = arrive + dwell
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
               interests: list[str], start_time: str,
               goals: Optional[str] = None) -> dict:
    """Build SEVERAL itineraries (the user picks). Returns ``options`` — each a
    distinct day with its own stops, totals, narrative and mode — plus the shared
    duration/interests/start the day was planned for.

    If ``goals`` (a free-text "describe your day") is given, ONE Gemini call
    interprets it into the planning inputs — which kinds of stops to include,
    whether to keep everything close, and a one-line framing — so the options
    fit what the user actually described. The deterministic core still builds
    the route, so a quota/LLM failure simply falls back to the chip selection."""
    start_lat = lat if lat is not None else settings.demo_lat
    start_lng = lng if lng is not None else settings.demo_lng
    try:
        parsed_start = dt.time.fromisoformat(start_time)
    except ValueError:
        parsed_start = dt.time(10, 0)

    # Natural-language goals → structured inputs (enrichment only; never required).
    interpretation: Optional[dict] = None
    if goals and goals.strip():
        interpretation = await llm.interpret_trip_goals(goals, list(CHIP_SLOTS.keys()))
        if interpretation is None:
            # LLM offline / out of quota / bad JSON → deterministic keyword reading
            # so the typed description still shapes the day (rather than being
            # dropped, leaving only the generic default).
            interpretation = _keyword_interpret(goals, list(CHIP_SLOTS.keys()))
        # Meal guard: the interpreter (especially the LLM) tends to anchor a
        # sit-down meal even when none was asked for. Drop a goals-derived
        # Restaurant unless the description actually mentions food — so
        # "quick coffee, long shopping" never sprouts a restaurant. (A Restaurant
        # the user TICKED as a chip is still honoured: chips are merged in below.)
        if (interpretation and "Restaurant" in interpretation["interests"]
                and not _mentions_food(goals)):
            interpretation = {
                **interpretation,
                "interests": [i for i in interpretation["interests"] if i != "Restaurant"],
            }

    effective_interests = list(interests)
    radius_m = TRIP_RADIUS_M
    if interpretation:
        if interpretation["interests"]:
            # The description leads; any chips the user also ticked are appended.
            effective_interests = list(
                dict.fromkeys(interpretation["interests"] + list(interests)))
        if interpretation["keep_close"]:
            radius_m = TRIP_RADIUS_M // 2  # "nothing far" → a tighter candidate pool

    chips = _plan_chips(duration, effective_interests)
    pools = await _fetch_pools(chips, start_lat, start_lng, radius_m)  # fetched once, reused

    # Build one day per strategy. Each avoids the businesses chosen by accepted
    # earlier options, so the options visit different places; any option whose
    # stop-set duplicates an earlier one (sparse area) is collapsed away.
    options: list[dict[str, Any]] = []
    used: set[str] = set()
    signatures: set[frozenset[str]] = set()
    for strat in STRATEGIES:
        stops = _build_stops(chips, pools, start_lat, start_lng, parsed_start,
                             duration=duration, strategy=strat, avoid=set(used))
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

    # Narrate the TOP option (one LLM call at most — protects the 20/day Gemini
    # quota); template the rest. When the user described their day, frame the top
    # option with the summary Gemini ALREADY wrote (no second call); otherwise
    # narrate it the original way. Each narration is grounded in its own stops.
    goal_summary = (interpretation or {}).get("summary")
    for idx, opt in enumerate(options):
        if idx == 0 and goal_summary:
            opt["narrative"] = f"{goal_summary}\n\n{_templated_narrative(opt['stops'])}"
            opt["mode"] = "llm"
        elif idx == 0:
            narrative = await llm.generate_trip_narrative(opt["stops"])
            opt["mode"] = "llm" if narrative else "deterministic"
            opt["narrative"] = narrative or _templated_narrative(opt["stops"])
        else:
            opt["mode"] = "deterministic"
            opt["narrative"] = _templated_narrative(opt["stops"])

    if not options:  # nothing matched anywhere — one empty option carries the note
        options = [{
            "key": "best", "label": "Your day", "stops": [], "total_walk_km": 0.0,
            "narrative": _templated_narrative([]), "mode": "deterministic",
        }]

    return {
        "options": options,
        "duration": duration,
        "interests": effective_interests,
        "start": {"lat": start_lat, "lng": start_lng, "time": start_time},
        # What Gemini understood from the free-text goals (null when none/failed),
        # so the UI can show the user their day was read correctly.
        "interpretation": interpretation,
    }
