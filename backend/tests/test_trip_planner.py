"""Trip planner — the multi-option behaviour (§plan D).

These tests pin the contract the UI relies on: ``plan()`` returns several
DISTINCT itineraries, collapses identical ones in sparse areas, and narrates
only the top option (one LLM call — the 20/day Gemini quota guard). The pools
are faked, so no network/DB is touched.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import trip_planner


@pytest.fixture(autouse=True)
def _offline_repos(monkeypatch):
    """Keep every planner test offline: stub the DB-touching repos to empty so
    deal/hours/favorite enrichment never reaches the network. Individual tests
    override these as needed."""
    monkeypatch.setattr(trip_planner.deals_repo, "list_active_for_businesses", lambda ids: {})
    monkeypatch.setattr(trip_planner.businesses_repo, "place_ids_to_local_ids", lambda pids: {})
    monkeypatch.setattr(trip_planner.businesses_repo, "hours_for_ids", lambda ids: {})
    monkeypatch.setattr(trip_planner.favorites_repo, "list_for_user", lambda uid: [])


class _FakeBiz:
    """Stands in for a BusinessOut — the planner only needs ``model_dump()``."""

    def __init__(self, data: dict):
        self._data = data

    def model_dump(self) -> dict:
        return dict(self._data)


class _FakeResult:
    def __init__(self, results: list[_FakeBiz]):
        self.results = results


def _biz(ref: str, name: str, lat: float, lng: float, rating: float = 4.5,
         reviews: int = 200) -> _FakeBiz:
    return _FakeBiz({
        "ref": ref, "name": name, "lat": lat, "lng": lng,
        "average_rating": rating, "review_count": reviews,
        "photo_url": None, "photo_focus_x": 50, "photo_focus_y": 50,
        "local_badge": "verified_local",
    })


# Three candidates per kind, spread out and varied in rating, so the strategies
# (balanced / rating-weighted / proximity-weighted) genuinely diverge.
_RICH_POOLS = {
    "Coffee": [
        _biz("c1", "Near Roasters", 40.000, -74.000, rating=4.3),
        _biz("c2", "Top Beans", 40.010, -74.010, rating=4.9),
        _biz("c3", "Far Drip", 40.030, -74.030, rating=4.6),
    ],
    "Restaurant": [
        _biz("r1", "Corner Bistro", 40.001, -74.001, rating=4.2),
        _biz("r2", "Acclaimed Table", 40.012, -74.012, rating=4.9),
        _biz("r3", "Distant Grill", 40.032, -74.032, rating=4.5),
    ],
    "Dessert": [
        _biz("d1", "Close Scoops", 40.002, -74.002, rating=4.1),
        _biz("d2", "Best Cakes", 40.013, -74.013, rating=5.0),
        _biz("d3", "Outer Sweets", 40.033, -74.033, rating=4.4),
    ],
}


def _wire(monkeypatch, pools: dict, narrative=None):
    """Point the planner at canned pools and a canned narrator; count LLM calls."""
    calls = {"narrate": 0}

    async def fake_search(params):
        # CHIP_SLOTS[chip]["cats"][0] is the chip's primary category name.
        return _FakeResult(pools.get(params.categories[0], []))

    async def fake_narrate(stops):
        calls["narrate"] += 1
        return narrative

    monkeypatch.setattr(trip_planner.search_service, "search", fake_search)
    monkeypatch.setattr(trip_planner.llm, "generate_trip_narrative", fake_narrate)
    return calls


def _plan(interests, *, start="10:00", end="22:00", stops=3):
    # A generous window so the requested number of stops always fits — these
    # tests pin option/stop behaviour, not the time cap (that has its own tests).
    return asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=interests,
        start_time=start, end_time=end, num_stops=stops,
    ))


def test_plan_returns_multiple_distinct_options(monkeypatch):
    _wire(monkeypatch, _RICH_POOLS)
    out = _plan(["Coffee", "Restaurant", "Dessert"])

    assert len(out["options"]) >= 2, "a rich area should offer several days"
    # Every option is a full 3-stop day...
    for opt in out["options"]:
        assert len(opt["stops"]) == 3
        assert "label" in opt and "total_walk_km" in opt
    # ...and no two options are the same set of businesses.
    sigs = [frozenset(s["ref"] for s in o["stops"]) for o in out["options"]]
    assert len(sigs) == len(set(sigs)), "options must visit different places"


def test_sparse_area_collapses_to_one_option(monkeypatch):
    # Exactly one candidate per kind → every strategy yields the same day.
    sparse = {k: v[:1] for k, v in _RICH_POOLS.items()}
    _wire(monkeypatch, sparse)
    out = _plan(["Coffee", "Restaurant", "Dessert"])

    assert len(out["options"]) == 1
    assert len(out["options"][0]["stops"]) == 3


def test_only_top_option_is_llm_narrated(monkeypatch):
    calls = _wire(monkeypatch, _RICH_POOLS, narrative="A lovely independent day.")
    out = _plan(["Coffee", "Restaurant", "Dessert"])

    assert calls["narrate"] == 1, "exactly one LLM call protects the daily quota"
    assert out["options"][0]["mode"] == "llm"
    for opt in out["options"][1:]:
        assert opt["mode"] == "deterministic"
        assert opt["narrative"]  # templated, never empty


def test_offline_narration_falls_back_to_template(monkeypatch):
    _wire(monkeypatch, _RICH_POOLS, narrative=None)  # LLM unavailable
    out = _plan(["Coffee", "Restaurant", "Dessert"])

    for opt in out["options"]:
        assert opt["mode"] == "deterministic"
        assert opt["narrative"].startswith("Your all-independent day:")


def test_empty_pools_yield_one_empty_option(monkeypatch):
    _wire(monkeypatch, {})  # nothing anywhere
    out = _plan(["Coffee", "Restaurant"])

    assert len(out["options"]) == 1
    assert out["options"][0]["stops"] == []
    assert "No independent spots" in out["options"][0]["narrative"]


# ── Natural-language goals ──────────────────────────────────────────────────


def test_goals_drive_interests_and_frame_narration(monkeypatch):
    """A free-text description (interpreted by Gemini) overrides the chips: the
    plan visits the kinds Gemini extracted, the top option is framed with the
    LLM summary, and the interpretation is returned for the UI to show."""
    _wire(monkeypatch, _RICH_POOLS, narrative="SHOULD-NOT-BE-USED")

    async def fake_interpret(goals, allowed):
        # The user typed about coffee + books; Gemini returns those kinds.
        assert "Coffee" in allowed and "Bookstore" in allowed  # chip vocab passed
        return {
            "interests": ["Coffee", "Restaurant"],
            "keep_close": True,
            "summary": "A cozy coffee-and-a-bite afternoon, all within an easy walk.",
        }

    monkeypatch.setattr(trip_planner.llm, "interpret_trip_goals", fake_interpret)

    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=[],  # NO chips picked
        start_time="10:00", end_time="22:00", num_stops=3,
        goals="cozy coffee then a bite, nothing far",
    ))

    # The interpreted interests drove the plan (coffee + a meal are present)...
    roles = {s["slot"] for opt in out["options"] for s in opt["stops"]}
    assert "coffee" in roles and "eat" in roles
    # ...the top option is framed by the Gemini summary (not the stop-narrator)...
    assert out["options"][0]["mode"] == "llm"
    assert out["options"][0]["narrative"].startswith("A cozy coffee-and-a-bite")
    assert "SHOULD-NOT-BE-USED" not in out["options"][0]["narrative"]
    # ...and the interpretation is surfaced for the UI.
    assert out["interpretation"]["keep_close"] is True
    assert out["interpretation"]["interests"] == ["Coffee", "Restaurant"]


def test_goals_failure_falls_back_to_chips(monkeypatch):
    """If Gemini can't interpret the goals (quota/offline), the planner uses the
    chip selection unchanged and returns interpretation=None — never an error."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)

    async def fake_interpret(goals, allowed):
        return None  # LLM unavailable

    monkeypatch.setattr(trip_planner.llm, "interpret_trip_goals", fake_interpret)

    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Dessert"],
        start_time="10:00", end_time="22:00", num_stops=3,
        goals="anything fun",
    ))

    assert out["interpretation"] is None
    # Fell back to the chip ("Dessert").
    roles = {s["slot"] for opt in out["options"] for s in opt["stops"]}
    assert "dessert" in roles


# ── _plan_chips: emphasis + no unrequested kinds (pure-function unit tests) ──


def test_plan_chips_emphasises_first_kind_and_adds_no_meal():
    """"long shopping, quick coffee" → Retail first (emphasised) becomes 2 of a
    3-stop day, coffee 1, and NO restaurant is injected."""
    chips = trip_planner._plan_chips(3, ["Retail", "Coffee"])
    assert chips.count("Retail") == 2
    assert chips.count("Coffee") == 1
    assert "Restaurant" not in chips


def test_plan_chips_never_injects_unrequested_meal():
    chips = trip_planner._plan_chips(4, ["Coffee", "Bookstore"])
    assert "Restaurant" not in chips  # user asked for neither food


def test_plan_chips_leading_kind_fills_a_longer_day():
    # A half day "mostly shopping" → shopping dominates the padding.
    chips = trip_planner._plan_chips(4, ["Retail", "Coffee"])
    assert chips.count("Retail") == 3 and chips.count("Coffee") == 1


def test_plan_chips_default_day_stays_balanced_with_a_meal():
    # No interests at all → the balanced default day, which DOES include a meal.
    chips = trip_planner._plan_chips(4, [])
    assert "Restaurant" in chips
    assert len(set(chips)) >= 3  # varied, not all one kind


# ── Goal parsing: no phantom meal + deterministic fallback ──────────────────

_SHOP_POOLS = {
    "Coffee": [
        _biz("c1", "Bean", 40.0, -74.0, 4.6),
        _biz("c2", "Brew", 40.01, -74.01, 4.5),
    ],
    "Retail": [
        _biz("s1", "Shop A", 40.001, -74.001, 4.4),
        _biz("s2", "Shop B", 40.011, -74.011, 4.6),
        _biz("s3", "Shop C", 40.02, -74.02, 4.3),
    ],
    "Restaurant": [_biz("r1", "Diner", 40.002, -74.002, 4.2)],
}


def test_meal_guard_drops_phantom_restaurant(monkeypatch):
    """The reported bug: "quick coffee, long shopping" must NOT produce a meal,
    even if the interpreter (here the LLM) tries to anchor one."""
    _wire(monkeypatch, _SHOP_POOLS, narrative="x")

    async def over_adds_a_meal(goals, allowed):
        return {
            "interests": ["Coffee", "Retail", "Restaurant"],  # LLM invents a meal
            "keep_close": False,
            "summary": "Coffee and shopping.",
        }

    monkeypatch.setattr(trip_planner.llm, "interpret_trip_goals", over_adds_a_meal)

    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=[],
        start_time="10:00", end_time="22:00", num_stops=3,
        goals="quick coffee long shopping",
    ))

    roles = {s["slot"] for opt in out["options"] for s in opt["stops"]}
    assert "eat" not in roles, "no restaurant without a food cue"
    assert "coffee" in roles and "shop" in roles
    assert "Restaurant" not in out["interpretation"]["interests"]


def test_keyword_fallback_when_llm_unavailable(monkeypatch):
    """When Gemini can't interpret (offline/quota), the deterministic keyword
    reader still shapes the day from the text — emphasis (long shopping → more
    shopping) and no phantom meal — instead of dropping to the generic default."""
    _wire(monkeypatch, _SHOP_POOLS, narrative=None)

    async def no_llm(goals, allowed):
        return None

    monkeypatch.setattr(trip_planner.llm, "interpret_trip_goals", no_llm)

    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=[],
        start_time="10:00", end_time="22:00", num_stops=3,
        goals="quick coffee long shopping",
    ))

    assert out["interpretation"] is not None  # the typed day still shaped the plan
    assert out["interpretation"]["interests"] == ["Retail", "Coffee"]  # shopping first
    roles = [s["slot"] for s in out["options"][0]["stops"]]
    assert "eat" not in roles
    assert roles.count("shop") >= 2 and "coffee" in roles  # emphasis honoured


def test_keyword_interpret_unit():
    """Direct check of the deterministic reader: emphasis order, no phantom meal,
    and that a real food word DOES pull in a Restaurant."""
    allowed = list(trip_planner.CHIP_SLOTS.keys())
    assert trip_planner._keyword_interpret("quick coffee long shopping", allowed)[
        "interests"
    ] == ["Retail", "Coffee"]
    assert "Restaurant" not in trip_planner._keyword_interpret(
        "coffee and a bookstore", allowed
    )["interests"]
    lunch = trip_planner._keyword_interpret("lunch then dessert", allowed)["interests"]
    assert "Restaurant" in lunch and "Dessert" in lunch
    assert trip_planner._keyword_interpret("just vibes", allowed) is None


# ── Realism guards (the 100-scenario audit fixes) ───────────────────────────

import datetime as _dt


def _arrmin(label: str) -> int:
    """The planner's "%-I:%M %p" arrival label → minutes-from-midnight."""
    t = _dt.datetime.strptime(label.strip(), "%I:%M %p")
    return t.hour * 60 + t.minute


# A dense, tightly-clustered area (every candidate within ~0.6 km) so a walk leg
# is never the limiting factor in these timing/emphasis tests.
_DENSE = {
    cat: [_biz(f"{cat[:2]}{i}", f"{cat} {i}", 40.0 + 0.0008 * i, -74.0 + 0.0008 * i, 4.5)
          for i in range(6)]
    for cat in ["Coffee", "Retail", "Restaurant", "Dessert", "Bar", "Bookstore"]
}


def test_meal_and_bar_never_scheduled_before_their_window(monkeypatch):
    """An 8 AM start must not produce a 9 AM lunch or a 10 AM bar — meals wait for
    11:00, bars for 16:00 (the reported "unrealistic stuff")."""
    _wire(monkeypatch, _DENSE, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0,
        interests=["Coffee", "Restaurant", "Dessert", "Bar"],
        start_time="08:00", end_time="21:00", num_stops=6))
    for opt in out["options"]:
        for s in opt["stops"]:
            if s["slot"] == "eat":
                assert _arrmin(s["arrive"]) >= 11 * 60
            if s["slot"] == "drinks":
                assert _arrmin(s["arrive"]) >= 16 * 60


def test_day_stays_within_the_chosen_window(monkeypatch):
    """A day is capped by the user's end_time — with a 21:00 end, no stop arrives
    after 21:00, so the itinerary never overruns the window the user gave it."""
    _wire(monkeypatch, _DENSE, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0,
        interests=["Coffee", "Restaurant", "Dessert", "Bar"],
        start_time="18:00", end_time="21:00", num_stops=6))
    for opt in out["options"]:
        for s in opt["stops"]:
            assert _arrmin(s["arrive"]) <= 21 * 60


def test_walk_legs_stay_walkable_in_a_dense_area(monkeypatch):
    """No single leg exceeds the walkable cap when close candidates exist."""
    _wire(monkeypatch, _DENSE, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0,
        interests=["Coffee", "Retail", "Bookstore"],
        start_time="10:00", end_time="21:00", num_stops=6))
    for opt in out["options"]:
        for s in opt["stops"]:
            assert s["walk_from_prev_km"] <= trip_planner.MAX_LEG_KM + 0.01


def test_single_repeatable_interest_fills_the_day(monkeypatch):
    """The old flat per-role cap truncated a "shopping day" to 2 stops; a
    repeatable kind now fills toward the duration target."""
    _wire(monkeypatch, _DENSE, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Retail"],
        start_time="10:00", end_time="21:00", num_stops=6))
    assert max(len(o["stops"]) for o in out["options"]) >= 4


def test_meals_are_capped_low(monkeypatch):
    """Meals don't repeat into an unrealistic three-restaurant day."""
    _wire(monkeypatch, _DENSE, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Restaurant"],
        start_time="11:00", end_time="21:00", num_stops=6))
    for opt in out["options"]:
        assert sum(1 for s in opt["stops"] if s["slot"] == "eat") <= 2


# ── Phase 1 knobs: pace, budget, kept-local estimate, audience (ideas 4/6/8) ──


def test_pace_packed_fits_more_stops_than_relaxed(monkeypatch):
    """Pace scales dwell, so in a tight window 'packed' (shorter stays) fits more
    stops than 'relaxed' — the whole point of the pace control."""
    _wire(monkeypatch, _DENSE, narrative=None)

    def most_stops(pace):
        out = asyncio.run(trip_planner.plan(
            lat=40.0, lng=-74.0, interests=["Coffee", "Retail", "Bookstore"],
            start_time="10:00", end_time="13:00", num_stops=6, pace=pace))
        return max(len(o["stops"]) for o in out["options"])

    assert most_stops("packed") > most_stops("relaxed")


def test_budget_passes_price_levels_to_search(monkeypatch):
    """Budget caps the candidate pool at the source: $ ( budget=1 ) → price_levels
    [1,2] reach the search params."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)
    seen: dict = {}

    async def capture(params):
        seen.setdefault("levels", list(params.price_levels))
        return _FakeResult(_RICH_POOLS.get(params.categories[0], []))

    monkeypatch.setattr(trip_planner.search_service, "search", capture)
    asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"],
        start_time="10:00", end_time="16:00", num_stops=2, budget=1))
    assert seen["levels"] == [1, 2]


def test_estimate_spend_sums_role_base():
    """The kept-local estimate sums per-role price floors and counts price-unknowns."""
    stops = [
        {"slot": "coffee", "price_level": 1},    # ROLE_SPEND_BASE["coffee"][0] = 6
        {"slot": "eat", "price_level": 2},       # ROLE_SPEND_BASE["eat"][1]    = 28
        {"slot": "shop", "price_level": None},   # no price → counted as unknown
    ]
    est = trip_planner._estimate_spend(stops)
    assert est["low"] == 6 + 28
    assert est["high"] == round((6 + 28) * 1.6)
    assert est["unknown_count"] == 1


def test_audience_family_default_day_has_no_bar(monkeypatch):
    """Audience reshapes the no-interest DEFAULT day: a family day's default kinds
    exclude the bar, so no 'drinks' stop appears (even though bars exist nearby)."""
    _wire(monkeypatch, _DENSE, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=[],  # no chips → the family default day
        start_time="10:00", end_time="20:00", num_stops=4, audience="family"))
    slots = {s["slot"] for o in out["options"] for s in o["stops"]}
    assert "drinks" not in slots


def test_knobs_none_is_backward_compatible(monkeypatch):
    """With no knobs set, the plan still carries the new additive fields but the
    options/stops match a plain call — anonymous + cache-warmer safe."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee", "Restaurant", "Dessert"],
        start_time="10:00", end_time="22:00", num_stops=3))
    assert out["knobs"] == {"audience": None, "occasion": None, "pace": None, "budget": None}
    assert all("estimated_spend" in o for o in out["options"])


# ── Phase 2: follow the described order (idea 2) ─────────────────────────────


def test_sequence_orders_chips_before_rank():
    """A described sequence leads the chip order; time-of-day rank only tiebreaks.
    Without it, rank puts Coffee (morning) before Bar (evening)."""
    seq = trip_planner._plan_chips(2, ["Coffee", "Bar"], preferred_sequence=["Bar", "Coffee"])
    assert seq.index("Bar") < seq.index("Coffee")
    plain = trip_planner._plan_chips(2, ["Coffee", "Bar"])
    assert plain.index("Coffee") < plain.index("Bar")  # rank order unchanged when no seq


def test_keyword_interpret_returns_sequence():
    """The deterministic fallback also yields a sequence (order of mention)."""
    out = trip_planner._keyword_interpret(
        "first coffee, then a cocktail", list(trip_planner.CHIP_SLOTS.keys()))
    assert out["sequence"] == ["Coffee", "Bar"]


def test_sequence_lunch_before_shop_is_honored(monkeypatch):
    """The reported case: 'lunch, then a clothing store' must put the meal BEFORE
    the shop (not the old time-of-day reorder)."""
    _wire(monkeypatch, _DENSE, narrative=None)

    async def interp(goals, allowed):
        return {"interests": ["Restaurant", "Retail"], "sequence": ["Restaurant", "Retail"],
                "keep_close": False, "summary": ""}

    monkeypatch.setattr(trip_planner.llm, "interpret_trip_goals", interp)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=[], start_time="11:00", end_time="18:00",
        num_stops=2, goals="lunch then a clothing store"))
    for opt in out["options"]:
        slots = [s["slot"] for s in opt["stops"]]
        if "eat" in slots and "shop" in slots:
            assert slots.index("eat") < slots.index("shop")


def test_sequence_missing_kind_emits_note(monkeypatch):
    """A bar requested at an 8 AM start can't reach its 4 PM window, so it's
    dropped and the note says so honestly (not that we reordered)."""
    _wire(monkeypatch, _DENSE, narrative=None)

    async def interp(goals, allowed):
        return {"interests": ["Bar", "Coffee"], "sequence": ["Bar", "Coffee"],
                "keep_close": False, "summary": ""}

    monkeypatch.setattr(trip_planner.llm, "interpret_trip_goals", interp)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=[], start_time="08:00", end_time="11:00",
        num_stops=2, goals="a cocktail then coffee"))
    notes = [o.get("sequence_note") for o in out["options"]]
    assert any(n and "drinks" in n for n in notes)


# ── Phase 3: open when you arrive (idea 3) ──────────────────────────────────


def test_weekday_annotates_local_stops_open_flag(monkeypatch):
    """A local stop whose seeded hours say CLOSED on the chosen weekday is flagged
    not-open-at-arrival, with hours_known=True."""
    _wire(monkeypatch, {"Coffee": [_biz("5", "Local Cafe", 40.0, -74.0)]}, narrative=None)
    monkeypatch.setattr(
        trip_planner.businesses_repo, "hours_for_ids",
        lambda ids: {5: [{"dow": 2, "open": None, "close": None, "closed": True}]})
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"], start_time="10:00",
        end_time="14:00", num_stops=1, weekday=2))
    s = out["options"][0]["stops"][0]
    assert s["hours_known"] is True and s["open_at_arrival"] is False
    assert "arrive_min" in s


def test_google_stops_marked_hours_unknown(monkeypatch):
    """A Google stop (gp_ ref) has no structured hours → hours_known=False."""
    _wire(monkeypatch, {"Coffee": [_biz("gp_abc", "Google Cafe", 40.0, -74.0)]}, narrative=None)
    monkeypatch.setattr(trip_planner.businesses_repo, "hours_for_ids", lambda ids: {})
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"], start_time="10:00",
        end_time="14:00", num_stops=1, weekday=2))
    s = out["options"][0]["stops"][0]
    assert s["hours_known"] is False


def test_no_weekday_skips_hours_annotation(monkeypatch):
    """Without a weekday, stops carry no open-at fields (and no DB call happens)."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)

    def _boom(ids):
        raise AssertionError("hours_for_ids must not be called when weekday is None")

    monkeypatch.setattr(trip_planner.businesses_repo, "hours_for_ids", _boom)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"], start_time="10:00",
        end_time="16:00", num_stops=2))
    assert "open_at_arrival" not in out["options"][0]["stops"][0]


# ── Phase 4: edit in place — bench, locks, retime (idea 1) ───────────────────


def test_bench_present_and_distinct(monkeypatch):
    """Every stop carries a 'bench' of same-kind alternates (different refs) so the
    UI can swap instantly + offline."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)  # 3 candidates per kind
    out = _plan(["Coffee", "Restaurant", "Dessert"])
    for opt in out["options"]:
        for s in opt["stops"]:
            assert "bench" in s
            assert all(b["ref"] != s["ref"] for b in s["bench"])
    assert len(out["options"][0]["stops"][0]["bench"]) >= 1  # rich area → real alternates


def test_locked_ref_is_force_kept(monkeypatch):
    """A locked ref is kept even when it's the FARTHEST/weakest of its kind (it
    would normally lose to a closer, higher-rated option)."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee", "Restaurant", "Dessert"],
        start_time="10:00", end_time="22:00", num_stops=3, locked_refs=["c3"]))
    refs = {s["ref"] for opt in out["options"] for s in opt["stops"]}
    assert "c3" in refs  # the locked (far) coffee was kept
    for opt in out["options"]:
        for s in opt["stops"]:
            if s["ref"] == "c3":
                assert s["locked"] is True


def test_retime_recomputes_after_remove():
    """Removing a middle stop shifts later arrivals earlier (the clock re-flows)."""
    stops = [
        {"ref": "a", "lat": 40.0, "lng": -74.0, "slot": "coffee", "dwell_min": 30},
        {"ref": "b", "lat": 40.01, "lng": -74.01, "slot": "browse", "dwell_min": 40},
        {"ref": "c", "lat": 40.02, "lng": -74.02, "slot": "shop", "dwell_min": 40},
    ]
    full = trip_planner.retime(stops, 40.0, -74.0, "10:00", "18:00")
    removed = trip_planner.retime([stops[0], stops[2]], 40.0, -74.0, "10:00", "18:00")
    assert removed["stops"][-1]["arrive_min"] < full["stops"][-1]["arrive_min"]


def test_retime_flags_over_window():
    """An itinerary that no longer fits the window is flagged (warn, not block)."""
    stops = [
        {"ref": "a", "lat": 40.0, "lng": -74.0, "slot": "coffee", "dwell_min": 120},
        {"ref": "b", "lat": 40.05, "lng": -74.05, "slot": "eat", "dwell_min": 120},
    ]
    out = trip_planner.retime(stops, 40.0, -74.0, "10:00", "11:00")
    assert out["over_window"] is True


def test_retime_honours_dwell_override():
    """A per-stop dwell override changes that stop's stay + downstream clocks."""
    stops = [{"ref": "a", "lat": 40.0, "lng": -74.0, "slot": "browse", "dwell_min": 40}]
    out = trip_planner.retime(stops, 40.0, -74.0, "10:00", "18:00",
                              dwell_overrides={"a": 90})
    assert out["stops"][0]["dwell_min"] == 90


# ── Phase 5: deals on route + personalize from favorites (idea 10a/b) ────────


def test_favorite_ref_boosts_score():
    """A favourited business scores higher than the same business un-favourited."""
    cand = {"ref": "f1", "lat": 40.0, "lng": -74.0, "average_rating": 4.0, "review_count": 50}
    base = trip_planner._slot_score(cand, 40.0, -74.0, prox_w=0.6, sigma=1.2, avoid=set())
    boosted = trip_planner._slot_score(cand, 40.0, -74.0, prox_w=0.6, sigma=1.2,
                                       avoid=set(), favorite_refs={"f1"})
    assert boosted == base * trip_planner.FAVORITE_BONUS


def test_deals_attached_to_local_stops(monkeypatch):
    """An active deal on a LOCAL stop is surfaced on the stop."""
    _wire(monkeypatch, {"Coffee": [_biz("7", "Local Cafe", 40.0, -74.0)]}, narrative=None)
    monkeypatch.setattr(trip_planner.deals_repo, "list_active_for_businesses",
                        lambda ids: {7: [{"id": 99, "title": "10% off", "discount_pct": 10}]})
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"], start_time="10:00",
        end_time="14:00", num_stops=1))
    s = out["options"][0]["stops"][0]
    assert s.get("deals") == [{"id": 99, "title": "10% off", "discount_pct": 10}]


def test_google_only_stop_has_no_deals(monkeypatch):
    """A Google stop with no materialized local row carries no deals."""
    _wire(monkeypatch, {"Coffee": [_biz("gp_zzz", "Google Cafe", 40.0, -74.0)]}, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"], start_time="10:00",
        end_time="14:00", num_stops=1))
    assert "deals" not in out["options"][0]["stops"][0]


def test_anonymous_plan_has_no_favorite_marks(monkeypatch):
    """An anonymous plan (user_id None) never loads favourites and marks no stop —
    the backward-compat guard for the optional_user switch."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)

    def _boom(uid):
        raise AssertionError("favourites must not load for an anonymous plan")

    monkeypatch.setattr(trip_planner.favorites_repo, "list_for_user", _boom)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee", "Restaurant", "Dessert"],
        start_time="10:00", end_time="22:00", num_stops=3))
    assert all("is_favorite" not in s for opt in out["options"] for s in opt["stops"])


def test_favorite_personalization_marks_stop(monkeypatch):
    """A signed-in user's favourite is boosted into the day and marked is_favorite."""
    _wire(monkeypatch, _RICH_POOLS, narrative=None)
    monkeypatch.setattr(trip_planner.favorites_repo, "list_for_user",
                        lambda uid: [{"business_ref": "c1"}])  # favourite a coffee
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee", "Restaurant", "Dessert"],
        start_time="10:00", end_time="22:00", num_stops=3, user_id=42))
    favs = [s for opt in out["options"] for s in opt["stops"] if s.get("is_favorite")]
    assert any(s["ref"] == "c1" for s in favs)


# ── Bug fixes (reported from real use) ───────────────────────────────────────


def test_far_only_pool_is_dropped_not_a_5km_hike(monkeypatch):
    """A candidate beyond the fallback walk distance (a spread-out suburb) is
    DROPPED rather than routed as an unwalkable leg — fixes the 9.7 km day."""
    far = {"Coffee": [_biz("c1", "Far Cafe", 40.06, -74.06)]}  # ~8 km from (40,-74)
    _wire(monkeypatch, far, narrative=None)
    out = asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, interests=["Coffee"], start_time="10:00",
        end_time="16:00", num_stops=2))
    for opt in out["options"]:
        for s in opt["stops"]:
            assert s["walk_from_prev_km"] <= trip_planner.MAX_FALLBACK_LEG_KM + 0.01
    assert all(len(o["stops"]) == 0 for o in out["options"])  # nothing walkable here
    assert "spread out" in out["options"][0]["narrative"]


def test_padding_does_not_add_a_second_meal():
    """The extra stop when padding a day is a repeatable kind (shop/coffee), never
    a 2nd restaurant — so a requested shop isn't crowded out by a phantom lunch."""
    chips = trip_planner._plan_chips(4, ["Restaurant", "Retail", "Coffee"])
    assert chips.count("Restaurant") == 1
    assert "Retail" in chips and "Coffee" in chips and len(chips) == 4


def test_keyword_interpret_maps_read_to_bookstore():
    """'a 2 hour read' is understood as a bookstore (the offline reader)."""
    out = trip_planner._keyword_interpret(
        "coffee then a 2 hour read", list(trip_planner.CHIP_SLOTS.keys()))
    assert "Bookstore" in out["interests"]
