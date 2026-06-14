"""Small-business filter tests: registry matching + the MEASURED recall floor
+ classifier orchestration with canned LLM responses (no live API, no DB).

The pipeline replacing the old signal detector is: chain registry (seeded
brand list + learned names) → per-place verdict cache → ONE batched Gemini
audit → registry writeback. These tests pin each gate's contract, and the
harness keeps the project's accuracy claim honest: the REGISTRY layer's
recall/precision over the hand-labeled set is the only citable number — the
LLM layer is validated behaviorally here, never quoted as a percentage.

Run:  pytest tests/test_classifier.py -v -s     (-s shows the harness output)
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.services import chain_registry, classifier, llm
from app.services.brands import CHAIN_BRANDS, match_against, match_chain, normalize_name

# Asserted floors for the registry layer over labeled_businesses.json.
# Measured at adoption time: recall 0.849, false positives 0. "Positive" =
# chain. FP must stay ZERO: the registry hides businesses with no appeal, so
# a single real independent in it would be the worst failure the app has.
MIN_REGISTRY_RECALL = 0.80
MAX_REGISTRY_FALSE_POSITIVES = 0

_DATA = Path(__file__).parent / "labeled_businesses.json"


# ── Brand matcher units ──────────────────────────────────────────────────────

def test_normalize_strips_storefront_decorations():
    assert normalize_name("Starbucks #4271 - Downtown") == "starbucks"
    assert normalize_name("Wendy's®") == "wendy's"
    assert normalize_name("CVS Pharmacy (24h)") == "cvs pharmacy"


def test_match_handles_possessives_and_prefixes():
    assert match_chain("McDonald's") == "mcdonald's"
    assert match_chain("Panera Bread Bakery Cafe") == "panera bread"
    assert match_chain("Dunkin' Donuts") is not None


def test_ambiguous_single_words_require_exact_match():
    # "Shell Beach Seafood" must NOT match the Shell gas brand by prefix…
    assert match_chain("Shell Beach Seafood") is None
    assert match_chain("Target Practice Archery Range") is None
    # …but the exact storefront name still matches.
    assert match_chain("Shell") == "shell"
    assert match_chain("Target") == "target"


def test_non_fuzzy_matching_disables_the_prefix_pass():
    learned = {"joe's pizza"}
    # Exact (and apostrophe-collapsed) forms match…
    assert match_against("Joe's Pizza", learned, fuzzy=False) == "joe's pizza"
    # …but similar names must NOT — one learned storefront can't blanket-hide
    # every independent that happens to share a prefix.
    assert match_against("Joe's Pizza & Sons", learned, fuzzy=False) is None
    assert match_against("Joes Pizza Express", learned, fuzzy=False) is None


# ── Registry matching (in-memory state seam — no DB) ────────────────────────

def _registry(seed: set[str] | None = None, llm_names: dict | None = None):
    chain_registry._set_state_for_tests(
        seed if seed is not None else set(CHAIN_BRANDS),
        llm_names or {},
    )


def test_registry_matches_seed_brands_fuzzily():
    _registry()
    hit = chain_registry.match("Starbucks #4271 - Downtown")
    assert hit and hit["source"] == "seed" and hit["matched"] == "starbucks"
    assert chain_registry.match("Shell Beach Seafood") is None  # ambiguous guard


def test_registry_matches_learned_names_exactly_only():
    _registry(seed=set(), llm_names={"joe's pizza": {"display_name": "Joe's Pizza",
                                                     "reason": "test"}})
    hit = chain_registry.match("Joe's Pizza")
    assert hit and hit["source"] == "llm"
    assert chain_registry.match("Joe's Pizza & Sons") is None
    assert chain_registry.match("Joes Pizza Express") is None


# ── The registry recall harness (the citable number) ────────────────────────

def test_registry_recall_floor_over_labeled_set():
    _registry()  # full curated seed, no learned names
    rows = json.loads(_DATA.read_text(encoding="utf-8"))["businesses"]
    assert len(rows) >= 120, "validation set shrank — keep it ≥120 rows"

    chains = [r for r in rows if r["label"] == "chain"]
    locals_ = [r for r in rows if r["label"] == "local"]

    caught = [r["name"] for r in chains if chain_registry.match(r["name"])]
    missed = [r["name"] for r in chains if not chain_registry.match(r["name"])]
    false_pos = [r["name"] for r in locals_ if chain_registry.match(r["name"])]

    recall = len(caught) / len(chains)
    print(f"\n┌─ Registry layer over {len(rows)} hand-labeled businesses ─┐")
    print(f"│  chains caught by the seed registry: {len(caught)}/{len(chains)}"
          f"  (recall {recall:.3f})")
    print(f"│  independents wrongly matched (must be 0): {len(false_pos)}")
    print(f"│  off-list chains left for the Gemini layer: {missed}")
    print("└" + "─" * 62 + "┘")

    assert recall >= MIN_REGISTRY_RECALL, f"registry recall {recall:.3f} < {MIN_REGISTRY_RECALL}"
    assert len(false_pos) <= MAX_REGISTRY_FALSE_POSITIVES, f"false positives: {false_pos}"


# ── Classifier orchestration (canned LLM, spied caches) ─────────────────────

def _biz(name: str, place_id: str, **extra) -> dict:
    return {"name": name, "place_id": place_id, "lat": 40.73, "lng": -73.99,
            "categories": ["Coffee"], "review_count": 50, "average_rating": 4.5,
            **extra}


def _canned(verdicts: dict | None):
    """An llm_fn returning a fixed verdict map (or None = LLM failure)."""
    async def fn(rows):
        return verdicts
    return fn


def _no_cache(monkeypatch):
    """Silence the on-disk verdict cache; return the spy of set() calls."""
    sets: list[tuple] = []
    monkeypatch.setattr(classifier.places_cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(classifier.places_cache, "set",
                        lambda key, value: sets.append((key, value)))
    return sets


def test_annotate_drops_registry_chains_without_llm(monkeypatch):
    _registry()
    _no_cache(monkeypatch)
    called = []

    async def llm_should_not_run(rows):
        called.append(rows)
        return {}

    out = asyncio.run(classifier.annotate(
        [_biz("Starbucks", "p1"), _biz("Dunkin'", "p2")], llm_fn=llm_should_not_run))
    assert out == []
    assert called == []  # everything died at the registry; no LLM call at all


def test_annotate_honors_llm_verdicts_and_learns_high_confidence(monkeypatch):
    _registry()
    sets = _no_cache(monkeypatch)
    learned = []
    monkeypatch.setattr(classifier.chain_registry, "record_llm_chains",
                        lambda items: learned.extend(items))

    out = asyncio.run(classifier.annotate(
        [_biz("Hilltop Hardware", "p1"), _biz("Blank Street Coffee", "p2")],
        llm_fn=_canned({
            "p1": {"verdict": "small", "confidence": "low", "reason": "One-off."},
            "p2": {"verdict": "chain", "confidence": "high", "reason": "VC coffee chain."},
        })))

    assert [b["name"] for b in out] == ["Hilltop Hardware"]
    survivor = out[0]
    assert survivor["is_independent"] is True
    assert survivor["local_badge"] == "verified_local"
    assert survivor["local_confidence"] == classifier.CONFIRMED_CONFIDENCE
    assert survivor["verdict_source"] == "gemini"
    # Both verdicts cached per place; only the high-confidence chain is learned.
    assert {k for k, _ in sets} == {"verdict:p1", "verdict:p2"}
    assert [item["display_name"] for item in learned] == ["Blank Street Coffee"]


def test_annotate_low_confidence_chain_hides_but_does_not_learn(monkeypatch):
    _registry()
    sets = _no_cache(monkeypatch)
    learned = []
    monkeypatch.setattr(classifier.chain_registry, "record_llm_chains",
                        lambda items: learned.extend(items))

    out = asyncio.run(classifier.annotate(
        [_biz("Ambiguous Cafe", "p1")],
        llm_fn=_canned({"p1": {"verdict": "chain", "confidence": "low",
                               "reason": "Possibly a chain."}})))
    assert out == []                      # hidden from THIS search…
    assert learned == []                  # …but the NAME is not blacklisted
    assert sets and sets[0][0] == "verdict:p1"  # the place itself is remembered


def test_annotate_llm_failure_passes_unknowns_unverified(monkeypatch):
    """The offline contract: registry still filters, unknowns are SHOWN."""
    _registry()
    sets = _no_cache(monkeypatch)

    out = asyncio.run(classifier.annotate(
        [_biz("Starbucks", "p1"), _biz("Unknown Cafe", "p2")], llm_fn=_canned(None)))

    assert [b["name"] for b in out] == ["Unknown Cafe"]
    survivor = out[0]
    assert survivor["local_badge"] == "likely_local"
    assert survivor["local_confidence"] == classifier.UNVERIFIED_CONFIDENCE
    assert survivor["verdict_source"] == "unverified-offline"
    assert sets == []  # nothing cached — retry verification when back online


def test_annotate_partial_llm_response_fills_gaps_as_unverified(monkeypatch):
    _registry()
    _no_cache(monkeypatch)

    out = asyncio.run(classifier.annotate(
        [_biz("Cafe A", "p1"), _biz("Cafe B", "p2")],
        llm_fn=_canned({"p1": {"verdict": "small", "confidence": "high", "reason": "ok"}})))

    by_name = {b["name"]: b for b in out}
    assert by_name["Cafe A"]["verdict_source"] == "gemini"
    assert by_name["Cafe B"]["verdict_source"] == "unverified-offline"


def test_classify_one_registry_path_shape(monkeypatch):
    """The /signals glass-box contract for a registry-matched chain."""
    _registry()
    _no_cache(monkeypatch)
    verdict = asyncio.run(classifier.classify_one(_biz("Starbucks", "p1")))
    assert verdict["verdict"] == "chain"
    assert verdict["source"] == "known-registry"
    assert [c["step"] for c in verdict["checks"]] == [
        "owner_record", "chain_registry", "verdict_cache", "gemini",
    ]


# ── LLM response parsing (canned _chat, no network) ──────────────────────────

def _parse_with(monkeypatch, raw: str | None):
    async def fake_chat(*args, **kwargs):
        return raw
    monkeypatch.setattr(llm, "_chat", fake_chat)
    return asyncio.run(llm.classify_chains([{"id": "x", "name": "Test"}]))


def test_classify_chains_parses_fenced_json(monkeypatch):
    raw = '```json\n{"x": {"verdict": "chain", "confidence": "high", "reason": "r"}}\n```'
    assert _parse_with(monkeypatch, raw) == {
        "x": {"verdict": "chain", "confidence": "high", "reason": "r"}
    }


def test_classify_chains_rejects_garbage(monkeypatch):
    assert _parse_with(monkeypatch, "not json at all") is None
    assert _parse_with(monkeypatch, None) is None


def test_classify_chains_drops_invalid_verdict_values(monkeypatch):
    raw = json.dumps({
        "x": {"verdict": "franchise?", "confidence": "high", "reason": "r"},
    })
    # The only entry is invalid → nothing usable → None (treated as failure).
    assert _parse_with(monkeypatch, raw) is None


# ── The min-10 radius ladder (search() with mocked layers) ───────────────────

from app.models.business import SearchParams  # noqa: E402  (test-section import)
from app.services import search_service  # noqa: E402

_LAT, _LNG = 40.7308, -73.9973  # the demo center


def _google_place(name: str, pid: str, lat: float, lng: float) -> dict:
    """A dict shaped like places.format_place output (the classifier's input)."""
    return {
        "ref": f"gp_{pid}", "source": "google", "place_id": pid, "name": name,
        "lat": lat, "lng": lng, "address": None, "phone": None, "website": None,
        "price_level": None, "categories": ["Coffee"], "average_rating": 4.0,
        "review_count": 10, "is_independent": None, "local_confidence": None,
        "local_badge": None, "is_open_now": None, "photo_url": None,
        "editorial_summary": None, "primary_type": "cafe",
    }


async def _all_small(rows):
    """Canned Gemini: every unknown is a small business."""
    return {r["id"]: {"verdict": "small", "confidence": "high", "reason": "ok"}
            for r in rows}


def _wire_search(monkeypatch, *, by_radius: dict[int, list[dict]],
                 locals_: list[dict] | None = None, llm_fn=_all_small):
    """Patch every layer search() touches: Places, the local DB, the verdict
    cache, and the Gemini call. Returns the spy list of LLM batches."""
    _registry()
    batches: list[list[dict]] = []

    # Paginated text search: all of a radius's results land on page 0 with no
    # next-page token, so these tests exercise the radius ladder (widen) rather
    # than page-deepening — each radius is a single page.
    async def fake_text(q, lat, lng, radius_m, *, page=0, page_token=None):
        if page > 0:
            return [], None
        return [dict(p) for p in by_radius.get(radius_m, [])], None

    async def fake_nearby(lat, lng, radius_m, included_types=None):
        return [dict(p) for p in by_radius.get(radius_m, [])]

    async def spying_llm(rows):
        batches.append(rows)
        return await llm_fn(rows)

    monkeypatch.setattr(search_service.places, "search_text", fake_text)
    monkeypatch.setattr(search_service.places, "search_nearby", fake_nearby)
    monkeypatch.setattr(search_service.biz_repo, "fetch_active",
                        lambda: list(locals_ or []))
    monkeypatch.setattr(classifier.places_cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(classifier.places_cache, "set", lambda *a, **k: None)
    monkeypatch.setattr(classifier.llm, "classify_chains", spying_llm)
    return batches


def test_ladder_stops_at_first_rung_when_enough_results(monkeypatch):
    near = [_google_place(f"Cafe {i}", f"p{i}", _LAT + 0.001 * i, _LNG)
            for i in range(12)]
    _wire_search(monkeypatch, by_radius={5000: near})

    res = asyncio.run(search_service.search(SearchParams(q="coffee", lat=_LAT, lng=_LNG)))
    assert res.total == 12
    assert res.radius_used_km == 5.0
    assert res.radius_expanded is False


def test_ladder_widens_and_only_sends_new_names_to_the_llm(monkeypatch):
    near = [_google_place(f"Near {i}", f"n{i}", _LAT + 0.001 * i, _LNG)
            for i in range(4)]
    # The wider pull returns the SAME 4 plus 8 genuinely new ones at ~15 km.
    far = [_google_place(f"Far {i}", f"f{i}", _LAT + 0.135, _LNG + 0.001 * i)
           for i in range(8)]
    batches = _wire_search(monkeypatch,
                           by_radius={5000: near, 20_000: near + far})

    res = asyncio.run(search_service.search(SearchParams(q="coffee", lat=_LAT, lng=_LNG)))
    assert res.total == 12
    assert res.radius_used_km == 20.0
    assert res.radius_expanded is True
    # Rung 2's Gemini batch must exclude everything rung 1 already classified.
    assert [r["id"] for r in batches[0]] == [f"n{i}" for i in range(4)]
    assert sorted(r["id"] for r in batches[1]) == sorted(f"f{i}" for i in range(8))


def test_local_backbone_does_not_leak_when_radius_widens(monkeypatch):
    # A curated local row 15 km away must NOT appear for a user who searched the
    # default 5 km radius — even though the min-results ladder widens to 50 km
    # looking for Google breadth. (This is the Glen-Rock fix: the fixed NYC seed
    # cluster must not flood a suburban search 28 km away.)
    far_local = {
        "id": 1, "name": "Far Away Books", "lat": _LAT + 0.135, "lng": _LNG,
        "categories": ["Bookstore"], "average_rating": 4.8, "review_count": 30,
        "is_independent": True, "local_confidence": 0.9, "hours": None,
    }
    _wire_search(monkeypatch, by_radius={}, locals_=[far_local])

    res = asyncio.run(search_service.search(SearchParams(lat=_LAT, lng=_LNG)))
    assert res.radius_used_km == 50.0       # widened looking for Google results
    assert [b.name for b in res.results] == []  # the far local is capped out


def test_local_backbone_shows_within_requested_radius(monkeypatch):
    # The same local, when actually within the user's radius, DOES show.
    near_local = {
        "id": 1, "name": "Corner Books", "lat": _LAT + 0.01, "lng": _LNG,
        "categories": ["Bookstore"], "average_rating": 4.8, "review_count": 30,
        "is_independent": True, "local_confidence": 0.9, "hours": None,
    }
    _wire_search(monkeypatch, by_radius={}, locals_=[near_local])

    res = asyncio.run(search_service.search(SearchParams(lat=_LAT, lng=_LNG)))
    assert [b.name for b in res.results] == ["Corner Books"]
