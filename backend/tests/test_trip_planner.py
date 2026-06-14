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
