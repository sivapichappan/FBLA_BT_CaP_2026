# CONTEXT STORE — LocalLens v2 (full session state)

> Working memory for AI-assisted development of this repo. Rewritten 2026-06-13.
> Purpose: enough fidelity that a fresh session (or post-compaction context) can
> continue EXACTLY where this one left off — decisions, tunables, gotchas, and
> verification recipes included. Sections 1–8 + 10–11 describe the system as it
> works NOW; §9 is a dated changelog. Contains **no secret values** (those live
> only in gitignored `.env`); demo passwords below are seeded demo data.

---

## 1. What this project is

**LocalLens v2** — a two-sided local-business discovery web platform for the
**FBLA Coding & Programming 2025–26** high-school event, topic **"Byte-Sized
Business Boost"** (a tool to discover/support small local businesses). Judged
LIVE (3-min setup / 7-min presentation / 3-min Q&A) on a **110-point sheet**;
**no prejudged-URL component**, but source/docs must be presentable and the app
**must run standalone with zero programming errors** on unreliable conference
Wi-Fi (battery only in prelims, ≤3 devices, judges never click links/scan QR).

Rubric "Exceeds" targets: language selection in industry terms; comments/naming;
modular+advanced code; UX **with accessibility**; intuitive nav **with an
intelligent feature**; validation **syntactic AND semantic**; ALL six topic
bullets (category sort, reviews/ratings, sort-by-rating, favorites,
deals/coupons, **bot-prevention**); **customizable report**; data storage;
delivery + Q&A; all-or-nothing protocols (10 pts).

**Signature differentiator:** the platform shows **ONLY small, independent
businesses — everywhere, every search** (no toggle; chains are structurally
excluded). Three-gate pipeline: **chain registry (2,383 names, free/instant) →
per-place verdict cache (30-day) → ONE batched Gemini audit (uncertain→show) →
high-confidence chains learned back into the registry.** A glass-box "why this
verdict?" panel shows which gate decided + the reason. Every "smart" surface
(concierge, summaries, vibe, planner) degrades gracefully offline; the chain
filter degrades to registry-only with unknowns SHOWN as "likely local".

Strategy/rubric analysis: `FBLA_FEATURES_AND_STRATEGY.md` (7-min demo skeleton +
scorecard). Original brief: `BUILD_SPEC.md`. Diagram-deck brief for browser
Claude: `DIAGRAM_PROMPTS.md`. The v1 app (vanilla JS) is preserved in `legacy/`,
superseded.

## 2. Repo / environment / how to run

- **Repo root:** `/Users/sivapichappan/FBLA2526` (git; branch `master`; remote
  `https://github.com/sivapichappan/FBLA_BT_CaP_2026.git`, public). **NOTHING
  from v2 committed** — user controls commits, intends to rotate credentials
  first. Local git identity misconfigured (`your-personal-email@example.com`).
- **Stack:** Python 3.12 / FastAPI / psycopg3 / Supabase Postgres (+pgvector);
  React 18 + TypeScript + Vite 5 + Tailwind 3.4 + motion/react.
- **Run:** `./run.sh` OR backend `cd backend && ./.venv/bin/uvicorn app.main:app
  --host 127.0.0.1 --port 8000`; frontend `cd frontend && npm run dev` (5173,
  start FROM `frontend/`). Build: `npm run build` (tsc -b first).
- **Env (gitignored; .env.example committed):** `backend/.env` → DATABASE_URL
  (Supabase tx-pooler, ref `iwwwgmmffczjlkkjsxgn`, aws-1-us-east-1, port 6543),
  JWT_SECRET, GOOGLE_MAPS_API_KEY (Maps JS + Places New + Geocoding),
  LLM_API_KEY (**Google AI Studio/Gemini**, `AQ.…`), LLM_BASE_URL=
  `https://generativelanguage.googleapis.com/v1beta/openai/`,
  LLM_INTENT_MODEL=`gemini-2.5-flash-lite`, LLM_REPLY_MODEL=`gemini-2.5-flash`,
  LLM_CLASSIFY_MODEL=`gemini-2.5-flash`, LLM_EMBED_MODEL=`gemini-embedding-001`,
  ONLINE=true, CORS_ORIGINS, DEMO_CITY/LAT/LNG (NYC 40.7308,-73.9973).
  `frontend/.env` → VITE_API_BASE_URL, VITE_GOOGLE_MAPS_API_KEY.
- **⚠ Gemini quota:** the key is free-tier = **20 requests/day PER MODEL**
  (probed: flash 20, flash-lite 20, 2.0 models 0). Shared by classifier,
  concierge, vibe, summaries, trip planner. A real-quota/billed key is the #1
  pre-competition task. Mitigated by the registry (most chains free), 30-day
  verdict cache, and `cache/warm.py` (warmed demo cities = 0 live calls).
- **Cloud — LIVE (v2 deployed 2026-06-13):** Vercel project `fbla-2026`
  (id `prj_heJW0pbxynK5qegZCH7unSQIFCLa`, team `team_JKtO6sXyzqRra9kL5ECS5jYi`,
  account `sivapichappan-5633`) → **https://fbla-2026-tan.vercel.app** (public,
  prod). All-on-Vercel serverless: Vite SPA static + FastAPI as ONE Python
  function. See **§Deployment** below. Env vars set on Vercel (prod+preview) via
  `vercel env add` — NOT committed. Session Supabase MCP is a different org
  (Wondrlink), can't manage this DB; all DB ops via psycopg.
- **macOS:** port 5000 = AirPlay → backend uses 8000. pip + live-API tests need
  `dangerouslyDisableSandbox` (DNS blocked in sandbox).

## 3. Accounts, demo data, cashier codes (seeded; safe to print)

| Account | Email / password | Role / notes |
|---|---|---|
| demo_user | demo@locallens.app / demodemo | consumer; trust ~51 (lvl 2); 4 reviews; favorites Reggio/Strand/Abraço; saved trip "Village Saturday" |
| demo_owner | owner@locallens.app / ownerowner | owns ids 1–5: Caffè Reggio, Joe's Pizza, Buvette, Murray's Cheese, McNally Jackson |
| admin | admin@locallens.app / adminadmin | full admin (edit any biz, reply anywhere, verify any code) |
| 12 personas | maya_r…ravi_p @example.com / demodemo | populate reviews/favorites |

Cashier codes (deal_redemptions): valid-unverified → `CAFE5E6F`, `SLICE9AB`,
`SLICE2EF`, `PAIR7A8B`, `NIGHT3AB`, `BRUN4CDE`, `CHEZ5FAB`, `BOOK6CDE`,
`STRD7FAB` (Strand — NOT demo_owner's → reads not_found for them: privacy demo);
already-used → `CAFE3C4D`, `SLICE1CD`, `CAFE1A2B`.

Seed: **46 NYC businesses** (Village/SoHo/LES/EV; ids 1–5 owner-run), 16
categories, 101 reviews (backdated ≤28d), 11 deals (1 expired), 12 redemptions,
39 favorites, ~1,045 business_views, hours for all 46. Aggregates + trust
recomputed at seed end. **chain_registry: 2,383 names** (2,233 fuzzy seed +
150 exact-only) — survives `--reseed`.

## §Deployment (Vercel, all-on-serverless) — LIVE

Prod: **https://fbla-2026-tan.vercel.app** (public). CLI `vercel` is logged in
as `sivapichappan-5633`; repo linked via `.vercel/` (gitignored). Deploy with
`vercel` (preview, SSO-protected — test via `vercel curl <path> --deployment
<url>`) then `vercel --prod` (promotes + aliases fbla-2026-tan).

Files (repo root unless noted):
- `vercel.json` — `framework: vite`; `buildCommand: cd frontend && npm install &&
  npm run build`; `outputDirectory: frontend/dist`; function `api/index.py`
  (maxDuration 300, `includeFiles: backend/app/**`); rewrites `/api/(.*)→/api/index`
  then SPA `/(.*)→/index.html`.
- `api/index.py` — ASGI entry: `sys.path`-inserts `backend/`, `from app.main
  import app as backend_app`, parent `FastAPI()` **mounts backend at `/api`** (so
  the `/api` URL prefix is consumed; routers keep their native paths; no Mangum).
- `requirements.txt` (root) — prod dep subset Vercel installs. **Three deps
  bumped ONLY for Python-3.14 wheels** (Vercel's uv builder forces 3.14 and
  ignores `.python-version`/`pyproject requires-python`): `psycopg 3.2.13`,
  `pydantic 2.13.4`, `bcrypt 5.0.0` (Pillow 12.2.0 already had a cp314 wheel).
  Same bumps mirrored in `backend/requirements.txt` + local venv (48 tests green).
- `.vercelignore` — excludes `.env*`, node_modules, .venv, tests, legacy, .git;
  **ships `backend/app/cache`** (48MB warm data → demo searches instant + spare
  the Gemini quota; read-only writes no-op).
- `frontend/.env.production` — `VITE_API_BASE_URL=/api` (same-origin → no CORS).
- `backend/app/db/connection.py` — pool `min_size=0, max_size=4` (serverless).

Env on Vercel (prod+preview, set via `vercel env add`, NOT committed): the §2
backend vars + `VITE_GOOGLE_MAPS_API_KEY`. The legacy project also carries unused
Flask/mail/Turnstile vars — harmless (`extra="ignore"`). Smoke test (public prod):
`/`→200, `/api/health`→ok, `/api/businesses/search?lat=40.7308&lng=-73.9973&q=coffee`
→ ~19 gemini-classified independents. Caveat: ONLINE=true → live Google+Gemini
each search (20/day Gemini quota); warmed-cache hits + 30-day verdicts mitigate.

## 4. Backend map (every module, one line)

- `app/main.py` — app factory; CORS; slowapi handler; global exception handler
  (clean 500, logs traceback); lifespan closes pool; routers: auth, businesses,
  reviews, favorites, deals, ai, analytics, recommendations, trips. `/health` no DB.
- `app/config.py` — pydantic-settings `settings`; ONLINE master offline switch;
  tolerant defaults; LLM_* model names incl. `llm_classify_model`.
- `db/connection.py` — psycopg3 ThreadedPool (0–4, dict_row, prepare_threshold
  =None for the Supabase pooler, connect_timeout=10, **check=check_connection +
  max_idle=240** ← stale-conn fix); `transaction()`, `query()`.
- `db/schema.sql` — idempotent DDL; `CREATE EXTENSION vector`; chain_registry
  table; photo_focus_x/y (additive ALTER too); CHECKs double as semantic validation.
- `db/seed.sql` — see §3; references by name/username sub-selects.
- `db/migrate.py` — schema; seeds if empty; `--reseed` truncates seed tables;
  `--fresh` drops all public tables; **idempotently seeds 509 brands → chain_registry**.
- `db/enrich.py` — pass1 photos (Places text-search, accent-fold name guard,
  40/46, 6 monogram placeholders); pass2 embeddings (46/46); pass3 photo focal
  points (Pillow, `_download_photo` resolves proxy via fetch_photo_uri, 41/41).
- `db/harvest.py` — ~1008 location tests (72 metros × 14 chain-prone queries)
  to pre-grow the registry; city-level batching (~150 LLM calls), paced (7s),
  429 retries, flash-lite bucket, 75s timeout. Resumable/idempotent. **Stalled
  at city 2 on the 20/day quota** — re-run after billing or drip across days.
- `db/import_chains.py` — bulk-import a curated chain markdown (`- Name` bullets
  under `## headers`) into the registry, NO API use; normalizes+dedupes,
  source='seed' (fuzzy), prints single-word names for an ambiguity eyeball pass.
- `cache/warm.py` — warms the demo flow: DEMO_QUERIES + DEMO_CATEGORIES (6 chip
  browses) + geocodes + 2 vibe (gemb: embeds) + 1 trip plan, for NYC +
  EXTRA_DEMO_CITIES=[San Antonio]. Chain-name queries (starbucks) print
  "0 — chains filtered (expected)". Last run 37/37.
- `middleware/security.py` — bcrypt(12), JWT HS256 7-day, current_user/optional_user.
- `middleware/rate_limit.py` — slowapi by IP: AUTH 20/15min (looser than the
  5-attempt lockout so the lockout is demoable), SEARCH 30/min, GENERAL 100/15min.
- `repositories/` (ALL SQL): users, businesses (canonical SELECT incl.
  photo_focus_x/y; create one-txn; log_view; set_photo/set_embedding/
  set_photo_focus; embedding_doc_rows; vibe_search via `<=>`), reviews
  (CRUD + `_recompute` + trust ±10 + reply upsert/delete + list_for_user),
  favorites (`(xmax=0)` +2-once), deals (race-proof `SELECT…FOR UPDATE` redeem,
  proven 8 threads vs cap 3 → 3), chat, trips (JSONB snapshots), **chains
  (list_all, add_chains[llm], add_chains_seed[seed], shared `_insert`)**.
- `services/`: **brands** (509-brand seed set + `match_against(name, set, fuzzy=)`
  + AMBIGUOUS_BRANDS guard), **chain_registry** (§6), **classifier** (§6),
  ranker (§6), intent (keyword 8-intent), **llm** (OpenAI-compat httpx; default
  9s timeout + `timeout` override; **reasoning_effort:"none" only to googleapis**;
  classify_intent, generate_reply, summarize_reviews, generate_trip_narrative,
  **classify_chains** + `_CLASSIFY_PROMPT`), embeddings (batched 768-dim),
  **places** (§5; Places New; search_text PAGINATED, search_nearby DISTANCE-
  ranked; `_TYPE_TO_CHIPS`/`_chip_categories`/`_CHIP_TO_QUERY`/`chip_query`;
  ONLINE=false reads stale cache), places_cache (sha1 JSON files),
  **search_service** (§5), concierge (LLM intent → deterministic rank → LLM
  reply, template fallback, `mode`), analytics (7 metrics + funnel),
  recommendations (content-based 0.5/0.3/0.2 + reason strings), reviews_service
  (reply auth + cached get_summary), **trip_planner** (§6), auth_service,
  deals_service (verify_code; not-my-business→not_found), **photo_focus** (§6).
  **detector.py DELETED** (2026-06-11).
- `routers/` (thin): `auth.py` manual `_parse_body` (slowapi hides the signature
  — keep). businesses.py route order: `/search`, `/categories`, `/vibe`, `/mine`,
  `/geocode`, `POST ""`, `PATCH /{id}`, `/{id}/summary`, `/{ref}/signals`, then
  catch-all `/{ref}` LAST. /search + /vibe take the same filter params.
- `tests/` — **test_classifier.py** (registry fuzzy vs exact, recall harness over
  labeled_businesses.json [156 rows, floors recall ≥0.80 / FP 0, measured
  0.849/0], annotate orchestration w/ canned llm_fn, classify_chains parsing,
  min-10 ladder, **local-backbone-no-leak + shows-within-radius**),
  **test_search_breadth.py** (chip_query completeness, format_place chip mapping,
  _passes_filters token rules, deepen-before-widen + page-settle spy, category-
  browse per-chip + multi-select + early-exit, expanded NEARBY_TYPES),
  **test_ranker.py**. **43 pytest green.**

## 5. Search behavior (current — IMPORTANT)

`search_service.search(params)` — **chains hidden on EVERY search, no toggle**:

1. **Local backbone** (seeded/owner rows): query-filtered when `q` (keyword
   `_matches_query` ≥3-char tokens + ONE gated semantic pass `_semantic_local_
   matches`, multi-word only, cosine ≥0.50, ≤8 rows). Local rows SKIP the
   classifier (owner-accountable = small; verdict_source='local-owner') and are
   **capped at the user's REQUESTED radius** (not the widened one) — so the fixed
   NYC seed cluster can't flood a search 28 km away (Glen Rock fix, 2026-06-13).

2. **Google layer** branches three ways:
   - **`q` present** → paginated `places.search_text` (deepen-before-widen, below).
   - **`categories` present, no `q`** (chip browse) → for EACH selected chip,
     `places.chip_query(chip)` → paginated text search via the same `_deepen_text`
     closure (shared `seen` dedupes multi-select; early-exit at MIN_SMALL_RESULTS).
   - **pure browse** (no q, no chip) → ONE `places.search_nearby` per radius,
     `rankPreference: DISTANCE` (nearest-first, not prominence — surfaces local
     independents not big chains), over an expanded ~20-type customer-facing list.
   Every Google batch → `classifier.annotate()`: registry drop (free) →
   `verdict:{place_id}` cache (30-day) → ONE batched `classify_chains`; small→keep
   (verified_local, conf .9, cached); chain→drop+cache + **registry writeback only
   if confidence=="high"**; LLM-fail/missing-id → PASS likely_local conf .5
   verdict_source='unverified-offline', NOT cached.

3. **Deepen-before-widen ladder** (text/chip search): consts MIN_SMALL_RESULTS=10,
   MAX_PAGES=3, PAGE_SETTLE_S=2.0, RADIUS_LADDER_M=(20k,50k). Per radius, page
   0..2 (one Gemini batch/page, `await asyncio.sleep` only between LIVE pages,
   cache per page `text:…:p{page}` w/ page-0 legacy-key fallback), break at ≥10;
   only WIDEN radius if pages exhausted. `_passes_filters(b, p, effective_radius_m)`
   (local rows use `p.radius_m`, Google uses effective). Response carries
   `radius_used_km` + `radius_expanded` (UI "Widened the search to X km…").

4. **Filters** (`_passes_filters`): radius cap; **category = token-SUBSET
   containment** (chip tokens ⊆ some category's tokens — "Restaurant"⊆"Mexican
   Restaurant", "Coffee"⊆"Coffee Shop", but "Bar"≠"Barber"); min_rating; price;
   open_now; structural `is_independent is False → drop`. Sort via ranker; cap 40.

`format_place` (places.py): Google `primaryType`/`types` → chip-aligned
`categories` (via `_TYPE_TO_CHIPS` + `*_restaurant`/`*store`/`*shop` fallbacks)
THEN the specific cuisine label; raw `primary_type` kept for classifier/vibe.

`vibe_search(q, lat, lng, filters=)` — embed once → (a) curated pgvector index
within **VIBE_LOCAL_RANGE_KM=40**; (b) live Google text, branch-deduped,
`_VIBE_EXCLUDED_TYPES` drops landmark POIs (church/park/museum/…), classified,
embedded on the fly (batched, cached `gemb:{place_id}`), cosine; merge, apply
`_passes_filters` (same FilterBar params as /search) BEFORE top-10, sort by
similarity. Offline → `{"available": false}` → calm UI notice.

`GET /businesses/{ref}/signals` — provenance payload {verdict, is_small, source:
known-registry|gemini|local-owner|unverified-offline, reason, confidence,
checks: [{step, outcome, detail}×4]}. `/{id}/summary` — cached LLM review digest.

Measured live: cold "coffee" ~6s (1 LLM batch), repeat 0.64s; "starbucks" → 0;
SA every category chip 11–21; Glen Rock pure browse 20 @0.6–0.9 km (no seed);
rural KS pharmacy 9 @50 km (widened, honest).

## 6. Algorithms & tunables (single source of truth)

**Chain filter** (`classifier.py` + `chain_registry.py` + `repositories/chains.py`):
- **chain_registry table**: normalized_name UNIQUE, display_name, source CHECK
  ('seed','llm'), reason, created_at. Seed inserted idempotently at migrate.
- **Matching** (`brands.match_against`): seed rows 4-pass FUZZY (exact →
  apostrophe-collapse → ≤3-word prefix w/ AMBIGUOUS_BRANDS guard); **llm rows
  EXACT-normalized only** (a learned "joe's pizza" can't swallow look-alikes).
- **chain_registry service**: module state, `load()` 600s TTL, DB-failure →
  in-memory CHAIN_BRANDS, `_set_state_for_tests` seam; `match()`, `record_llm_chains`.
- **classifier.annotate(candidates, llm_fn=None)**: see §5. CONFIRMED_CONFIDENCE
  =0.90, UNVERIFIED_CONFIDENCE=0.50, VERDICT_TTL_S=30d. Also `verdict_for_local`,
  `classify_one` (/signals, never drops).
- **`llm._CLASSIFY_PROMPT`**: chain = corporate/franchise/national-regional/
  big-box/banks/VC-multi-city; small = locally-owned incl. handful-of-locations-
  one-city (Joe's Pizza + Levain few-shot anchors); rule 4 = IF UNSURE → "small";
  confidence "high" only on positive recognition; strict JSON id→{verdict,
  confidence, reason}. `classify_chains(rows, model=, timeout=)` tolerant parse,
  max_tokens=min(8192, 300+110/row).
- **Measured claim**: registry layer over the 156-row set = recall 0.849 (62/73),
  FP 0; CI floors recall ≥0.80, FP==0. The misses are the Gemini layer's job —
  validated behaviorally with canned responses, never quoted as a %.

**Ranker** — bayes `(n·avg+m·C)/(n+m)` C=3.7 m=15; Gaussian distance σ=2.0km;
DEFAULT_WEIGHTS {distance .25, rating .22, review_count .13, independence .14,
customer_facing .06, price_fit .08, category_match .07, open_status .05};
INTENT_MULTIPLIERS {CHEAP_BUDGET price×4, NEARBY distance×3.5, HIGHLY_RATED
rating×3+reviews×2.5, SPECIFIC category×4, OPEN_NOW open×5+distance×1.5,
SUPPORT_LOCAL independence×4, EXPLORATORY independence×1.5}; renormalized.

**Trust** (same-txn, floored 0): review +10 (−10 on delete), redemption +5,
favorite +2/−2 (+2 only on real INSERT via `xmax=0`). Level = score//50 + 1.

**Trip planner** (`trip_planner.py`, REBUILT 2026-06-13) — interest-driven, not a
fixed template:
- `CHIP_SLOTS`: each interest chip → {cats to fetch, role, dwell, chronological
  rank}. Coffee→coffee(45,1), Bookstore→browse(40,2), Retail→shop(40,2),
  Grocery→market(30,2), Restaurant→eat(75,3), Dessert→dessert(30,4), Bar→drinks(60,5).
- `_plan_chips(duration, interests)`: interests first; a meal always anchored;
  padded to TARGET_STOPS {quick3, half4, full6} by round-robin ≤2/chip (MAX_PER_
  CHIP), DEFAULT_CHIPS=[Coffee,Restaurant,Dessert,Bookstore,Bar] when none; sorted
  by rank (morning→evening).
- `_fetch_pools`: ONE category-driven `search()` PER distinct kind (reuses chip
  browse) → guarantees no empty slot for lack of nearby coffee/bar.
- `_build_stops(…, strategy, avoid)`: greedy kind-by-kind, score =
  `prox_w·proximity(σ) + (1−prox_w)·bayes`; a business in `avoid` (an earlier
  option's picks) is ×NOVELTY_PENALTY=0.2 so options diverge but a sparse area
  can still reuse rather than leave a hole. Label each stop by the POOL it came
  from (honest); thin kind borrows from the user's OTHER kinds (least-used role
  first), capped **MAX_PER_ROLE=2** so a coffee/dessert day can't become 5
  restaurants. WALK 12 min/km.
- **Multiple options** (2026-06-13): `plan()` returns `options[]`, one per
  `STRATEGIES` shape — `best`(prox_w .60/σ1.2), `rated`(.35/σ1.6),
  `walk`(.85/σ0.8). Pools fetched ONCE and reused (no extra Google/Gemini);
  each option `avoid`s accepted earlier options' refs; identical stop-sets are
  collapsed (sparse areas → fewer options). Only `options[0]` is LLM-narrated
  (1 call — quota guard); rest are templated. Each option = {key, label, stops,
  total_walk_km, narrative, mode}.
- Routes: POST /trips/plan (→ {options, duration, interests, start}), POST
  /trips (save snapshot of the SELECTED option's stops), GET /trips, DELETE
  /trips/{id}. Frontend `Plan.tsx` shows option tabs (label · N stops · km ·
  name preview); selected option drives the timeline + map; save records
  `params.option`.
- KNOWN: up to ~5 category searches/plan (cached/warmed mitigates quota); greedy
  routing can yield longish walks (~8.7km full day) in spread-out suburbs —
  route-optimization / walk-budget / open-now awareness are future enhancements.

**Smart photo crop** (`photo_focus.py`) — grayscale → downscale 160px →
FIND_EDGES → 10×10 grid of SQUARED edge energy → energy-weighted centroid,
clamped 20–80 → photo_focus_x/y (0–100). BizImage applies `object-position`
(default 50/50; Google results None).

**Embeddings** — `gemini-embedding-001` @768 (**text-embedding-004 RETIRED →
404; do not regress**). Batched = one call; cosine scale-invariant.

**Analytics** — ALL_METRICS {summary, rating_distribution, reviews_trend, deals,
redemptions_trend, views_trend, funnel}; `from`/`to` aliased query params
(from is a keyword); owner-or-admin only (403); funnel % step + end-to-end.

## 7. Frontend map

**Routes:** `/` **Discover** (NEW editorial homepage — hero mission + search w/
Classic|✦Vibe → routes to `/search?q=…&kind=`; "Browse by category" tile grid
w/ CategoryIcon → `/search?cat=Name`; "Featured near you"/"For you" photo cards
[forYou if signed in, else nearby browse]; deals strip; Plan-a-day CTA),
`/search` **Search** (FilterBar URL-synced — NO independent-only / NO vs-Google
toggle; Classic|✦Vibe w/ similarity chips + offline notice; radius-widened
notice; For-you strip; LocationControl; results↔map hover sync; reads `?kind=`),
`/business/:ref` Detail (hero BizImage, badges, **VerdictBreakdown** glass-box
[verdict + source chip + 4-step trail], AI summary pull-quote, hours, deals +
redeem, reviews CRUD + helpful + owner replies), `/favorites`, `/deals`,
`/plan` (duration cards, interest chips, start time, timeline + numbered-pin map
+ ✦/⚙ narration, save/delete), `/profile`, `/login`, `/register`, owner:
`/owner` Dashboard (selector, date range, 7-metric multi-select, stat cards +
FunnelChart + HTML-flex Bar/TrendChart, CSV/print, edit links), `/owner/
add-business`, `/owner/edit/:id`, `/owner/post-deal`, `/owner/verify` (cashier).
Header has **Discover + Search** nav links.

**Components:** ui.tsx (StarRating, PriceLevel, LocalBadge, OpenBadge, Skeleton,
EmptyState, **BizImage** w/ monogram fallback + focusX/Y object-position),
BusinessCard, **CategoryIcon** (16 hand-drawn line glyphs), MapView (@vis.gl/
react-google-maps, mapId="DEMO_MAP_ID", badge-colored numbered AdvancedMarkers,
hover sync, **PanToCenter** child re-centers on location change, ColorScheme by
theme), ConciergeWidget (FAB, ✦/⚙ chip), VerdictBreakdown, charts.tsx (HTML
flex), LocationControl (geocode/device/NYC-reset; localStorage; event), Header
(sun/moon ThemeToggle), ErrorBoundary, Reveal (MotionConfig reducedMotion="user").

**lib/:** api.ts (typed client, 15s timeout, ApiError w/ 422 extraction,
tokenStore, photoSrc(); groups authApi/businessApi[.vibe(params)/.summary/
.signals→ClassifierVerdict/.geocode]/reviewApi/favoriteApi/dealApi/aiApi/
ownerApi/recommendApi/tripApi), auth.tsx, location.ts (manual>device>demo),
**theme.ts** (light/dark; localStorage `locallens_theme`; useTheme), usePageTitle.

**Design (Indigo · Playfair, picked 2026-06-11):** tokens.css + tailwind —
cream #FBF7F0, surface #FEFCF8, ink #1F1B16/#5A5247, **accent-600 #2E5C8A /
accent-700 #21436B (deep indigo; ALL rust-* renamed accent-*)**, verified
#4F6B4A, likely #7D9477, chain #9A958C, border #E8E0D4; **Playfair Display /
Lora** via --font-display/--font-body; mono codes; paper-grain on body::before;
prefers-reduced-motion kills animation; focus-visible accent ring. NO gradients.
**Dark mode**: `:root[data-theme="dark"]` — canvas #1E1914, surface #272118, ink
#EDE5D8/#A89D8C, accent 600 #5B86B5 / 700 #8FB4DC, all AA-checked; pre-paint
script in index.html; sun/moon toggle; map remounts ColorScheme; grain inverts.
Container `.container-page` max-w 88rem. Search results/map grid `1fr_1.3fr`.

**Tests:** 4 Vitest files (BusinessCard incl. object-position, FilterBar, charts,
api) — **34 green**. (The design-look switcher [rust/indigo/grotesk] was a
temporary exploration, then REMOVED — indigo promoted to base.)

## 8. Working agreement (how the user wants work done)

Build in **phases, one at a time**; after each STOP, report, prove the gate
(boots, feature checks, tests green, **zero tracebacks**), and **wait for
"proceed."** Zero-errors rule is sacred (live demo). Strict layering
(routers→services→repositories; SQL only in repositories). Comment the WHY (the
student defends every line in Q&A); prefer hand-rolled explainable code over deps
(HTML charts, no chart lib). Secrets via env; **never commit .env; never git
commit/push — user does that** after rotating credentials. Black + Prettier
(run Prettier after bulk TSX edits). No dead code/TODOs. Leave servers RUNNING.
For substantial/ambiguous work: Explore → Plan → confirm before building.

## 9. Changelog (dated; newest last)

- **BUILD_SPEC Phases 0–4** — skeleton; MVP (auth+lockout, search+map, reviews w/
  transactional aggregates, dual-source favorites, race-proof deals, validation,
  concierge); differentiators (ranker, Gemini concierge + fallback, glass-box);
  owner side (forms + customizable report w/ CSV/print); polish (WCAG, motion,
  error boundaries, timeouts, warmer, 4 docs).
- **Expansion A–D** — schema v2 + 46-biz seed + photos + embeddings; cashier
  verify-code, owner replies, views/funnel + FunnelChart, /owner/edit; trust
  live, /profile, /recommendations, review summaries; vibe search, trip planner,
  admin, stale-pool fix.
- **Phase E** — dark mode; 33→34 Vitest; docs refresh; warmer; **ONLINE=false
  reads stale cache**.
- **Phase F** — smart photo cropping (Pillow focal points); vibe-filter fix
  (excludes landmark POIs, takes FilterBar params); layout widening.
- **2026-06-11 chain-filter rework** — SCRAPPED the 10-signal detector (deleted);
  built registry + per-place cache + batched Gemini classifier + learning loop;
  removed independent_only + vs-Google toggle; SignalBreakdown→VerdictBreakdown.
- **2026-06-11 registry growth** — harvest.py (stalled on 20/day quota at city 2);
  import_chains.py + user's 2,208-bullet markdown → **registry 2,383** (88 risky
  single-word names flipped to exact-only). Design-look switcher explored then
  removed → **Indigo · Playfair** base; rust-*→accent-* rename.
- **2026-06-12 big-city breadth** — category exact-match → token-subset + Google-
  type→chip mapping; search_text PAGINATED (deepen-before-widen to 60); SA
  "restaurant"+filters 2→17.
- **2026-06-12 category browsing** — chip browse now FETCHES the chip (`_CHIP_TO_
  QUERY` + per-chip `_deepen_text`); expanded NEARBY_TYPES; SA every chip 0→11-21.
- **2026-06-13 Glen Rock seed flood** — local rows capped at REQUESTED radius (no
  NYC flood 28 km away); search_nearby `rankPreference: DISTANCE` (nearest local
  independents). Glen Rock 40-seed-flood → 20 genuine @<1 km.
- **2026-06-13 Discover homepage** — `/` = editorial landing, search results
  moved to `/search`; CategoryIcon tiles; Featured/For-you; deals + Plan CTA.
- **2026-06-13 trip planner rebuild** — interest-driven, per-category fetch,
  MAX_PER_ROLE=2; Full day now 6 balanced stops, interests change the plan,
  Grocery/Retail appear, no random florist.
- **2026-06-13 trip planner — multiple options** — `plan()` returns 3 distinct
  itineraries (Best overall / Top rated / Shortest walk), each made of different
  businesses (NOVELTY_PENALTY) from ONE shared pool fetch; identical sets
  collapsed; only the top option LLM-narrated (quota). `Plan.tsx` adds option
  tabs. +5 backend tests (`test_trip_planner.py`); 48 backend / 34 Vitest green.
- **2026-06-13 trip planner UI polish** — Plan page rebuilt as 3 guided steps
  (duration / icon interest-chips / start-time + full-width CTA); option tabs
  became selectable cards w/ plain-language taglines + ✓.
- **2026-06-13 DEPLOYED to Vercel (v2 LIVE)** — all-on-serverless at
  fbla-2026-tan.vercel.app (see §Deployment). ASGI mount-at-`/api`, no Mangum;
  deps bumped for Python-3.14 wheels; warm cache shipped. Preview→prod gated;
  public smoke test green (health, SPA, 19-result gemini search).

**REMAINING / suggested next:** real-quota Gemini key (pre-competition #1 —
prod runs ONLINE=true so live searches spend it); rotate the credentials now
exposed in Vercel env + local `.env` before sharing the repo; trip planner
enhancements (open-now/time-aware, walking route line on map, themed presets,
edit-a-stop, route optimization). **Deploy is DONE.** Re-deploy = `vercel --prod`
from repo root (CLI already authed); re-warm cache locally then redeploy to
refresh demo data.

## 10. Known caveats / honest footnotes

- 6 businesses intentionally photo-less (name-guard mismatches → monogram tiles).
- Pure-browse landing (no q, no chip) leans restaurant-heavy even with DISTANCE
  ranking (Google still surfaces prominent food) — accepted; chips are the
  refinement. User said don't worry about this.
- Registry recall 0.849/FP 0 is measured on its OWN labeled set → present as
  dev-set + CI floors; Gemini layer described, not quoted as a %.
- `migrate --reseed/--fresh` wipes runtime activity (saved trips, marked codes,
  live trust); admin IS in seed; CAFE1A2B already consumed; registry survives reseed.
- Trip title uses window.prompt; planner ignores business hours (start-time
  agnostic); open-now uses America/New_York for seeded hours.
- Search.tsx is the largest component — works, refactor candidate.
- Bundle ~420KB (motion/react + maps lib) — fine for the demo.
- auth.py manual `_parse_body` required wherever slowapi decorates a body route
  (only auth; /search + /vibe are GET).
- v1 (`legacy/`) still referenced by README link; Vercel still serves v1.

## 11. Verification recipes (copy-paste)

```bash
cd backend
./.venv/bin/python -m pytest tests/ -q              # 43 backend tests
(cd ../frontend && npm test)                        # 34 Vitest
(cd ../frontend && npm run build)                   # tsc -b + vite build
./.venv/bin/python -m app.db.migrate                # idempotent; --reseed | --fresh
./.venv/bin/python -m app.db.enrich                 # photos + embeddings + focal points
./.venv/bin/python -m app.cache.warm                # NYC+SA demo cache (queries+categories+vibe+plan)
./.venv/bin/python -m app.db.import_chains <file.md> # bulk-grow the chain registry, no API
ONLINE=false ./.venv/bin/uvicorn app.main:app --port 8001   # offline rehearsal
# search:   GET /businesses/search?lat=40.7308&lng=-73.9973            (pure browse)
#           GET /businesses/search?q=coffee&lat=…&lng=…                (deepen-before-widen)
#           GET /businesses/search?categories=Bookstore&lat=…&lng=…    (chip browse → fetches it)
#           GET /businesses/search?q=starbucks → 0 (chains filtered)
# vibe:     GET /businesses/vibe?q=old%20new%20york%20atmosphere
# planner:  POST /trips/plan {"duration":"full","interests":["Coffee","Restaurant","Dessert"],"start_time":"10:00","lat":…,"lng":…}
# cashier:  POST /deals/verify-code {"code":"CAFE5E6F"} as owner → valid → {"mark_used":true} → already_used; STRD7FAB → not_found
# trust round-trip: login demo → favorite (+2) → refave (0) → unfave (−2) → review (+10) → delete (−10); GET /auth/me each step
# report:   GET /analytics/business/1?metrics=summary&from=1990-01-01&to=1990-12-31 → zeros
```

Gate pattern: backend import OK → uvicorn boot → feature curls → pytest →
frontend tsc/build/vitest → both servers 200 → `grep -ci traceback` logs == 0 →
leave servers running → report → WAIT for "proceed".
