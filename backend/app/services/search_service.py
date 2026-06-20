"""Search orchestration: blend local + Google, compute distance/open-now,
filter, and rank (BUILD_SPEC §8.1/§8.3).

Local DB businesses are the reliable backbone (they carry our categories,
reviews, and deals, and they work offline). When the user types a query we also
pull Google Places for breadth, de-duplicating against local matches. Every
external call is already failure-wrapped in ``places.py``, so search always
returns *something*.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import re
from typing import Any, Optional

from app.config import settings
from app.models.business import SearchParams, SearchResponse
from app.repositories import businesses as biz_repo
from app.repositories import reviews as reviews_repo
from app.services import (
    classifier,
    embeddings,
    places,
    places_cache,
    ranker,
    review_trust,
)

try:  # America/New_York for open-now; degrade to None if tz data is unavailable.
    from zoneinfo import ZoneInfo
    _ET = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover
    _ET = None


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _local_badge(is_independent: Optional[bool], confidence: Optional[float]) -> Optional[str]:
    """Badge for *local* (owner-listed) businesses; Google results get theirs
    from the classifier pipeline."""
    if not is_independent or confidence is None:
        return None
    if confidence >= 0.85:
        return "verified_local"
    if confidence >= 0.6:
        return "likely_local"
    return None


def _open_now(hours: Optional[list[dict]]) -> Optional[bool]:
    """Compute open-now from seeded hours + current ET time. None if unknown."""
    if not hours or _ET is None:
        return None
    try:
        now = dt.datetime.now(_ET)
        dow = now.isoweekday() % 7  # → 0=Sunday .. 6=Saturday (our schema's convention)
        today = next((h for h in hours if h.get("dow") == dow), None)
        if not today or today.get("closed") or not today.get("open") or not today.get("close"):
            return False if today else None
        # open/close arrive as "HH:MM:SS" strings from json_build_object(TIME).
        o = dt.time.fromisoformat(str(today["open"]))
        c = dt.time.fromisoformat(str(today["close"]))
        return o <= now.time() <= c
    except Exception:
        return None


def _local_to_canonical(row: dict[str, Any], user_lat: float, user_lng: float) -> dict[str, Any]:
    conf = row.get("local_confidence")
    provenance = classifier.verdict_for_local(row)
    return {
        "verdict_source": provenance["source"],
        "verdict_reason": provenance["reason"],
        "ref": str(row["id"]),
        "source": "local",
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "address": row.get("address"),
        "phone": row.get("phone"),
        "website": row.get("website"),
        "price_level": row.get("price_level"),
        "categories": list(row.get("categories") or []),
        "average_rating": float(row.get("average_rating") or 0.0),
        "review_count": int(row.get("review_count") or 0),
        "is_independent": row.get("is_independent"),
        "local_confidence": conf,
        "local_badge": _local_badge(row.get("is_independent"), conf),
        "is_open_now": _open_now(row.get("hours")),
        "distance_km": round(ranker.driving_km(user_lat, user_lng, row["lat"], row["lng"]), 2),
        "photo_url": row.get("photo_url"),
        # Smart-crop focal point (Phase F) — None means "center", and Google
        # results never carry one, so the UI defaults to 50/50.
        "photo_focus_x": row.get("photo_focus_x"),
        "photo_focus_y": row.get("photo_focus_y"),
        "editorial_summary": None,
    }


def _passes_filters(b: dict[str, Any], p: SearchParams, effective_radius_m: int) -> bool:
    """User filters + the app's one structural rule.

    ``effective_radius_m`` may exceed the requested radius — the min-results
    ladder widens it to pull more GOOGLE breadth in a sparse area. But that
    widening must NOT reach into the curated local backbone: those rows are a
    fixed set (the seeded NYC businesses), so a user in a NJ suburb 28 km from
    Manhattan must not have the whole NYC seed flood their results. Local rows
    are therefore capped at the user's REQUESTED radius; only Google results
    extend to the widened circle.
    """
    cap_m = p.radius_m if b.get("source") == "local" else effective_radius_m
    # distance_km is the driving estimate, but the candidate radius is straight-
    # line geography (the Places search circle), so compare on straight-line km.
    straight_km = (
        b["distance_km"] / ranker.CIRCUITY_FACTOR
        if b.get("distance_km") is not None else None
    )
    if straight_km is not None and straight_km > cap_m / 1000.0:
        return False
    if p.categories:
        # Token-SUBSET containment, not exact equality: the "Restaurant" chip
        # must match a Google "Mexican Restaurant", and "Coffee" must match
        # "Coffee Shop". Whole-token comparison (not substring) so "Bar" never
        # matches "Barber" — both are real chips. A chip passes if all of its
        # tokens appear in some one category's tokens.
        biz_token_sets = [
            set(re.findall(r"[a-z0-9]+", (c or "").lower()))
            for c in b.get("categories", [])
        ]
        def _chip_matches(chip: str) -> bool:
            chip_tokens = set(re.findall(r"[a-z0-9]+", chip.lower()))
            return bool(chip_tokens) and any(
                chip_tokens <= ts for ts in biz_token_sets
            )
        if not any(_chip_matches(c) for c in p.categories):
            return False
    if p.min_rating and (b.get("average_rating") or 0) < p.min_rating:
        return False
    if p.price_levels:
        if b.get("price_level") not in set(p.price_levels):
            return False
    if p.open_now and b.get("is_open_now") is not True:
        return False
    # Not a user filter — the product rule. Chains never display, period.
    if b.get("is_independent") is False:
        return False
    return True


def _matches_query(b: dict[str, Any], q: str) -> bool:
    """Keyword relevance for the LOCAL layer: does any meaningful query token
    appear in the name or categories? ('indian' must NOT match a pizzeria.)"""
    haystack = (b["name"] + " " + " ".join(b.get("categories") or [])).lower()
    tokens = [t for t in q.lower().split() if len(t) >= 3]
    return any(t in haystack for t in tokens) if tokens else True


async def _semantic_local_matches(q: str, lat: float, lng: float,
                                  exclude: set[str]) -> list[dict]:
    """One semantic pass over the local index for classic search: catches
    meaning-matches the keyword filter can't ('fresh pasta' → Raffetto's).

    Deliberately conservative: only fires for MULTI-WORD queries (single words
    like 'indian' are categorical — keyword + Google handle those; semantic
    neighbors of one word are mostly noise) and only above 0.50 similarity.
    Empty when offline — classic search stays fully keyword-functional."""
    if len([t for t in q.split() if len(t) >= 3]) < 2:
        return []
    vector = await embeddings.embed_text(q)
    if vector is None:
        return []
    out = []
    for row in biz_repo.vibe_search(embeddings.to_pgvector(vector), limit=8):
        if float(row["similarity"]) < 0.50 or str(row["id"]) in exclude:
            continue
        canon = _local_to_canonical(row, lat, lng)
        canon["similarity"] = round(float(row["similarity"]), 3)
        out.append(canon)
    return out


# The min-results contract: keep deepening/widening the search until at least
# this many small businesses are found (or the API's 50 km ceiling is hit).
MIN_SMALL_RESULTS = 10
RADIUS_LADDER_M = (20_000, 50_000)  # rungs beyond the requested radius
MAX_PAGES = 3            # Google returns 20/page, up to 60 across 3 pages
PAGE_SETTLE_S = 2.0      # Google needs a beat before a nextPageToken is valid

# Customer-facing types for the PURE-browse sweep (no query, no category) — the
# landing page. It covers every chip so each category CAN appear, but it's one
# 20-cap Nearby call (no pagination), so it's a deliberately bounded starting
# point: depth for any single category comes from clicking its chip, which
# routes through the paginated text path below.
NEARBY_TYPES = [
    "restaurant", "cafe", "coffee_shop", "bakery", "bar",
    "book_store", "grocery_store", "clothing_store", "gift_shop",
    "pharmacy", "drugstore", "barber_shop", "hair_salon", "beauty_salon",
    "gym", "fitness_center", "florist", "dessert_shop",
    "ice_cream_shop", "donut_shop",
]


async def _classify_page(raw: list[dict], params: SearchParams,
                         seen: set[str]) -> list[dict]:
    """Dedupe one raw Google page against ``seen`` (which persists across all
    pages and rungs), stamp distances, then run the survivors through the
    small-business classifier (registry → cache → ONE batched Gemini call).
    Only the small businesses come back, fully annotated."""
    # Nearest branch first, so the per-name dedupe keeps the closest one.
    raw.sort(key=lambda g: ranker.haversine_km(params.lat, params.lng, g["lat"], g["lng"])
             if g.get("lat") is not None else 9e9)
    fresh = []
    for g in raw:
        key = _normalize_name(g["name"])
        if g.get("lat") is None or key in seen:
            continue  # branch dupes + names already taken by any earlier layer
        seen.add(key)
        g["distance_km"] = round(
            ranker.driving_km(params.lat, params.lng, g["lat"], g["lng"]), 2
        )
        fresh.append(g)
    return await classifier.annotate(fresh)


async def search(params: SearchParams) -> SearchResponse:
    # 1) Local backbone — query-filtered: keyword matches plus ONE semantic
    #    pass, so typing "indian" doesn't surface unrelated locals but
    #    "fresh pasta" still finds the pasta shop whose name never says it.
    #    LocalLens-listed rows are small by construction (owner-accountable),
    #    so they skip the classifier entirely.
    local = [_local_to_canonical(r, params.lat, params.lng) for r in biz_repo.fetch_active()]
    if params.q:
        keyword_matched = [b for b in local if _matches_query(b, params.q)]
        semantic = await _semantic_local_matches(
            params.q, params.lat, params.lng, {b["ref"] for b in keyword_matched}
        )
        local = keyword_matched + semantic

    # 2) Google breadth. The min-results contract DEEPENS before it WIDENS: at
    #    each radius we page through up to 60 Google results (surfacing nearby
    #    locals the prominence-ranked first page buries) before jumping to a
    #    wider — and less local — circle. The wider radius also applies to the
    #    local layer (via effective_radius_m in _passes_filters).
    seen = {_normalize_name(b["name"]) for b in local}
    google: list[dict] = []
    google_raw_attempted = False
    eligible: list[dict] = []
    radius_used = params.radius_m

    def _recompute(radius_m: int) -> None:
        nonlocal eligible
        eligible = [b for b in (local + google) if _passes_filters(b, params, radius_m)]

    async def _deepen_text(query: str, radius_m: int) -> None:
        """Page through up to MAX_PAGES of one text query at one radius,
        classifying + accumulating into the shared google/seen and recomputing
        eligible after each page. Stops early at MIN_SMALL_RESULTS or when the
        pages run out. Used by BOTH the typed query and per-category browse, so
        the deepen-before-widen logic lives in exactly one place."""
        nonlocal google_raw_attempted
        next_token: Optional[str] = None
        for page in range(MAX_PAGES):
            if page > 0:
                # Only deepen if still short AND another page exists.
                if len(eligible) >= MIN_SMALL_RESULTS or not next_token:
                    break
                await asyncio.sleep(PAGE_SETTLE_S)  # let the token settle
            raw, next_token = await places.search_text(
                query, params.lat, params.lng, radius_m,
                page=page, page_token=next_token,
            )
            google_raw_attempted = True
            google.extend(await _classify_page(raw, params, seen))
            _recompute(radius_m)
            if len(eligible) >= MIN_SMALL_RESULTS:
                break

    ladder = [params.radius_m] + [r for r in RADIUS_LADDER_M if r > params.radius_m]
    for radius_m in ladder:
        radius_used = radius_m
        if params.q:
            # Typed query → paginated text search, deepen-before-widen.
            await _deepen_text(params.q, radius_m)
        elif params.categories:
            # Category browse with no typed query: fetch EACH selected chip via
            # its own paginated text query (so "Pharmacy" actually searches for
            # pharmacies, not a generic sweep). Shared `seen` merges/dedupes
            # multi-select; stop once the combined pool hits the minimum.
            for chip in params.categories:
                query = places.chip_query(chip)
                if not query:
                    continue  # unknown/legacy chip — skip defensively
                await _deepen_text(query, radius_m)
                if len(eligible) >= MIN_SMALL_RESULTS:
                    break
        else:
            # Pure browse (no query, no category): one Nearby sweep per radius
            # over the full customer-facing type list (no pagination).
            raw = await places.search_nearby(
                params.lat, params.lng, radius_m, included_types=NEARBY_TYPES
            )
            google_raw_attempted = True
            google.extend(await _classify_page(raw, params, seen))
            _recompute(radius_m)
        if len(eligible) >= MIN_SMALL_RESULTS:
            break  # enough nearby — don't widen to a less-local radius

    used_fallback = (
        bool(params.q or params.categories)
        and settings.online and google_raw_attempted and len(google) == 0
    )

    # 3) Rank the survivors.
    ranked = ranker.sort_results(eligible, params.sort)[:40]
    return SearchResponse(
        results=ranked,
        total=len(ranked),
        used_local_fallback=used_fallback,
        radius_used_km=round(radius_used / 1000.0, 1),
        radius_expanded=radius_used > params.radius_m,
    )


_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def _fmt_time(value: Any) -> str:
    """'08:00:00' → '8:00 AM' for a friendly hours display."""
    try:
        return dt.time.fromisoformat(str(value)).strftime("%-I:%M %p")
    except Exception:
        return str(value)


def _format_hours(hours: Optional[list[dict]]) -> list[str]:
    """Turn seeded hours rows into 7 human strings ('Monday: 8:00 AM – 8:00 PM')."""
    if not hours:
        return []
    by_dow = {h.get("dow"): h for h in hours}
    out = []
    for dow in range(7):
        h = by_dow.get(dow)
        if not h or h.get("closed") or not h.get("open"):
            out.append(f"{_DAY_NAMES[dow]}: Closed")
        else:
            out.append(f"{_DAY_NAMES[dow]}: {_fmt_time(h['open'])} – {_fmt_time(h['close'])}")
    return out


# Vibe search only trusts the curated (pgvector) index within metro range of
# the user — beyond that, live Google results are embedded on the fly instead.
VIBE_LOCAL_RANGE_KM = 40.0

# Atmospheric queries ("old new york") make Google return landmarks alongside
# storefronts. This is a BUSINESS discovery tool, so non-commercial places are
# excluded from vibe results no matter how well they match the feeling.
_VIBE_EXCLUDED_TYPES = {
    "church", "place_of_worship", "synagogue", "mosque", "hindu_temple",
    "tourist_attraction", "historical_landmark", "monument", "park", "plaza",
    "school", "university", "library", "museum", "cemetery", "city_hall",
    "courthouse", "government_office", "post_office",
    "corporate_office", "warehouse", "wholesaler", "distribution_center",
}


async def _vibe_google_candidates(q: str, query_vector: list[float],
                                  lat: float, lng: float) -> list[dict]:
    """Vibe search ANYWHERE: embed live Google results on the fly.

    One Places text search → the small-business classifier (chains never spend
    an embedding call) → one BATCHED embedding call for the uncached survivors
    (each place's vector is cached by id, so repeat vibe queries in a city cost
    zero extra embedding calls) → cosine in Python.
    """
    raw, _ = await places.search_text(q, lat, lng, 5000)  # page 0 is plenty for vibe
    if not raw:
        return []

    # One entry per storefront NAME (chains return several branches; keep the
    # first, which Google orders by relevance) — also saves embedding calls.
    # Landmarks/POIs (churches, parks…) are dropped here: not businesses.
    seen_names: set[str] = set()
    deduped = []
    for g in raw:
        key = _normalize_name(g["name"])
        if g.get("lat") is None or key in seen_names:
            continue
        if g.get("primary_type") in _VIBE_EXCLUDED_TYPES:
            continue
        seen_names.add(key)
        g["distance_km"] = round(ranker.driving_km(lat, lng, g["lat"], g["lng"]), 2)
        deduped.append(g)

    # Small businesses only — registry → cached verdicts → batched Gemini.
    raw = await classifier.annotate(deduped)

    docs: list[tuple[int, str]] = []  # (index into raw, doc text) needing embedding
    vectors: dict[int, list[float]] = {}
    for i, g in enumerate(raw):
        cached = places_cache.get(f"gemb:{g['place_id']}")
        if cached:
            vectors[i] = cached
        else:
            doc = " | ".join(filter(None, [
                g["name"], ", ".join(g.get("categories") or []),
                g.get("editorial_summary") or "",
            ]))
            docs.append((i, doc))

    if docs:
        fresh = await embeddings.embed_texts([d for _, d in docs])
        if fresh:
            for (i, _), vec in zip(docs, fresh):
                vectors[i] = vec
                places_cache.set(f"gemb:{raw[i]['place_id']}", vec)

    out = []
    for i, vec in vectors.items():
        g = raw[i]
        g["similarity"] = round(embeddings.cosine(query_vector, vec), 3)
        out.append(g)
    return out


async def vibe_search(q: str, lat: float, lng: float, limit: int = 10,
                      filters: Optional[SearchParams] = None) -> dict:
    """Semantic ("vibe") search: meaning, not keywords — anywhere (§plan D).

    The query is embedded once; candidates come from BOTH sides and compete on
    plain cosine similarity:
      * the curated local index (pgvector ``<=>``), when the user is within
        metro range of it;
      * live Google results, embedded on the fly in one batched call (cached
        per place), so a user in Chicago gets Chicago vibes — same quality.

    ``filters`` applies the SAME FilterBar rules as classic search (category,
    price, rating, open-now, independent-only) — similarity decides the order,
    the filters decide what's eligible at all.

    Returns {"available": False} when the embedding service is unreachable
    (offline demo) — the UI shows a calm notice and offers classic search.
    """
    query_vector = await embeddings.embed_text(q)
    if query_vector is None:
        return {"available": False, "results": [], "total": 0}

    # Curated index (only meaningful near it — NYC results in Chicago are noise).
    local_results = []
    for row in biz_repo.vibe_search(embeddings.to_pgvector(query_vector), limit):
        canon = _local_to_canonical(row, lat, lng)
        # VIBE_LOCAL_RANGE_KM is a straight-line candidate radius; distance_km is
        # the driving estimate, so divide the factor back out to compare.
        if canon["distance_km"] is not None and (
            canon["distance_km"] / ranker.CIRCUITY_FACTOR
        ) > VIBE_LOCAL_RANGE_KM:
            continue
        canon["similarity"] = round(float(row["similarity"]), 3)
        local_results.append(canon)

    # Live layer — works in any city; dedupe against the curated names.
    google_results = await _vibe_google_candidates(q, query_vector, lat, lng)
    seen = {_normalize_name(b["name"]) for b in local_results}
    merged = local_results + [
        g for g in google_results if _normalize_name(g["name"]) not in seen
    ]

    # Filter BEFORE the top-N cut so the user gets up to `limit` results that
    # actually satisfy their filters, not 10 minus the rejects.
    if filters is not None:
        merged = [b for b in merged if _passes_filters(b, filters, filters.radius_m)]

    merged.sort(key=lambda b: b["similarity"], reverse=True)
    results = merged[:limit]
    return {"available": True, "results": results, "total": len(results)}


async def get_signals(ref: str) -> Optional[dict]:
    """The full classification provenance for one business (the glass box).

    Powers the frontend's "why this verdict?" popover: judges (and users) see
    the exact pipeline trail — owner record → chain registry → cached verdict
    → Gemini audit — instead of trusting a black box. Never drops anything:
    a chain gets an honest verdict here, because the user is already looking
    at it.
    """
    if ref.startswith("gp_"):
        detail = await places.get_details(ref[3:])
        if not detail:
            return None
        verdict = await classifier.classify_one(detail)
        return {
            "ref": ref,
            "name": detail["name"],
            "is_small": verdict["verdict"] == "small",
            **verdict,
        }

    if not ref.isdigit():
        return None
    row = biz_repo.get_local(int(ref))
    if not row:
        return None
    # LocalLens-listed rows never face the registry or the LLM: they are
    # accountable to a real owner account, which IS the evidence.
    provenance = classifier.verdict_for_local(row)
    return {
        "ref": ref,
        "name": row["name"],
        "verdict": "small",
        "is_small": True,
        "source": provenance["source"],
        "reason": provenance["reason"],
        "confidence": provenance["confidence"],
        "owner_declared_independent": row.get("is_independent"),
        "checks": [
            {"step": "owner_record", "outcome": "matched",
             "detail": "Listed on LocalLens by its owner — small by construction."},
            {"step": "chain_registry", "outcome": "skipped",
             "detail": "Owner-listed businesses don't face the registry."},
            {"step": "verdict_cache", "outcome": "skipped",
             "detail": "No audit needed."},
            {"step": "gemini", "outcome": "skipped",
             "detail": "No audit needed."},
        ],
    }


async def get_detail(ref: str, user_lat: Optional[float] = None, user_lng: Optional[float] = None) -> Optional[dict]:
    """Detail for one business by ref ('gp_<id>' for Google, else a local id)."""
    if ref.startswith("gp_"):
        detail = await places.get_details(ref[3:])
        if not detail:
            return None
        detail["distance_km"] = (
            round(ranker.driving_km(user_lat, user_lng, detail["lat"], detail["lng"]), 2)
            if user_lat is not None and detail.get("lat") is not None else None
        )
        detail["hours_text"] = detail.get("weekday_text") or []
        # If this Google business has been reviewed/visited before, a lightweight
        # local row exists carrying our community reviews — merge the two-tier
        # rating, and let OUR aggregate take over the headline once we have
        # reviews (so raw vs verified compare the same population).
        local = biz_repo.get_by_place_id(ref[3:])
        if local:
            detail.update(reviews_repo.rating_breakdown(local["id"]))
            detail["trust"] = review_trust.trust_weighted_rating(local["id"])
            if local.get("review_count"):
                detail["average_rating"] = float(local.get("average_rating") or 0.0)
                detail["review_count"] = int(local["review_count"])
            detail["geofence_radius_m"] = (
                local.get("geofence_radius_m") or settings.geofence_radius_default_m
            )
        else:
            detail["geofence_radius_m"] = settings.geofence_radius_default_m
        return detail

    if not ref.isdigit():
        return None
    row = biz_repo.get_local(int(ref))
    if not row:
        return None
    canon = _local_to_canonical(row, user_lat if user_lat is not None else row["lat"],
                                user_lng if user_lng is not None else row["lng"])
    canon["owner_id"] = row.get("owner_id")
    canon["hours_text"] = _format_hours(row.get("hours"))
    # The geofence radius drives the check-in map ring on the detail page.
    canon["geofence_radius_m"] = row.get("geofence_radius_m")
    # Two-tier rating (raw vs verified-only) for the detail page's trust toggle.
    # Only computed here (one business), never in the per-result search path.
    canon.update(reviews_repo.rating_breakdown(int(ref)))
    canon["trust"] = review_trust.trust_weighted_rating(int(ref))
    return canon
