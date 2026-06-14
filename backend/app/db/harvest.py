"""Chain harvester: sweep ~1000 location×query searches to grow the registry.

Runs the REAL classifier pipeline (registry → verdict cache → batched Gemini →
registry writeback) over chain-prone queries in dozens of US metros, so the
chain_registry accumulates regional and off-list chains BEFORE anyone searches
there. The Places sweeps are exactly what a user search pulls — this is 1000
internal location tests, not a separate code path.

Rate-limit design (free-tier Gemini keys are ~10 requests/minute):
* all of a CITY's unknowns are audited together — one or two big batches per
  city instead of one per query (≈150 LLM calls total, not ≈1000);
* batches run through a paced wrapper that enforces a minimum interval and
  retries 429s with growing backoff, so learning is never silently dropped;
* the harvester uses ``gemini-2.5-flash-lite`` — a separate (larger) quota
  bucket from the live app's classify model.

The harvest is naturally self-pruning: as the registry grows, later cities'
results die at the registry gate for free, so batches shrink as it runs.
Re-running is cheap and idempotent (Places + verdict caches absorb repeats).

Run from ``backend/`` (takes ~30-45 min; prints progress as it goes):

    python -m app.db.harvest
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from app.repositories import chains as chains_repo
from app.services import classifier, llm, places
from app.services.search_service import _normalize_name

HARVEST_MODEL = "gemini-2.5-flash-lite"
MIN_LLM_INTERVAL_S = 7.0   # ≈8.5 requests/minute — safely under a 10 RPM cap
MAX_BATCH = 35             # unknowns per Gemini call (reliable JSON at this size)
LLM_TIMEOUT_S = 75.0       # big batches generate for longer than the live 9s
RETRY_BACKOFFS_S = (30, 75)

# ~70 US metro centers — coarse downtown coordinates are plenty for a sweep.
CITIES: list[tuple[str, float, float]] = [
    ("New York NY", 40.7308, -73.9973), ("Los Angeles CA", 34.0522, -118.2437),
    ("Chicago IL", 41.8781, -87.6298), ("Houston TX", 29.7604, -95.3698),
    ("Phoenix AZ", 33.4484, -112.0740), ("Philadelphia PA", 39.9526, -75.1652),
    ("San Antonio TX", 29.4241, -98.4936), ("San Diego CA", 32.7157, -117.1611),
    ("Dallas TX", 32.7767, -96.7970), ("Austin TX", 30.2672, -97.7431),
    ("Jacksonville FL", 30.3322, -81.6557), ("San Jose CA", 37.3382, -121.8863),
    ("Fort Worth TX", 32.7555, -97.3308), ("Columbus OH", 39.9612, -82.9988),
    ("Charlotte NC", 35.2271, -80.8431), ("Indianapolis IN", 39.7684, -86.1581),
    ("San Francisco CA", 37.7749, -122.4194), ("Seattle WA", 47.6062, -122.3321),
    ("Denver CO", 39.7392, -104.9903), ("Washington DC", 38.9072, -77.0369),
    ("Nashville TN", 36.1627, -86.7816), ("Oklahoma City OK", 35.4676, -97.5164),
    ("El Paso TX", 31.7619, -106.4850), ("Boston MA", 42.3601, -71.0589),
    ("Portland OR", 45.5152, -122.6784), ("Las Vegas NV", 36.1699, -115.1398),
    ("Memphis TN", 35.1495, -90.0490), ("Detroit MI", 42.3314, -83.0458),
    ("Baltimore MD", 39.2904, -76.6122), ("Milwaukee WI", 43.0389, -87.9065),
    ("Albuquerque NM", 35.0844, -106.6504), ("Tucson AZ", 32.2226, -110.9747),
    ("Fresno CA", 36.7378, -119.7871), ("Sacramento CA", 38.5816, -121.4944),
    ("Kansas City MO", 39.0997, -94.5786), ("Mesa AZ", 33.4152, -111.8315),
    ("Atlanta GA", 33.7490, -84.3880), ("Omaha NE", 41.2565, -95.9345),
    ("Colorado Springs CO", 38.8339, -104.8214), ("Raleigh NC", 35.7796, -78.6382),
    ("Miami FL", 25.7617, -80.1918), ("Virginia Beach VA", 36.8529, -75.9780),
    ("Oakland CA", 37.8044, -122.2712), ("Minneapolis MN", 44.9778, -93.2650),
    ("Tulsa OK", 36.1540, -95.9928), ("Tampa FL", 27.9506, -82.4572),
    ("Arlington TX", 32.7357, -97.1081), ("New Orleans LA", 29.9511, -90.0715),
    ("Wichita KS", 37.6872, -97.3301), ("Cleveland OH", 41.4993, -81.6944),
    ("Bakersfield CA", 35.3733, -119.0187), ("Aurora CO", 39.7294, -104.8319),
    ("Anaheim CA", 33.8366, -117.9143), ("Honolulu HI", 21.3069, -157.8583),
    ("Santa Ana CA", 33.7455, -117.8677), ("Riverside CA", 33.9533, -117.3962),
    ("Corpus Christi TX", 27.8006, -97.3964), ("Lexington KY", 38.0406, -84.5037),
    ("Stockton CA", 37.9577, -121.2908), ("Henderson NV", 36.0395, -114.9817),
    ("Saint Paul MN", 44.9537, -93.0900), ("St. Louis MO", 38.6270, -90.1994),
    ("Cincinnati OH", 39.1031, -84.5120), ("Pittsburgh PA", 40.4406, -79.9959),
    ("Greensboro NC", 36.0726, -79.7920), ("Anchorage AK", 61.2181, -149.9003),
    ("Plano TX", 33.0198, -96.6989), ("Lincoln NE", 40.8136, -96.7026),
    ("Orlando FL", 28.5383, -81.3792), ("Irvine CA", 33.6846, -117.8265),
    ("Newark NJ", 40.7357, -74.1724), ("Buffalo NY", 42.8864, -78.8784),
]

# Chain-prone query mix: 14 queries × ~72 cities ≈ 1000 location tests.
QUERIES: list[str] = [
    "coffee", "fast food", "pizza", "burgers", "pharmacy", "grocery store",
    "bank", "restaurant", "bakery", "ice cream", "sandwiches", "tacos",
    "donuts", "fried chicken",
]

_last_llm_call = 0.0


async def _paced_classify(rows: list[dict]) -> Optional[dict[str, dict]]:
    """classify_chains with pacing + 429 retries; injected into annotate()."""
    global _last_llm_call
    for backoff in (0, *RETRY_BACKOFFS_S):
        if backoff:
            print(f"      LLM failed — retrying in {backoff}s …", flush=True)
            await asyncio.sleep(backoff)
        wait = MIN_LLM_INTERVAL_S - (time.monotonic() - _last_llm_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_llm_call = time.monotonic()
        verdicts = await llm.classify_chains(
            rows, model=HARVEST_MODEL, timeout=LLM_TIMEOUT_S
        )
        if verdicts is not None:
            return verdicts
    return None  # quota truly exhausted — unknowns pass, nothing mislearned


def _llm_chain_count() -> int:
    return sum(1 for r in chains_repo.list_all() if r["source"] == "llm")


async def harvest() -> None:
    start_count = _llm_chain_count()
    sweeps = len(CITIES) * len(QUERIES)
    print(f"Harvesting {sweeps} location tests "
          f"({len(CITIES)} cities × {len(QUERIES)} queries); "
          f"registry starts with {start_count} learned chains …", flush=True)

    seen_names: set[str] = set()  # global: audit each storefront name once
    sweeps_done = 0
    for city_i, (city, lat, lng) in enumerate(CITIES, 1):
        # 1) Pull the whole city's results first (Places only — fast & cheap).
        fresh: list[dict] = []
        for q in QUERIES:
            sweeps_done += 1
            try:
                raw, _ = await places.search_text(q, lat, lng, 10_000)
            except Exception as exc:  # one bad sweep must not stop the run
                print(f"  ! {city} / “{q}”: {exc}", flush=True)
                continue
            for g in raw:
                key = _normalize_name(g["name"])
                if g.get("lat") is None or key in seen_names:
                    continue
                seen_names.add(key)
                fresh.append(g)
            await asyncio.sleep(0.15)  # gentle on the Places API

        # 2) Audit the city's unknowns in big paced batches. annotate() drops
        #    registry hits for free, so the LLM only sees true unknowns.
        unverified = 0
        for i in range(0, len(fresh), MAX_BATCH):
            chunk = fresh[i:i + MAX_BATCH]
            try:
                survivors = await classifier.annotate(chunk, llm_fn=_paced_classify)
                unverified += sum(
                    1 for b in survivors
                    if b.get("verdict_source") == "unverified-offline"
                )
            except Exception as exc:
                print(f"  ! {city} audit chunk: {exc}", flush=True)

        learned = _llm_chain_count()
        note = f" ({unverified} unaudited — quota)" if unverified else ""
        print(f"  [{city_i}/{len(CITIES)}] {city}: {len(fresh)} new names{note}; "
              f"registry now {learned} learned chains", flush=True)

    final = _llm_chain_count()
    print(f"\nDone: {sweeps_done} location tests; learned chains "
          f"{start_count} → {final} (+{final - start_count}).", flush=True)


if __name__ == "__main__":
    asyncio.run(harvest())
