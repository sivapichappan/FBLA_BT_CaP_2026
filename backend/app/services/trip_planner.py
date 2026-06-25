"""The small-business trip planner — multi-stop local itineraries (§plan D).

EVERYTHING here is independent-only by construction: candidates come from
``search_service.search()``, whose classifier pipeline hides chains from every
result — so a chain can never appear in an itinerary.

Deterministic core (works offline, fully explainable):
  1. The user's INTERESTS drive the day. Each selected chip (Coffee, Bookstore,
     Restaurant, …) becomes a stop of that kind; the day is padded to the
     requested number of stops and ordered morning→evening.
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

import asyncio
import datetime as dt
import math
import re
from typing import Any, Optional

from app.config import settings
from app.models.business import SearchParams
from app.repositories import businesses as businesses_repo
from app.repositories import deals as deals_repo
from app.repositories import favorites as favorites_repo
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

# A balanced default day when the user picks no interests, and the padding pool.
DEFAULT_CHIPS = ["Coffee", "Restaurant", "Dessert", "Bookstore", "Bar"]
MAX_PER_CHIP = 2  # at most two coffee stops, two meals, etc.

WALK_MIN_PER_KM = 13      # ~4.6 km/h — a real sightseeing pace (stops, nav, lights)
TRIP_RADIUS_M = 4000      # candidates within a short walk/transit of the start
MAX_LEG_KM = 1.5          # a single on-foot leg shouldn't exceed ~20 min between stops
# The ABSOLUTE max we'll force a walk when nothing is within MAX_LEG_KM (a sparse,
# spread-out area). Beyond ~40 min it isn't a walk — we'd rather DROP the stop and
# show a shorter, honestly-walkable day than route the user on a 5 km hike.
MAX_FALLBACK_LEG_KM = 3.0
# The day's length + stop count are now the user's explicit start_time / end_time
# / num_stops, so there are no duration presets here — the window caps the clock
# (a stop can't ARRIVE, or still be mid-visit, after end_time) and num_stops caps
# the count.
# Earliest sensible ARRIVAL for time-of-day-bound roles — so a meal can't land at
# 9 AM or a bar at 10 AM. Untimed roles (coffee/browse/shop/market) are any-time.
ROLE_EARLIEST_MIN: dict[str, int] = {"eat": 11 * 60, "drinks": 16 * 60, "dessert": 11 * 60 + 30}
# Wait at most this long for a role's window to open. An early-start day will hold
# for lunch, but a "quick coffee at 8 AM" day won't sit idle until a 4 PM bar —
# that stop is simply skipped (the combo doesn't fit the day).
MAX_WAIT_MIN = 180

# ── Filling the day to the window (use end_time as a TARGET, not just a cap) ──
# A relaxed day with only a few stops can finish well before end_time — the old
# behaviour packed stops as early as possible and left the rest of the window
# unused (the reported "I said till 4 PM but everything ends by 2" bug). When the
# user gave a window meaningfully longer than the day's content, we SPREAD the day
# to use it: a single midday meal is nudged toward lunchtime, each stop is allowed
# to linger a little longer (up to a realistic per-role ceiling), and any time
# still left becomes short "free time to explore" gaps between stops — so the last
# stop ends NEAR end_time. We only ever spend slack the user already gave; a stop
# is never added or moved past end_time.
MIN_FILL_SLACK_MIN = 15   # below ~15 min unused, the day is effectively full → leave it byte-identical (also makes the spread idempotent on re-time)
MAX_EXPLORE_GAP_MIN = 45  # a single between-stops "explore the neighborhood" gap caps here — pleasant breathing room, not an abandoned afternoon
LUNCH_TARGET_MIN = 12 * 60 + 30  # 12:30 — the clock a lone midday meal is nudged toward, so it sits mid-day with stops flowing before AND after it
LATEST_ARRIVAL_MIN = 21 * 60 + 30  # 21:30 — never spread a day so a stop ARRIVES later than this (you don't start a new activity near 10 PM); an evening day just ends a bit before end_time
# Per-role dwell CEILING when stretching to fill the window: a relaxed lunch can
# grow to a leisurely ~2 h, but a coffee never becomes a 3-hour sit. NOTE: this
# caps MINUTES; the separate ROLE_MAX (defined below) caps the COUNT of a role in
# one day — different concepts, deliberately different names.
ROLE_MAX_DWELL: dict[str, int] = {
    "coffee": 75, "browse": 90, "shop": 90, "market": 60,
    "eat": 120, "dessert": 45, "drinks": 90,
}

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


# ── Personalisation knobs (deterministic) ───────────────────────────────────
# Audience + occasion reshape the day's DEFAULTS and pacing — never the kinds a
# user explicitly ticked. `default_chips` is the no-interest fallback day for that
# audience; `dwell_mult` scales time-per-stop; `sigma_mult` tightens/loosens the
# walkable radius; `prox_w_add` nudges the proximity-vs-rating trade-off (higher =
# stay closer). Occasion layers on top (and can override the default day). All
# multipliers are clamped AFTER merging so e.g. relaxed×celebrate can't balloon.
def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


AUDIENCE_PROFILES: dict[str, dict[str, Any]] = {
    "solo":   {"default_chips": ["Coffee", "Bookstore", "Retail", "Dessert"],  "dwell_mult": 1.0, "sigma_mult": 1.0, "prox_w_add": 0.0},
    "couple": {"default_chips": ["Coffee", "Restaurant", "Dessert", "Bar"],    "dwell_mult": 1.1, "sigma_mult": 0.9, "prox_w_add": 0.0},
    "family": {"default_chips": ["Coffee", "Restaurant", "Dessert", "Retail"], "dwell_mult": 0.9, "sigma_mult": 0.8, "prox_w_add": 0.1},
    "group":  {"default_chips": ["Coffee", "Restaurant", "Bar", "Dessert"],    "dwell_mult": 1.1, "sigma_mult": 1.1, "prox_w_add": 0.0},
}
OCCASION_MODIFIERS: dict[str, dict[str, Any]] = {
    "casual":    {"default_chips": None,                                        "dwell_mult": 1.0,  "sigma_mult": 1.0,  "prox_w_add": 0.0},
    "date":      {"default_chips": ["Coffee", "Restaurant", "Bar", "Dessert"],  "dwell_mult": 1.15, "sigma_mult": 0.85, "prox_w_add": 0.0},
    "celebrate": {"default_chips": ["Restaurant", "Bar", "Dessert", "Coffee"],  "dwell_mult": 1.2,  "sigma_mult": 1.0,  "prox_w_add": 0.0},
}
# Pace scales time-per-stop: packed fits more stops in the same window; relaxed
# lingers (so fewer stops fit). Multiplied with the profile's dwell_mult.
PACE_DWELL_MULT: dict[str, float] = {"relaxed": 1.4, "normal": 1.0, "packed": 0.7}


def _resolve_profile(audience: Optional[str], occasion: Optional[str]) -> dict[str, Any]:
    """Merge audience + occasion into one effective profile. Occasion's default
    day (when set) wins over the audience's; dwell/sigma multipliers multiply,
    prox_w_add adds — all clamped so the knobs can't compound to absurd values."""
    a = AUDIENCE_PROFILES.get(audience or "", {})
    o = OCCASION_MODIFIERS.get(occasion or "", {})
    return {
        "default_chips": o.get("default_chips") or a.get("default_chips"),
        "dwell_mult": _clamp(a.get("dwell_mult", 1.0) * o.get("dwell_mult", 1.0), 0.6, 1.6),
        "sigma_mult": _clamp(a.get("sigma_mult", 1.0) * o.get("sigma_mult", 1.0), 0.5, 1.8),
        "prox_w_add": _clamp(a.get("prox_w_add", 0.0) + o.get("prox_w_add", 0.0), -0.3, 0.3),
    }


# Budget ($/$$/$$$) → the price_levels we'll allow in the candidate searches. Each
# level is a CEILING: $ keeps it cheap, $$ is moderate, $$$ removes the cap (splurge
# friendly). price_level is the only spend signal both local + Google candidates carry.
_BUDGET_PRICE_LEVELS: dict[int, Optional[list[int]]] = {1: [1, 2], 2: [1, 2, 3], 3: None}

# A rough per-visit dollar FLOOR by role, indexed by price_level 1–4 — real-world
# NYC ballpark numbers to ground the "≈ $X kept local" estimate. Deliberately
# conservative estimates, NOT quotes.
ROLE_SPEND_BASE: dict[str, list[int]] = {
    "coffee":  [6, 9, 14, 20],
    "browse":  [0, 6, 14, 24],     # a bookstore visit — often nothing, maybe a book
    "shop":    [12, 25, 55, 110],
    "market":  [10, 18, 30, 50],
    "eat":     [15, 28, 48, 80],
    "dessert": [6, 9, 13, 18],
    "drinks":  [10, 16, 24, 38],
}


def _estimate_spend(stops: list[dict]) -> dict[str, int]:
    """Ballpark the day's local spend from each stop's role + price_level. Stops
    with no price data are counted separately so the UI can caveat the figure."""
    low = 0
    unknown = 0
    for s in stops:
        base = ROLE_SPEND_BASE.get(s.get("slot", ""))
        pl = s.get("price_level")
        if base and isinstance(pl, int) and 1 <= pl <= 4:
            low += base[pl - 1]
        else:
            unknown += 1
    # A ~1.6× upper band conveys the inherent uncertainty without inventing detail.
    return {"low": low, "high": round(low * 1.6), "unknown_count": unknown}


# Friendly labels for the order-realism note (idea 2) — internal role → words.
_ROLE_LABEL: dict[str, str] = {
    "coffee": "coffee", "browse": "the bookstore", "shop": "shopping",
    "market": "the market", "eat": "the meal", "dessert": "dessert", "drinks": "drinks",
}


def _sequence_note(stops: list[dict], sequence: Optional[list[str]]) -> Optional[str]:
    """When the user asked for an order, say honestly what happened: a kind that
    didn't fit the window, or an order we nudged so each stop lands at a realistic
    time. None when the day followed the requested order."""
    if not sequence or not stops:
        return None
    req_roles = list(dict.fromkeys(
        CHIP_SLOTS[c]["role"] for c in sequence if c in CHIP_SLOTS))
    if not req_roles:
        return None
    got_roles = list(dict.fromkeys(s["slot"] for s in stops))
    missing = [r for r in req_roles if r not in got_roles]
    if missing:
        labels = ", ".join(_ROLE_LABEL.get(r, r) for r in missing)
        return (f"We couldn't fit {labels} into your time window — "
                f"try a longer day or fewer stops.")
    # Both present: did the requested roles come out in the requested order?
    if [r for r in got_roles if r in req_roles] != [r for r in req_roles if r in got_roles]:
        return ("We nudged the order so each stop lands at a realistic time "
                "(a meal at lunch, drinks in the evening).")
    return None


def _attach_deals(stops: list[dict]) -> None:
    """Attach ACTIVE LocalLens deals to stops (idea 10a). Local stops resolve
    directly by id; Google stops only have deals if a local row was materialized
    (prior review/visit). Guarded so the offline/no-DB demo just leaves stops
    deal-less. Sets ``deals`` only when there ARE deals (lean + additive)."""
    if not stops:
        return
    ref_to_id: dict[str, int] = {}
    place_ids: list[str] = []
    for s in stops:
        ref = str(s["ref"])
        if ref.isdigit():
            ref_to_id[ref] = int(ref)
        elif ref.startswith("gp_"):
            place_ids.append(ref[3:])
    try:
        for pid, bid in businesses_repo.place_ids_to_local_ids(place_ids).items():
            ref_to_id["gp_" + pid] = bid
        deals_by_id = deals_repo.list_active_for_businesses(
            list(set(ref_to_id.values())))
    except Exception:
        return
    for s in stops:
        ds = deals_by_id.get(ref_to_id.get(str(s["ref"])), [])
        if ds:
            s["deals"] = [{"id": d["id"], "title": d["title"],
                           "discount_pct": d["discount_pct"]} for d in ds]


def _annotate_open(stops: list[dict], weekday: int,
                   hours_by_ref: dict[str, list[dict]]) -> None:
    """Tag each stop with whether it's open WHEN YOU ARRIVE (idea 3, lightweight).
    LOCAL businesses have structured hours → a real weekday+time check; Google
    stops only carry the current ``is_open_now``, so they're marked hours-unknown
    (the UI shows a neutral 'hours unknown' badge for those)."""
    for s in stops:
        hrs = hours_by_ref.get(s["ref"])
        if hrs is not None:
            s["hours_known"] = True
            s["open_at_arrival"] = search_service.open_at(
                hrs, weekday, s.get("arrive_min", 0))
        else:
            s["hours_known"] = False
            s["open_at_arrival"] = s.get("is_open_now")


# ── Natural-language goal parsing (deterministic) ───────────────────────────
# Maps words in a free-text "describe your day" to chip kinds, with an emphasis
# signal from nearby quantity words. Used (a) as the FALLBACK when the LLM
# interpreter is offline / out of quota — so a typed description still shapes the
# day instead of being dropped for the generic default — and (b) for the meal
# guard below. Single-word, prefix-matched tokens keep it cheap and explainable.
_GOAL_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Coffee":     ("coffee", "cafe", "cafes", "espresso", "latte", "cappuccino"),
    "Bookstore":  ("book", "books", "bookshop", "bookstore", "read", "reading"),
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
    # Sequence = the order the kinds were MENTIONED (chronological-ish); interests
    # = the same kinds re-sorted by emphasis. (idea 2 sequence vs idea's priority.)
    sequence = [c for _, _, c in sorted(scored, key=lambda s: s[1])]
    scored.sort(key=lambda s: (-s[0], s[1]))  # emphasis first, then order of mention
    text = goals.lower()
    return {
        "interests": [c for _, _, c in scored],
        "sequence": sequence,
        "keep_close": any(p in text for p in _CLOSE_PHRASES),
        "summary": "",
    }


def _mentions_food(goals: str) -> bool:
    """True only when the text actually refers to a meal — the gate for whether a
    Restaurant belongs in the day at all."""
    return any(_kw_match(t, _GOAL_KEYWORDS["Restaurant"]) for t in _tokens(goals))


# Untimed kinds (coffee/browse/shop/market) can happen at any time, so they flow
# AROUND a meal; the timed kinds (the meal itself, dessert, drinks) anchor to their
# windows. Used to center a lone midday meal instead of leaving it the last stop.
_UNTIMED_ROLES = {"coffee", "browse", "shop", "market"}


def _center_meal(chips: list[str]) -> list[str]:
    """Put a single midday meal in the MIDDLE of the day, with the any-time stops
    (coffee/browse/shop) flowing before AND after it — so a day reads "coffee,
    bookstore, lunch, shopping" rather than ending on the meal (the reported
    "everything ends at lunch" feel). Fires ONLY for a day with exactly one meal
    AND at least one any-time stop; a meal-less day, a multi-meal day, or a
    dessert/drinks-terminal evening keeps its time-of-day order untouched.
    _build_stops still enforces ROLE_EARLIEST_MIN, so the meal can never land
    before its window — this only decides ORDER, not the clock."""
    eats = [c for c in chips if CHIP_SLOTS[c]["role"] == "eat"]
    untimed = [c for c in chips if CHIP_SLOTS[c]["role"] in _UNTIMED_ROLES]
    if len(eats) != 1 or not untimed:
        return chips
    # Split the any-time stops in half: the morning gets the extra one (ceil), so a
    # 3-untimed day is 2 before lunch + 1 after. Dessert/drinks stay after, by rank.
    half = (len(untimed) + 1) // 2
    tail = [c for c in chips if CHIP_SLOTS[c]["role"] not in _UNTIMED_ROLES
            and CHIP_SLOTS[c]["role"] != "eat"]
    return untimed[:half] + eats + untimed[half:] + tail


def _plan_chips(num_stops: int, interests: list[str], *,
                default_chips: Optional[list[str]] = None,
                preferred_sequence: Optional[list[str]] = None) -> list[str]:
    """Turn the requested stop count + interests into an ORDERED list of stop
    kinds (chips).

    ``interests`` arrive in PRIORITY order (the goals-interpreter sorts them by
    emphasis: most-wanted first; a chip selection keeps its own order). We honour
    exactly what was asked — NO kind the user didn't request is ever injected
    (so "quick coffee, long shopping" never sprouts a restaurant). The list is
    then padded to ``num_stops`` by giving the leading, most-emphasised kind the
    extra stops ("long shopping" → more shopping), capping the rest so the day
    stays varied, and finally ordered by time of day.

    Only when the user gave NO interests at all do we fall back to a balanced
    DEFAULT day — which deliberately includes a meal."""
    target = max(1, num_stops)
    wanted = list(dict.fromkeys(c for c in interests if c in CHIP_SLOTS))
    if not wanted:
        # No input → a balanced default day; the audience/occasion profile can
        # supply its own default shape (e.g. family drops the bar).
        wanted = (default_chips or DEFAULT_CHIPS)[:]

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

    # 2) Pad to the target with kinds that realistically REPEAT — coffee, browse,
    #    shopping, markets. Meals, desserts and bars are NOT padded (you don't eat
    #    two lunches), so a day never sprouts a 2nd restaurant while a requested
    #    shop or bookstore goes unplaced (the reported bug). The leading repeatable
    #    kind takes the bulk, so "mostly shopping" really is mostly shopping.
    repeatable = [c for c in wanted if CHIP_SLOTS[c]["role"] not in ROLE_MAX]
    for idx, c in enumerate(repeatable):
        cap = target if idx == 0 else MAX_PER_CHIP
        while len(chips) < target and counts.get(c, 0) < cap:
            _add(c)

    # Order the day. By default that's time-of-day (rank). When the user described
    # a SEQUENCE ("coffee, then books, then lunch"), lead with that order and use
    # rank only as a tiebreaker — _build_stops still enforces ROLE_EARLIEST_MIN, so
    # a sequenced bar can't actually land at 8 AM (it just leads where it fits).
    if preferred_sequence:
        seq_idx = {c: i for i, c in enumerate(preferred_sequence)}
        chips.sort(key=lambda c: (seq_idx.get(c, len(preferred_sequence)), CHIP_SLOTS[c]["rank"]))
        return chips[:target]
    # No described order: time-of-day rank, then center a lone meal so the day flows
    # coffee → browse → lunch → shopping instead of ending on the meal.
    chips.sort(key=lambda c: CHIP_SLOTS[c]["rank"])
    return _center_meal(chips[:target])


async def _fetch_pools(chips: list[str], lat: float, lng: float,
                       radius_m: int = TRIP_RADIUS_M,
                       price_levels: Optional[list[int]] = None,
                       accessible_only: bool = False) -> dict[str, list[dict]]:
    """One category-driven search per distinct kind → real candidates of that
    kind near the start. Fetching per kind is what guarantees a slot is never
    empty for lack of, say, an independent coffee shop in the generic pool.
    ``radius_m`` tightens when the user asked to keep everything close.

    The searches are independent, so we run them CONCURRENTLY: at a fresh (un-
    cached) location each live search costs a few seconds, and doing 5 of them in
    series blew past the client's request timeout. Gathering them makes the total
    ≈ the slowest single search instead of their sum."""
    distinct = list(dict.fromkeys(chips))  # order-stable, deduped

    async def _one(chip: str) -> tuple[str, list[dict]]:
        result = await search_service.search(SearchParams(
            lat=lat, lng=lng, radius_m=radius_m, categories=CHIP_SLOTS[chip]["cats"],
            price_levels=price_levels or [],  # budget caps the pool ([] = no cap)
            wheelchair_accessible=accessible_only,  # accessible-only day → filter the pool
        ))
        return chip, [b.model_dump() for b in result.results]

    return dict(await asyncio.gather(*(_one(c) for c in distinct)))


# A signed-in user's favourited spot gets a GENTLE nudge — enough to surface it,
# not enough to override a much closer/better-rated option (idea 10b).
FAVORITE_BONUS = 1.25


def _slot_score(candidate: dict, prev_lat: float, prev_lng: float, *,
                prox_w: float, sigma: float, avoid: set[str],
                favorite_refs: Optional[set[str]] = None) -> float:
    """How good is this candidate for the CURRENT stop, walking from HERE?
    ``prox_w`` trades off walkability vs. rating per the chosen day-shape; a
    business already used by an earlier option is heavily penalised so options
    visit different places (but can still be reused if nothing else is left). A
    favourited business gets a small bonus so the user's spots surface."""
    distance_km = ranker.haversine_km(prev_lat, prev_lng, candidate["lat"], candidate["lng"])
    proximity = math.exp(-(distance_km**2) / (2 * sigma**2))
    rating = ranker.bayesian_rating(
        candidate.get("average_rating") or 0, candidate.get("review_count") or 0
    ) / 5.0
    score = prox_w * proximity + (1.0 - prox_w) * rating
    if candidate["ref"] in avoid:
        score *= NOVELTY_PENALTY
    if favorite_refs and candidate["ref"] in favorite_refs:
        score *= FAVORITE_BONUS
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


# The candidate fields a "bench" alternate needs to render as a stop after a swap
# (idea 1) — trimmed so the response doesn't carry whole BusinessOut dicts ×3/stop.
_BENCH_FIELDS = (
    "ref", "source", "name", "lat", "lng", "address", "price_level", "categories",
    "average_rating", "review_count", "local_badge", "photo_url",
    "photo_focus_x", "photo_focus_y", "is_open_now",
)


def _trim_candidate(c: dict) -> dict:
    return {k: c.get(k) for k in _BENCH_FIELDS}


def _clock_stops(stops: list[dict], start_lat: float, start_lng: float,
                 start_min: int, end_min: int, *,
                 dwell_overrides: Optional[dict[str, int]] = None) -> dict:
    """Re-walk an ORDERED stop list and recompute every walk leg + arrival clock —
    the SINGLE authority for a day's clock, shared by the builder's window-fill and
    the client-edit ``retime`` so the two can never drift. Honours each stop's own
    ``dwell_min`` and any ``explore_after_min`` (a "free time to explore" gap left
    after the PREVIOUS stop), re-applies the meal/bar earliest-arrival windows, and
    flags ``over_window`` when the day no longer fits. Pure: no DB / LLM / network."""
    overrides = dwell_overrides or {}
    clock = start_min
    prev_lat, prev_lng = start_lat, start_lng
    prev_gap = 0  # explore gap left after the previous stop (0 before the first stop)
    out: list[dict] = []
    over = False
    for s in stops:
        walk_km = round(ranker.haversine_km(prev_lat, prev_lng, s["lat"], s["lng"]), 2)
        walk_min = round(walk_km * WALK_MIN_PER_KM)
        arrive = clock + walk_min + prev_gap
        earliest = ROLE_EARLIEST_MIN.get(s.get("slot"))
        if earliest is not None and arrive < earliest:
            arrive = earliest
        dwell = int(overrides.get(s["ref"], s.get("dwell_min", 30)))
        if arrive + dwell > end_min:
            over = True
        out.append({
            **s,
            "arrive": _fmt_clock(arrive),
            "arrive_min": arrive,
            "dwell_min": dwell,
            "walk_from_prev_km": walk_km,
            "walk_from_prev_min": walk_min,
        })
        clock = arrive + dwell
        prev_lat, prev_lng = s["lat"], s["lng"]
        prev_gap = int(s.get("explore_after_min", 0) or 0)
    return {
        "stops": out,
        "total_walk_km": round(sum(o["walk_from_prev_km"] for o in out), 2),
        "over_window": over,
    }


def _spread_to_window(stops: list[dict], start_lat: float, start_lng: float,
                      start_min: int, end_min: int) -> list[dict]:
    """Spread a finished day across the user's window so the last stop ends NEAR
    end_time instead of two hours early (the window is a TARGET, not just a cap).
    Three moves, in order: (1) nudge a lone midday meal toward lunchtime by letting
    the stop before it linger, so the meal sits mid-day with stops before AND after;
    (2) let every stop stay a little longer, up to a realistic per-role ceiling (a
    relaxed lunch can reach ~2 h, coffee never a 3-hour sit); (3) sprinkle any time
    still left as short "explore" gaps between stops. We only ever spend the slack
    the user already gave (end_time minus when the day currently finishes), so the
    day never runs past end_time and no stop is added or dropped. Returns the same
    stops, re-clocked, with stretched ``dwell_min`` and additive ``explore_after_min``."""
    if not stops:
        return stops
    content_end = stops[-1]["arrive_min"] + stops[-1]["dwell_min"]
    # Fill toward end_time, but never push the last stop's ARRIVAL past the latest
    # sensible start-of-activity — you don't begin a new stop near 10 PM. Capping the
    # FILL target at LATEST_ARRIVAL + the last stop's stay keeps every arrival ≤ 21:30
    # (a late-evening window just ends a little before end_time). Daytime windows sit
    # far below this cap, so they still fill all the way to end_time.
    fill_end = min(end_min, max(content_end, LATEST_ARRIVAL_MIN + stops[-1]["dwell_min"]))
    remaining = fill_end - content_end
    if remaining < MIN_FILL_SLACK_MIN:
        return stops  # already effectively full → byte-identical (and idempotent)

    # (1) Nudge a single midday meal toward lunchtime by lingering at the stop
    #     before it (a pre-lunch wander), then re-clock so the meal + tail reflect it.
    eat_idx = [i for i, s in enumerate(stops) if s.get("slot") == "eat"]
    if len(eat_idx) == 1 and eat_idx[0] > 0:
        i = eat_idx[0]
        want = LUNCH_TARGET_MIN - stops[i]["arrive_min"]  # how much later we'd like lunch
        if want > 0:
            nudge = min(want, MAX_EXPLORE_GAP_MIN, remaining)
            stops[i - 1]["explore_after_min"] = stops[i - 1].get("explore_after_min", 0) + nudge
            stops = _clock_stops(stops, start_lat, start_lng, start_min, end_min)["stops"]

    # Slack actually left after the nudge.
    remaining = fill_end - (stops[-1]["arrive_min"] + stops[-1]["dwell_min"])

    # (2) Let each stop linger longer, in proportion to its remaining headroom and
    #     never above its per-role ceiling (so no 3-hour coffee).
    if remaining > 0:
        headroom = [max(0, ROLE_MAX_DWELL.get(s.get("slot", ""), s["dwell_min"]) - s["dwell_min"])
                    for s in stops]
        total_head = sum(headroom)
        if total_head > 0:
            grow = min(remaining, total_head)
            added = [(grow * h) // total_head for h in headroom]
            # Hand out the rounding remainder one minute at a time to stops that
            # still have headroom — so the total added is EXACTLY ``grow`` (never
            # overshooting the slack, never exceeding a ceiling).
            leftover = grow - sum(added)
            j = 0
            while leftover > 0:
                k = j % len(stops)
                if added[k] < headroom[k]:
                    added[k] += 1
                    leftover -= 1
                j += 1
                if j > len(stops) * (max(headroom) + 1):
                    break  # defensive: never loop forever
            for s, a in zip(stops, added):
                s["dwell_min"] += a
            remaining -= sum(added)

    # (3) Any time still unfilled → short explore gaps between stops (each capped),
    #     so the tail reaches end_time; the earliest gaps fill first.
    for idx in range(len(stops) - 1):
        if remaining <= 0:
            break
        cur = stops[idx].get("explore_after_min", 0)
        add = min(MAX_EXPLORE_GAP_MIN - cur, remaining)
        if add > 0:
            stops[idx]["explore_after_min"] = cur + add
            remaining -= add

    # Final re-clock so arrive/arrive_min reflect the stretched dwells + gaps.
    return _clock_stops(stops, start_lat, start_lng, start_min, end_min)["stops"]


def _build_stops(chips: list[str], pools: dict[str, list[dict]], start_lat: float,
                 start_lng: float, start_time: dt.time, *, end_time: dt.time,
                 strategy: dict[str, Any], avoid: set[str],
                 dwell_mult: float = 1.0, weekday: Optional[int] = None,
                 hours_by_ref: Optional[dict[str, list[dict]]] = None,
                 locked_refs: Optional[set[str]] = None,
                 favorite_refs: Optional[set[str]] = None,
                 diag: Optional[dict] = None) -> list[dict]:
    """Greedy fill, kind by kind in the day's order, kept REALISTIC:
      * each leg stays walkable (``MAX_LEG_KM``) — pick the best candidate within a
        short walk; only a scattered area falls back to the nearest, never a hole;
      * a kind can appear as many times as the PLAN asked for (a "mostly shopping"
        day really is mostly shops — the old flat per-role cap truncated those);
      * time-of-day is honoured — a meal/bar can't arrive before its window opens
        (``ROLE_EARLIEST_MIN``); and
      * the day stays inside the user's window — a stop can't ARRIVE, or still be
        mid-visit, after ``end_time`` — so an itinerary never overruns the time
        the user gave it.

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
    end_min = end_time.hour * 60 + end_time.minute
    clock = start_min
    distinct = list(dict.fromkeys(chips))
    locked = locked_refs or set()

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
        src_role = CHIP_SLOTS[src]["role"]

        def _scored(c: dict) -> float:
            """Slot score, softly penalised when we KNOW the candidate is closed
            at the time we'd arrive (only for local businesses whose hours we have
            and only when a day was chosen) — steers toward open spots without a
            hard filter (arrival time itself depends on which candidate we pick)."""
            s = _slot_score(c, prev_lat, prev_lng,
                            prox_w=strategy["prox_w"], sigma=strategy["sigma"],
                            avoid=avoid, favorite_refs=favorite_refs)
            if weekday is not None and hours_by_ref:
                arr = clock + round(_leg_km(c) * WALK_MIN_PER_KM)
                e = ROLE_EARLIEST_MIN.get(src_role)
                if e is not None and arr < e:
                    arr = e
                if search_service.open_at(hours_by_ref.get(c["ref"]), weekday, arr) is False:
                    s *= 0.1
            return s

        # A stop the user LOCKED on a previous plan wins outright (idea 1) — we
        # keep that exact place when re-planning around it.
        forced = next((c for c in pool if c["ref"] in locked and c["ref"] not in picked), None)
        # Walkable leg first: choose the best-scoring candidate within a short
        # walk; only if NONE are close (a genuinely scattered area) take the
        # nearest, so we never cross town for a marginally better rating.
        near = [c for c in pool if _leg_km(c) <= MAX_LEG_KM]
        if forced is not None:
            best, is_locked = forced, True
        elif near:
            best, is_locked = max(near, key=_scored), False
        else:
            # No walkable candidate. Take the nearest ONLY if it's within the
            # absolute fallback distance; otherwise DROP this kind rather than send
            # the user on a 5 km hike (the reported spread-out-area bug). Skipping
            # lets the loop try another kind that may be closer to the start; if
            # nothing is within range the day is honestly short/empty.
            nearest = min(pool, key=_leg_km)
            if _leg_km(nearest) > MAX_FALLBACK_LEG_KM:
                if diag is not None:
                    diag["spread_out"] = True
                continue
            best, is_locked = nearest, False

        # A small "bench" of walkable same-kind alternates (best-first) lets the
        # user SWAP this stop instantly + offline — no extra round-trip (idea 1).
        ranked = sorted(near, key=_scored, reverse=True) if near else sorted(pool, key=_leg_km)
        bench = [_trim_candidate(c) for c in ranked
                 if c["ref"] != best["ref"] and c["ref"] not in picked][:3]

        role = CHIP_SLOTS[src]["role"]
        # Pace + audience/occasion scale time-per-stop; floor at 10 min.
        dwell = max(10, round(CHIP_SLOTS[src]["dwell"] * dwell_mult))
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
        # Keep the day inside the user's window: stop once a pick would arrive
        # after end_time, or (past the first stop) still be mid-visit when the
        # window closes. The first stop is always kept so a day is never empty.
        if arrive > end_min:
            break
        if stops and arrive + dwell > end_min:
            break

        picked.add(best["ref"])
        role_counts[role] = role_counts.get(role, 0) + 1
        stop = {
            **best,
            "slot": role,
            "arrive": _fmt_clock(arrive),
            "arrive_min": arrive,  # raw minutes — used by open-at + client re-timing
            "dwell_min": dwell,
            "walk_from_prev_km": walk_km,
            "walk_from_prev_min": walk_min,
            "bench": bench,
            "locked": is_locked,
        }
        # Mark favourites (only when true) so anonymous output stays untouched.
        if favorite_refs and best["ref"] in favorite_refs:
            stop["is_favorite"] = True
        stops.append(stop)
        clock = arrive + dwell
        prev_lat, prev_lng = best["lat"], best["lng"]

    # Use the window as a TARGET, not just a cap: spread a short day so it ends near
    # end_time (longer leisurely stays + a little free time) instead of finishing
    # early. A day that already fills its window is returned unchanged.
    return _spread_to_window(stops, start_lat, start_lng, start_min, end_min)


def retime(stops: list[dict], start_lat: float, start_lng: float,
           start_time: str, end_time: str, *,
           dwell_overrides: Optional[dict[str, int]] = None) -> dict:
    """Recompute walk legs + arrival times for an arbitrary ORDERED stop list after
    a client edit (remove / reorder / dwell change, idea 1). Delegates to the shared
    ``_clock_stops`` authority, so an edited day obeys the SAME walk/dwell/window/
    explore-gap rules as a freshly built one: a spread day fed straight back in
    re-clocks byte-identically, and removing a stop simply pulls the tail earlier
    (it does NOT re-stretch — the user's edit is respected). Flags ``over_window``
    when the day no longer fits (we warn, never block)."""
    try:
        start = dt.time.fromisoformat(start_time)
    except ValueError:
        start = dt.time(10, 0)
    try:
        parsed_end = dt.time.fromisoformat(end_time)
        end_min = parsed_end.hour * 60 + parsed_end.minute
    except ValueError:
        end_min = 16 * 60
    return _clock_stops(stops, start_lat, start_lng,
                        start.hour * 60 + start.minute, end_min,
                        dwell_overrides=dwell_overrides)


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


async def plan(*, lat: Optional[float], lng: Optional[float],
               interests: list[str], start_time: str, end_time: str,
               num_stops: int, goals: Optional[str] = None,
               audience: Optional[str] = None, occasion: Optional[str] = None,
               pace: Optional[str] = None, budget: Optional[int] = None,
               weekday: Optional[int] = None, accessible_only: bool = False,
               locked_refs: Optional[list[str]] = None,
               user_id: Optional[int] = None) -> dict:
    """Build SEVERAL itineraries (the user picks). Returns ``options`` — each a
    distinct day with its own stops, totals, narrative and mode — plus the shared
    window/stop-count/interests the day was planned for.

    If ``goals`` (a free-text "describe your day") is given, ONE Gemini call
    interprets it into the planning inputs — which kinds of stops to include,
    whether to keep everything close, and a one-line framing — so the options
    fit what the user actually described. The deterministic core still builds
    the route, so a quota/LLM failure simply falls back to the chip selection."""
    start_lat = lat if lat is not None else settings.demo_lat
    start_lng = lng if lng is not None else settings.demo_lng
    # The router validates the window, but parse defensively so a direct caller
    # (e.g. the cache warmer) can't crash the planner with a bad time.
    try:
        parsed_start = dt.time.fromisoformat(start_time)
    except ValueError:
        parsed_start = dt.time(10, 0)
    try:
        parsed_end = dt.time.fromisoformat(end_time)
    except ValueError:
        parsed_end = dt.time(16, 0)

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
                "sequence": [i for i in interpretation.get("sequence", []) if i != "Restaurant"],
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

    # Audience/occasion reshape the default day + pacing/scoring; pace scales
    # dwell; budget caps the candidate price level. All optional → with none set,
    # `profile` is neutral and the plan is byte-identical to before (anonymous-safe).
    profile = _resolve_profile(audience, occasion)
    dwell_mult = _clamp(PACE_DWELL_MULT.get(pace or "normal", 1.0) * profile["dwell_mult"], 0.6, 1.6)
    price_levels = _BUDGET_PRICE_LEVELS.get(budget) if budget else None

    # The chronological order the user described (idea 2); leads the chip order.
    preferred_sequence = (interpretation or {}).get("sequence") or None
    chips = _plan_chips(num_stops, effective_interests,
                        default_chips=profile["default_chips"],
                        preferred_sequence=preferred_sequence)
    pools = await _fetch_pools(chips, start_lat, start_lng, radius_m, price_levels,
                               accessible_only=accessible_only)  # fetched once

    # Opening-hours data (idea 3): only when the user picked a day, and only for
    # LOCAL candidates (which carry structured hours). Guarded so an offline/no-DB
    # demo just treats everything as hours-unknown instead of crashing.
    hours_by_ref: dict[str, list[dict]] = {}
    if weekday is not None:
        local_ids = {int(c["ref"]) for pool in pools.values()
                     for c in pool if str(c["ref"]).isdigit()}
        try:
            hours_by_ref = {str(bid): hrs for bid, hrs
                            in businesses_repo.hours_for_ids(list(local_ids)).items()}
        except Exception:
            hours_by_ref = {}

    # Personalisation (idea 10b): a signed-in user's favourites get a gentle
    # scoring bonus. Anonymous (user_id None) → empty set → zero effect.
    favorite_refs: set[str] = set()
    if user_id is not None:
        try:
            favorite_refs = {f["business_ref"] for f in favorites_repo.list_for_user(user_id)}
        except Exception:
            favorite_refs = set()

    # Build one day per strategy. Each avoids the businesses chosen by accepted
    # earlier options, so the options visit different places; any option whose
    # stop-set duplicates an earlier one (sparse area) is collapsed away.
    options: list[dict[str, Any]] = []
    used: set[str] = set()
    signatures: set[frozenset[str]] = set()
    spread_any = False  # did any option drop a stop because it was too far to walk?
    for strat in STRATEGIES:
        # Apply the occasion/audience nudge to this day-shape's scoring.
        tuned = {
            **strat,
            "sigma": _clamp(strat["sigma"] * profile["sigma_mult"], 0.4, 3.0),
            "prox_w": _clamp(strat["prox_w"] + profile["prox_w_add"], 0.0, 1.0),
        }
        diag: dict[str, Any] = {}
        stops = _build_stops(chips, pools, start_lat, start_lng, parsed_start,
                             end_time=parsed_end, strategy=tuned, avoid=set(used),
                             dwell_mult=dwell_mult, weekday=weekday, hours_by_ref=hours_by_ref,
                             locked_refs=set(locked_refs or []), favorite_refs=favorite_refs,
                             diag=diag)
        spread_any = spread_any or diag.get("spread_out", False)
        if not stops:
            continue
        if weekday is not None:
            _annotate_open(stops, weekday, hours_by_ref)
        _attach_deals(stops)
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
            "estimated_spend": _estimate_spend(stops),
            "sequence_note": _sequence_note(stops, preferred_sequence),
            "spread_note": (
                "Some spots near here were too far to walk to — this area is "
                "spread out, so the day is shorter than asked."
                if diag.get("spread_out") else None
            ),
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
        empty_msg = (
            "Nothing independent was within walking distance — this area is "
            "spread out, so a walkable day isn't really possible here."
            if spread_any else _templated_narrative([])
        )
        options = [{
            "key": "best", "label": "Your day", "stops": [], "total_walk_km": 0.0,
            "estimated_spend": _estimate_spend([]), "sequence_note": None,
            "spread_note": None,
            "narrative": empty_msg, "mode": "deterministic",
        }]

    return {
        "options": options,
        "interests": effective_interests,
        "num_stops": num_stops,
        "end_time": end_time,
        "start": {"lat": start_lat, "lng": start_lng, "time": start_time},
        # The personalisation knobs in effect, echoed back for the UI + saved-trip params.
        "knobs": {"audience": audience, "occasion": occasion, "pace": pace,
                  "budget": budget, "accessible_only": accessible_only},
        # What Gemini understood from the free-text goals (null when none/failed),
        # so the UI can show the user their day was read correctly.
        "interpretation": interpretation,
    }
