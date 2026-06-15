"""Trip planner — the multi-option behaviour (§plan D).

These tests pin the contract the UI relies on: ``plan()`` returns several
DISTINCT itineraries, collapses identical ones in sparse areas, and narrates
only the top option (one LLM call — the 20/day Gemini quota guard). The pools
are faked, so no network/DB is touched.
"""

from __future__ import annotations

import asyncio

from app.services import trip_planner


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


def _plan(interests, duration="quick"):
    return asyncio.run(trip_planner.plan(
        lat=40.0, lng=-74.0, duration=duration,
        interests=interests, start_time="10:00",
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
        lat=40.0, lng=-74.0, duration="quick", interests=[],  # NO chips picked
        start_time="10:00", goals="cozy coffee then a bite, nothing far",
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
        lat=40.0, lng=-74.0, duration="quick", interests=["Dessert"],
        start_time="10:00", goals="anything fun",
    ))

    assert out["interpretation"] is None
    # Fell back to the chip ("Dessert").
    roles = {s["slot"] for opt in out["options"] for s in opt["stops"]}
    assert "dessert" in roles


# ── _plan_chips: emphasis + no unrequested kinds (pure-function unit tests) ──


def test_plan_chips_emphasises_first_kind_and_adds_no_meal():
    """"long shopping, quick coffee" → Retail first (emphasised) becomes 2 of a
    3-stop day, coffee 1, and NO restaurant is injected."""
    chips = trip_planner._plan_chips("quick", ["Retail", "Coffee"])
    assert chips.count("Retail") == 2
    assert chips.count("Coffee") == 1
    assert "Restaurant" not in chips


def test_plan_chips_never_injects_unrequested_meal():
    chips = trip_planner._plan_chips("half", ["Coffee", "Bookstore"])
    assert "Restaurant" not in chips  # user asked for neither food


def test_plan_chips_leading_kind_fills_a_longer_day():
    # A half day "mostly shopping" → shopping dominates the padding.
    chips = trip_planner._plan_chips("half", ["Retail", "Coffee"])
    assert chips.count("Retail") == 3 and chips.count("Coffee") == 1


def test_plan_chips_default_day_stays_balanced_with_a_meal():
    # No interests at all → the balanced default day, which DOES include a meal.
    chips = trip_planner._plan_chips("half", [])
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
        lat=40.0, lng=-74.0, duration="quick", interests=[],
        start_time="10:00", goals="quick coffee long shopping",
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
        lat=40.0, lng=-74.0, duration="quick", interests=[],
        start_time="10:00", goals="quick coffee long shopping",
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
