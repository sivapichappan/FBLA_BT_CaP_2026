# LocalLens — Architecture

## System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser — React 18 + TypeScript SPA (Vite, Tailwind, motion/react)  │
│  routes/ (pages) · components/ · lib/api.ts (one typed client)       │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ JSON over HTTPS · JWT bearer auth
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FastAPI backend (ASGI, async)                                       │
│                                                                      │
│  routers/      thin HTTP: parse/validate (Pydantic) → call service   │
│  services/     ALL business logic:                                   │
│                 search_service · classifier · chain_registry         │
│                 ranker · embeddings · trip_planner · recommendations │
│                 concierge · llm · places (+cache) · analytics        │
│                 reviews_service · deals_service · auth_service       │
│                 intent · brands                                      │
│  repositories/ ALL SQL (parameterized psycopg3, pooled)              │
│  middleware/   JWT security · slowapi rate limits                    │
└──────┬──────────────────┬──────────────────────┬─────────────────────┘
       ▼                  ▼                      ▼
┌─────────────┐   ┌───────────────────┐   ┌──────────────────────────┐
│ PostgreSQL  │   │ Google Places /   │   │ LLM (Gemini, OpenAI-     │
│ (Supabase)  │   │ Geocoding (New)   │   │ compatible endpoint):    │
│ + pgvector  │   │                   │   │ chat + 768-d embeddings  │
└─────────────┘   └───────┬───────────┘   └───────────┬──────────────┘
                          ▼                           ▼
                  on-disk JSON cache          deterministic fallback
                  (warm.py pre-fetches        (keyword intent +
                   the rehearsed demo,         templated replies +
                   incl. place embeddings)     vibe/summary hidden)
```

**Layering rule (enforced):** routers never contain logic or SQL; services never touch HTTP
objects or SQL; repositories own every query. This keeps each concern testable in isolation and
makes the codebase navigable in seconds.

## Request flow: a classic search (hybrid, chain-free by construction)

1. `GET /businesses/search?q=coffee` hits `routers/businesses.py`, which validates params into a
   `SearchParams` model. (There is no "independent only" parameter — hiding chains IS the product.)
2. `services/search_service.search()`:
   - loads the **local backbone** (owner-added businesses from Postgres, with categories/hours)
     and filters it against the query **two ways**: a keyword pass over names + categories, plus
     one **gated semantic pass** for multi-word queries (cosine ≥ 0.50 against the stored
     embeddings — "fresh pasta" finds Raffetto's even though no field says "pasta"). These rows
     are accountable to a real owner account, so they skip the classifier — small by construction;
   - pulls Google UNFILTERED (`search_text` with a query, a *nearby* sweep over customer-facing
     types when browsing), de-duplicates branches, and runs everything through
     **`services/classifier.annotate()`** — the three-gate small-business filter:
     **chain registry** (free, instant) → **per-place verdict cache** (30-day TTL) → **one
     batched Gemini audit** for the remaining unknowns, whose high-confidence chain verdicts are
     learned back into the registry;
   - enforces the **minimum-results ladder**: if fewer than 10 small businesses survive, the
     circle widens (requested radius → 20 km → 50 km, Google's cap), re-pulling and classifying
     only NEW names each rung; the widened radius applies to the local layer too;
   - sorts via `services/ranker` (empirical-Bayes rating smoothing + Gaussian distance decay +
     independence weighting).
3. The router returns the canonical `BusinessOut` list — one shape regardless of source — plus
   `radius_used_km` / `radius_expanded` so the UI can say "Widened the search to 20 km…".

## Request flow: a vibe (semantic) search

1. `GET /businesses/vibe?q=old new york atmosphere` → `search_service.vibe_search()`.
2. The query embeds **once** (`services/embeddings`, `gemini-embedding-001`, 768 dims).
3. Two candidate pools are ranked by cosine similarity and merged:
   - **curated locals** — a pgvector index scan (`embedding <=> query`) over the seeded/owner
     businesses, kept only within 40 km of the user;
   - **live Google results** — text-search hits, branch-deduplicated, passed through the SAME
     classifier pipeline as classic search (chains never spend an embedding call), then embedded
     **on the fly in one batched call** and cached per place (`gemb:<place_id>`).
   This is why vibe search works in any city, not just the demo one.
4. Offline / LLM failure → `{"available": false}` and the UI shows a calm notice — semantic search
   degrades visibly but gracefully (there is no honest deterministic substitute for it).

## Request flow: a concierge turn

1. `POST /ai/chat` (auth required) → `services/concierge.chat()`.
2. **Intent**: `services/llm.classify_intent()` (Gemini, JSON mode). On *any* failure →
   `services/intent.classify()` (keyword rules). Identical output schema.
3. **Fetch + rank** (always deterministic): search candidates, then
   `ranker.rank_businesses(candidates, intent)` — 8 factors, re-weighted per intent
   (OPEN_NOW ×5 open-status, SUPPORT_LOCAL ×4 independence …). The LLM never picks businesses.
4. **Reply**: `llm.generate_reply()` writes prose grounded ONLY in the ranked rows; on failure the
   templated reply renders from the same rows. Response carries `mode: "llm" | "deterministic"`.
5. Both turns persist to `chat_sessions` / `chat_messages` (last-10 window is the context).

## Request flow: a trip plan

1. `POST /trips/plan {duration, interests, start_time}` → `services/trip_planner.plan()`.
2. The candidate pool is one call to `search_service.search()` — the pipeline hides chains from
   every search, so the itinerary is all-independent **by construction**, not by post-filtering.
3. A slot template maps the duration to a day shape (half-day = coffee → browse → eat → dessert);
   each slot greedily picks the best unused candidate by
   `0.55·proximity + 0.35·bayes-rating + 0.10·interest-match`, walking legs are haversine distance
   at 12 min/km, and arrival times accumulate dwell + walk.
4. `llm.generate_trip_narrative()` narrates the chosen stops (template fallback offline; the
   response carries `mode`). Signed-in users save the plan as a JSONB snapshot (`trips`), so a
   saved trip still renders if a stop's source data changes.

## The fallback path (never crash on stage)

Every external dependency has a layered fallback:

| Dependency | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Business discovery | Google Places live | on-disk cache (incl. stale) | seeded local businesses |
| Chain filtering | registry + batched Gemini audit | registry alone (509 brands + learned names); unknowns SHOWN, badged "likely local" | — |
| Concierge intent | Gemini classifier | keyword classifier | — |
| Concierge prose / trip narration | Gemini reply | template from ranked rows | — |
| Vibe search | Gemini embeddings + pgvector | "unavailable offline" notice (no fake results) | — |
| Review summaries | Gemini digest (cached by review count) | block hidden (never hallucinated) | — |
| Business photos | Google photo via backend proxy | cached media | editorial monogram tile |
| Geocoding | Google Geocoding | cached entry | manual lat/lng entry in the form |
| The whole online path | `ONLINE=true` | `ONLINE=false` env switch forces every fallback at once | — |

`python -m app.cache.warm` pre-fetches the rehearsed demo flow — searches, geocodes, the vibe
queries (including each result's embedding), and a trip plan — so the scripted demo is instant and
identical with the network off. A global exception handler converts anything uncaught into a clean
JSON 500 (full traceback logged server-side only); the frontend adds request timeouts, route-level
error boundaries, and friendly empty states.

## Where the “smart” lives

- **`services/classifier.py` + `services/chain_registry.py`** — the small-business filter:
  a persistent chain registry (curated brands matched fuzzily + AI-learned names matched
  exact-only, so one learned storefront can never blanket-hide look-alikes) → a per-place verdict
  cache → one batched Gemini audit with an explicit *uncertain → show it* rule. The registry
  layer's recall (0.849, zero false positives) is measured by `tests/test_classifier.py` over
  156 hand-labeled businesses; the Gemini layer is pinned by canned-response tests.
- **`services/ranker.py`** — empirical-Bayes rating smoothing `(n·avg + m·C)/(n+m)` (C=3.7, m=15),
  Gaussian distance decay `exp(−d²/2σ²)` (σ=2 km), and per-intent weight re-shaping.
- **`services/embeddings.py`** — batched 768-dim embeddings (one API call per batch), cosine
  similarity, and the pgvector literal format; powers vibe search and the semantic half of
  classic search.
- **`services/trip_planner.py`** — slot templates + greedy nearest-good-neighbor selection; an
  explainable planning heuristic rather than an opaque optimizer.
- **`services/recommendations.py`** — content-based "For you" scoring
  (0.5·category-overlap + 0.3·bayes-rating + 0.2·price-fit) with a human-readable reason per pick.
- **`services/photo_focus.py`** — smart photo cropping: a one-time edge-energy analysis per photo
  (grayscale → FIND_EDGES → grid energy → weighted centroid) stores each image's focal point,
  which the UI applies as `object-position` so the subject stays in frame at any crop.
- **`services/concierge.py`** — the three-stage pipeline above; grounded by construction.

## Frontend state worth knowing

- **Design tokens** (`styles/tokens.css`) are the single styling source of truth; Tailwind reads
  them as CSS variables. Dark mode is a second token set under `[data-theme="dark"]`
  (`lib/theme.ts` flips the attribute; an inline script in `index.html` sets it pre-paint).
- **Location** (`lib/location.ts`) has clear precedence — manual pick > device > NYC demo — and
  broadcasts changes through one window event every page subscribes to.
- **Search filters** serialize to the URL, so any filtered view is shareable and reload-safe.
