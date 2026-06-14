"""Search-breadth + category-matching tests (the San Antonio fix).

Two regressions are pinned here:
  A. The category filter must do TOKEN-SUBSET matching, so the "Restaurant"
     chip keeps a Google "Mexican Restaurant" — but "Bar" never matches
     "Barber" (both are real chips).
  B. Google text search must DEEPEN through pages (20→40→60) before widening
     the radius, so a chain-dense big city surfaces more independents.

No live API, no DB — Places and the classifier are monkeypatched.
"""

from __future__ import annotations

import asyncio

from app.models.business import SearchParams
from app.services import classifier, places, search_service
from app.services.places import _chip_categories, format_place
from app.services.search_service import _passes_filters

_LAT, _LNG = 29.4252, -98.4946  # San Antonio downtown


# ── A. format_place maps Google machine types → chip vocabulary ──────────────

def test_chip_categories_maps_cuisine_to_restaurant():
    assert "Restaurant" in _chip_categories("mexican_restaurant", [])
    assert "Food" in _chip_categories("mexican_restaurant", [])
    assert "Restaurant" in _chip_categories("hamburger_restaurant", [])


def test_chip_categories_maps_common_types():
    assert "Coffee" in _chip_categories("coffee_shop", [])
    assert "Bookstore" in _chip_categories("book_store", [])
    assert "Bar" in _chip_categories("wine_bar", [])
    assert "Bakery" in _chip_categories("bakery", [])


def test_format_place_emits_chip_then_specific():
    out = format_place({
        "id": "x", "displayName": {"text": "Taco Place"},
        "primaryType": "mexican_restaurant",
        "location": {"latitude": _LAT, "longitude": _LNG},
    })
    # Chip-aligned category present (so filters match) AND the specific cuisine
    # kept (so the card still reads "Mexican Restaurant").
    assert "Restaurant" in out["categories"]
    assert "Mexican Restaurant" in out["categories"]
    # The raw machine type is preserved for the classifier / vibe exclusions.
    assert out["primary_type"] == "mexican_restaurant"


# ── A. _passes_filters token-subset containment ──────────────────────────────

def _params(**kw) -> SearchParams:
    return SearchParams(lat=_LAT, lng=_LNG, **kw)


def _biz(categories, *, independent=True, distance=0.5):
    return {"categories": categories, "is_independent": independent,
            "distance_km": distance, "average_rating": 4.5, "price_level": 2,
            "is_open_now": True}


def test_restaurant_chip_keeps_cuisine_specific_google_result():
    b = _biz(["Restaurant", "Food", "Mexican Restaurant"])
    assert _passes_filters(b, _params(categories=["Restaurant"]), 5000) is True


def test_bar_chip_does_not_match_barber():
    b = _biz(["Barber"])
    assert _passes_filters(b, _params(categories=["Bar"]), 5000) is False


def test_coffee_chip_matches_coffee_shop():
    b = _biz(["Coffee", "Cafe", "Coffee Shop"])
    assert _passes_filters(b, _params(categories=["Coffee"]), 5000) is True


def test_local_row_with_exact_category_still_passes():
    b = _biz(["Restaurant"])  # a local DB row carries the canonical chip name
    assert _passes_filters(b, _params(categories=["Restaurant"]), 5000) is True


def test_unrelated_category_still_filtered_out():
    b = _biz(["Pharmacy"])
    assert _passes_filters(b, _params(categories=["Restaurant"]), 5000) is False


# ── B. search() deepens through pages before widening the radius ─────────────

def _gp(name, pid, lat=_LAT, lng=_LNG):
    return {"ref": f"gp_{pid}", "source": "google", "place_id": pid, "name": name,
            "lat": lat, "lng": lng, "address": None, "phone": None, "website": None,
            "price_level": 2, "categories": ["Restaurant"], "average_rating": 4.2,
            "review_count": 20, "is_independent": None, "local_confidence": None,
            "local_badge": None, "is_open_now": True, "photo_url": None,
            "editorial_summary": None, "primary_type": "restaurant"}


def _wire(monkeypatch, pages_by_radius, *, sleep_spy=None):
    """pages_by_radius: {radius_m: [page0_list, page1_list, ...]}. Each page
    yields a (results, next_token) pair; a token exists while more pages do."""
    monkeypatch.setattr(search_service.biz_repo, "fetch_active", lambda: [])
    monkeypatch.setattr(classifier.places_cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(classifier.places_cache, "set", lambda *a, **k: None)

    async def all_small(rows):
        return {r["id"]: {"verdict": "small", "confidence": "high", "reason": "ok"}
                for r in rows}
    monkeypatch.setattr(classifier.llm, "classify_chains", all_small)

    async def fake_text(q, lat, lng, radius_m, *, page=0, page_token=None):
        pages = pages_by_radius.get(radius_m, [])
        if page >= len(pages):
            return [], None
        token = "more" if page + 1 < len(pages) else None
        return [dict(p) for p in pages[page]], token
    monkeypatch.setattr(search_service.places, "search_text", fake_text)

    async def fake_sleep(_s):
        if sleep_spy is not None:
            sleep_spy.append(_s)
    monkeypatch.setattr(search_service.asyncio, "sleep", fake_sleep)


def test_single_page_satisfies_no_deepen_no_widen(monkeypatch):
    page0 = [_gp(f"Spot {i}", f"p{i}", _LAT + 0.001 * i) for i in range(12)]
    sleeps: list[float] = []
    _wire(monkeypatch, {5000: [page0]}, sleep_spy=sleeps)

    res = asyncio.run(search_service.search(SearchParams(q="restaurant", lat=_LAT, lng=_LNG)))
    assert res.total == 12
    assert res.radius_expanded is False
    assert sleeps == []  # never paged → never slept


def test_deepens_to_page_two_before_widening(monkeypatch):
    page0 = [_gp(f"A {i}", f"a{i}", _LAT + 0.001 * i) for i in range(4)]   # short
    page1 = [_gp(f"B {i}", f"b{i}", _LAT + 0.002 * i) for i in range(8)]   # enough
    sleeps: list[float] = []
    _wire(monkeypatch, {5000: [page0, page1]}, sleep_spy=sleeps)

    res = asyncio.run(search_service.search(SearchParams(q="restaurant", lat=_LAT, lng=_LNG)))
    assert res.total == 12            # both pages combined
    assert res.radius_used_km == 5.0  # deepened at the SAME radius
    assert res.radius_expanded is False
    assert len(sleeps) == 1           # one inter-page settle delay


def test_widens_only_after_pages_exhausted(monkeypatch):
    near = [_gp(f"N {i}", f"n{i}", _LAT + 0.001 * i) for i in range(4)]   # only 4 nearby
    far = [_gp(f"F {i}", f"f{i}", _LAT + 0.135, _LNG + 0.001 * i) for i in range(8)]
    _wire(monkeypatch, {5000: [near], 20_000: [near + far]})  # 5km has ONE page

    res = asyncio.run(search_service.search(SearchParams(q="restaurant", lat=_LAT, lng=_LNG)))
    assert res.total == 12
    assert res.radius_used_km == 20.0   # widened because 5km had no more pages
    assert res.radius_expanded is True


# ── C. Category-only browse fetches each selected chip ───────────────────────

# The full chip vocabulary (mirror of seed.sql categories table, lines ~21-23).
SEED_CATEGORIES = [
    "Coffee", "Cafe", "Bakery", "Restaurant", "Bar", "Food", "Bookstore",
    "Grocery", "Pharmacy", "Retail", "Dessert", "Barber", "Salon", "Fitness",
    "Florist", "Services",
]


def test_chip_query_covers_every_seed_category():
    """Every category a user can click must map to a Google query, or browsing
    it would silently fetch nothing. Guards the map against schema drift."""
    from app.services.places import chip_query
    missing = [c for c in SEED_CATEGORIES if not chip_query(c)]
    assert missing == [], f"chips with no query mapping: {missing}"


def _wire_by_query(monkeypatch, pages_by_query, *, call_spy=None):
    """fake_text dispatches on the QUERY term; search_nearby raises if hit
    (proving category browse never falls through to the generic sweep)."""
    monkeypatch.setattr(search_service.biz_repo, "fetch_active", lambda: [])
    monkeypatch.setattr(classifier.places_cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(classifier.places_cache, "set", lambda *a, **k: None)

    async def all_small(rows):
        return {r["id"]: {"verdict": "small", "confidence": "high", "reason": "ok"}
                for r in rows}
    monkeypatch.setattr(classifier.llm, "classify_chains", all_small)

    async def fake_text(q, lat, lng, radius_m, *, page=0, page_token=None):
        if call_spy is not None and page == 0:
            call_spy.append(q)
        pages = pages_by_query.get(q, [])
        if page >= len(pages):
            return [], None
        token = "more" if page + 1 < len(pages) else None
        return [dict(p) for p in pages[page]], token
    monkeypatch.setattr(search_service.places, "search_text", fake_text)

    async def boom(*a, **k):
        raise AssertionError("search_nearby must NOT be called for category browse")
    monkeypatch.setattr(search_service.places, "search_nearby", boom)

    async def fake_sleep(_s):
        pass
    monkeypatch.setattr(search_service.asyncio, "sleep", fake_sleep)


def test_each_category_chip_fetches_its_own_results(monkeypatch):
    # Each previously-empty chip now fetches via its mapped query term.
    for chip, query in [("Bookstore", "bookstore"), ("Pharmacy", "pharmacy"),
                        ("Barber", "barber shop"), ("Salon", "hair salon"),
                        ("Fitness", "gym"), ("Florist", "florist")]:
        rows = [_gp(f"{chip} {i}", f"{chip}{i}", _LAT + 0.001 * i) for i in range(5)]
        for r in rows:
            r["categories"] = [chip]  # so _passes_filters keeps them
        _wire_by_query(monkeypatch, {query: [rows]})
        res = asyncio.run(search_service.search(
            SearchParams(lat=_LAT, lng=_LNG, categories=[chip])))
        assert res.total == 5, f"{chip} browse returned {res.total}"


def test_multi_category_merges_and_dedupes(monkeypatch):
    books = [_gp(f"Book {i}", f"bk{i}", _LAT + 0.001 * i) for i in range(3)]
    for r in books:
        r["categories"] = ["Bookstore"]
    cafes = [_gp(f"Cafe {i}", f"cf{i}", _LAT + 0.002 * i) for i in range(3)]
    for r in cafes:
        r["categories"] = ["Cafe"]
    shared = _gp("Shared Spot", "sh0", _LAT)
    shared["categories"] = ["Bookstore", "Cafe"]
    _wire_by_query(monkeypatch, {"bookstore": [books + [shared]],
                                 "cafe": [cafes + [dict(shared)]]})
    res = asyncio.run(search_service.search(
        SearchParams(lat=_LAT, lng=_LNG, categories=["Bookstore", "Cafe"])))
    # 3 books + 3 cafes + 1 shared (deduped by name) = 7
    assert res.total == 7
    assert sum(1 for r in res.results if r.name == "Shared Spot") == 1


def test_multi_category_early_exit_skips_later_chips(monkeypatch):
    # First chip alone reaches the minimum → the second chip is never fetched.
    books = [_gp(f"Book {i}", f"bk{i}", _LAT + 0.001 * i) for i in range(12)]
    for r in books:
        r["categories"] = ["Bookstore"]
    spy: list[str] = []
    _wire_by_query(monkeypatch, {"bookstore": [books]}, call_spy=spy)
    res = asyncio.run(search_service.search(
        SearchParams(lat=_LAT, lng=_LNG, categories=["Bookstore", "Pharmacy"])))
    assert res.total == 12
    assert "pharmacy" not in spy  # early-exit short-circuited the 2nd chip


def test_pure_browse_uses_expanded_types(monkeypatch):
    captured: dict[str, list] = {}

    async def fake_nearby(lat, lng, radius_m, included_types=None):
        captured["types"] = included_types or []
        return []
    monkeypatch.setattr(search_service.biz_repo, "fetch_active", lambda: [])
    monkeypatch.setattr(search_service.places, "search_nearby", fake_nearby)

    asyncio.run(search_service.search(SearchParams(lat=_LAT, lng=_LNG)))
    for needed in ["pharmacy", "barber_shop", "hair_salon", "gym", "florist", "dessert_shop"]:
        assert needed in captured["types"], f"{needed} missing from browse types"
