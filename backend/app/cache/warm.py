"""Demo-cache warmer (§13).

Pre-fetches and stores the Google Places / Geocoding responses for the
REHEARSED demo queries, so on stage every scripted search is served instantly
from the on-disk cache — and still works if the venue Wi-Fi dies mid-demo
(stale cache entries are served as the fallback).

Warming runs each demo query through the FULL search pipeline, so every cache
layer the pipeline depends on gets pre-paid: the Places text/nearby responses,
the chain registry's learned names, the per-place Gemini verdicts, and the
vibe embeddings (``gemb:<place_id>``). On stage — online or offline — the
rehearsed flow is then served entirely from caches.

Run before rehearsal / the competition, from ``backend/``:

    python -m app.cache.warm

Re-run any time; entries are simply refreshed.
"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.models.business import SearchParams
from app.services import places, search_service, trip_planner

# The queries the 7-minute demo script actually uses. Add/remove freely —
# warming is idempotent and cheap (one Places call each).
DEMO_QUERIES = [
    "coffee", "ramen", "tacos", "pizza", "bagels", "bookstore",
    "bakery", "cheap lunch", "starbucks", "independent coffee",
]

# Queries that NAME a chain — the demo searches one to show it can't appear.
# An empty result for these is success, not a quota problem.
CHAIN_DEMO_QUERIES = {"starbucks"}

# Extra cities to pre-warm beyond the NYC demo center, so a search anywhere we
# might demo serves instantly from cache (the paginated Google pages AND the
# Gemini verdicts cache for 30 days). Add coordinates for any city you'll show.
EXTRA_DEMO_CITIES = [
    ("San Antonio, TX", 29.4252, -98.4946),
]

DEMO_ADDRESSES = [
    "119 MacDougal St, New York, NY",
    "200 Bleecker St, New York, NY",
    "828 Broadway, New York, NY",
]

# Rehearsed vibe (semantic) searches — each warms its Google text results plus
# a per-place embedding cache entry, so the on-stage call is one query embed.
DEMO_VIBES = [
    "old new york atmosphere",
    "cozy rainy day reading spot",
]

# Category-chip browses (clicked with no typed query). Warming each pre-pays its
# paginated text pages + Gemini verdicts so on-stage chip clicks are instant and
# offline-safe. Spans chain-light (Bookstore) and chain-heavy (Pharmacy) cases.
DEMO_CATEGORIES = ["Bookstore", "Pharmacy", "Barber", "Cafe", "Dessert", "Grocery"]


async def warm() -> None:
    lat, lng = settings.demo_lat, settings.demo_lng
    print(f"Warming demo cache around {settings.demo_city} ({lat}, {lng}) …")

    ok = 0
    for q in DEMO_QUERIES:
        # The FULL pipeline (Places → registry → Gemini verdicts → ranking),
        # so the demo's first search is as fast as its tenth. Chain-name
        # queries ("starbucks") SHOULD come back empty — that's the product,
        # and the rehearsed demo moment.
        res = await search_service.search(SearchParams(q=q, lat=lat, lng=lng))
        is_chain_query = q in CHAIN_DEMO_QUERIES
        status = (
            f"{res.total} small businesses" if res.total
            else ("0 — chains filtered (expected)" if is_chain_query
                  else "EMPTY (check key/quota)")
        )
        print(f"  search “{q}” → {status}")
        ok += bool(res.total) or is_chain_query
        # Also warm the detail for the top hit — the demo clicks into results.
        top = res.results[0] if res.results else None
        if top and top.ref.startswith("gp_"):
            await places.get_details(top.ref[3:])

    for addr in DEMO_ADDRESSES:
        geo = await places.geocode(addr)
        print(f"  geocode “{addr}” → {'OK' if geo else 'FAILED'}")
        ok += bool(geo)

    for q in DEMO_VIBES:
        vibe = await search_service.vibe_search(q, lat, lng)
        if vibe.get("available"):
            print(f"  vibe “{q}” → {len(vibe['results'])} results (embeddings cached)")
            ok += 1
        else:
            print(f"  vibe “{q}” → UNAVAILABLE (LLM offline — UI shows the notice)")

    # One plan warms the shared independent-only candidate sweep; the window and
    # interests only change which cached candidates get picked, not the fetch.
    plan = await trip_planner.plan(
        lat=lat, lng=lng, interests=[],
        start_time="10:00", end_time="16:00", num_stops=4,
    )
    top = plan["options"][0]
    print(f"  trip plan → {len(plan['options'])} options, "
          f"{len(top['stops'])} stops ({top['mode']} narration)")
    ok += bool(top["stops"])

    cat_total = 0
    for chip in DEMO_CATEGORIES:
        cat_total += 1
        res = await search_service.search(SearchParams(lat=lat, lng=lng, categories=[chip]))
        print(f"  browse “{chip}” → {res.total} small businesses")
        ok += bool(res.total)

    # Extra cities: warm the search queries AND the category browses (their
    # paginated pages + Gemini verdicts), so a live demo elsewhere is instant.
    extra_total = 0
    for city, clat, clng in EXTRA_DEMO_CITIES:
        print(f"Warming {city} ({clat}, {clng}) …")
        for q in DEMO_QUERIES:
            if q in CHAIN_DEMO_QUERIES:
                continue
            extra_total += 1
            res = await search_service.search(SearchParams(q=q, lat=clat, lng=clng))
            print(f"  search “{q}” → {res.total} small businesses")
            ok += bool(res.total)
        for chip in DEMO_CATEGORIES:
            extra_total += 1
            res = await search_service.search(SearchParams(lat=clat, lng=clng, categories=[chip]))
            print(f"  browse “{chip}” → {res.total} small businesses")
            ok += bool(res.total)

    total = (len(DEMO_QUERIES) + len(DEMO_ADDRESSES) + len(DEMO_VIBES) + 1
             + cat_total + extra_total)
    print(f"Done: {ok}/{total} warmed. The cache also serves as the offline fallback.")


if __name__ == "__main__":
    asyncio.run(warm())
