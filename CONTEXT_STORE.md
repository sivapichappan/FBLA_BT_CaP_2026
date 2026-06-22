# CONTEXT STORE — LocalLens v2 (full session state)

> Working memory for AI-assisted development of this repo. Rewritten 2026-06-13;
> updated 2026-06-21.
> Purpose: enough fidelity that a fresh session (or post-compaction context) can
> continue EXACTLY where this one left off — decisions, tunables, gotchas, and
> verification recipes included. Sections 1–8 + 10–11 describe the system as it
> works NOW; §9 is a dated changelog; **§12 = Verified Visits**, **§13 = Google
> Sign-In**, **§14 = Trip Planner v2** (all committed + live). Contains **no secret
> values** (those live only in gitignored `.env`); demo passwords below are seeded
> demo data.

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
**Bot-prevention** is answered by **Verified Visits** (§12): proof of physical
presence before a review counts.

Strategy/rubric analysis: `FBLA_FEATURES_AND_STRATEGY.md`. Original brief:
`BUILD_SPEC.md`. Browser-Claude build kits: `DIAGRAM_PROMPTS.md` + `FBLA_DECK_KIT.md`
(9-slide deck + SVG prompts + demo script). Feature docs: `VERIFIED_VISITS.md`,
`GOOGLE_SIGNIN.md`. The v1 app (vanilla JS) is preserved in `legacy/`, superseded.

## 2. Repo / environment / how to run

- **Repo root:** `/Users/sivapichappan/FBLA2526` (git; branch `master`; remote
  `https://github.com/sivapichappan/FBLA_BT_CaP_2026.git`, public). **ALL work is
  committed + pushed + live** (HEAD `abdc7bc`). Recent (newest first): budget-filter
  fix → trip-planner bug fixes → fonts + Trip Planner v2 → Google Sign-In → Verified
  Visits → trip-planner realism → the "L" logo → driving-distance search. Secrets
  stay gitignored; **user owns commits/pushes** (push auto-deploys via the GitHub→
  Vercel integration — do NOT run `vercel --prod`). The awwwards UI revamp is parked
  in `git stash@{0}` (recoverable) — see §9.
- **Stack:** Python 3.12 / FastAPI / psycopg3 / Supabase Postgres (+pgvector);
  React 18 + TypeScript + Vite 5 + Tailwind 3.4 + motion/react.
- **Run:** `./run.sh` OR backend `cd backend && ./.venv/bin/uvicorn app.main:app
  --host 127.0.0.1 --port 8000`; frontend `cd frontend && npm run dev` (5173,
  start FROM `frontend/`). Build: `npm run build` (tsc -b first). uvicorn runs
  WITHOUT `--reload` here, so a backend code change needs a restart to take effect.
- **Env (gitignored; .env.example committed):** `backend/.env` → DATABASE_URL
  (Supabase tx-pooler, ref `iwwwgmmffczjlkkjsxgn`, aws-1-us-east-1, port 6543),
  JWT_SECRET, GOOGLE_MAPS_API_KEY (Maps JS + Places New + Geocoding),
  **GOOGLE_OAUTH_CLIENT_ID** (Google Sign-In — the public client id we verify
  tokens against, §13), LLM_API_KEY (**Google AI Studio/Gemini**, `AQ.…`),
  LLM_BASE_URL=`https://generativelanguage.googleapis.com/v1beta/openai/`,
  LLM_INTENT_MODEL=`gemini-2.5-flash-lite`, LLM_REPLY_MODEL=`gemini-2.5-flash`,
  LLM_CLASSIFY_MODEL=`gemini-2.5-flash`, LLM_EMBED_MODEL=`gemini-embedding-001`,
  ONLINE=true, CORS_ORIGINS, DEMO_CITY/LAT/LNG (NYC 40.7308,-73.9973).
  `frontend/.env` → VITE_API_BASE_URL, VITE_GOOGLE_MAPS_API_KEY,
  **VITE_GOOGLE_CLIENT_ID** (the same public OAuth client id; renders the
  "Continue with Google" button).
- **⚠ Gemini quota:** the key is free-tier = **20 requests/day PER MODEL**. Shared
  by classifier, concierge, vibe, summaries, trip planner. A real-quota/billed key
  is the #1 pre-competition task. Mitigated by the registry (most chains free),
  30-day verdict cache, and `cache/warm.py`. (Hit the 429 cap during this session;
  the deterministic fallbacks kept everything working offline.)
- **Cloud — LIVE:** Vercel project `fbla-2026` (id `prj_heJW0pbxynK5qegZCH7unSQIFCLa`,
  team `team_JKtO6sXyzqRra9kL5ECS5jYi`, account `sivapichappan-5633`) →
  **https://getlocallens.vercel.app** (public prod). All-on-Vercel serverless: Vite
  SPA static + FastAPI as ONE Python function. See **§Deployment**. Push to `master`
  auto-deploys (GitHub integration). Env vars set on Vercel (prod) via `vercel env
  add` — including `GOOGLE_OAUTH_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` added this
  session. NOTE: `fbla-2026.vercel.app` (the bare auto-domain) serves a DIFFERENT
  app — the real prod URL is `getlocallens.vercel.app`; preview/branch URLs return
  401 (Vercel deployment protection). Session Supabase MCP is a different org
  (Wondrlink), can't manage this DB; all DB ops via psycopg.
- **Google Cloud (OAuth, §13):** the Sign-In OAuth Client ID lives in the SAME
  Google Cloud project as the Maps key. **Authorized JavaScript origins** must list
  `http://localhost:5173`, `https://fbla-2026-sivapichappan-5633s-projects.vercel.app`,
  and `https://getlocallens.vercel.app`. Origin changes take minutes–hours to
  propagate; until then the button shows a console "origin not allowed" warning.
- **macOS:** port 5000 = AirPlay → backend uses 8000. pip + live-API tests need
  `dangerouslyDisableSandbox` (DNS blocked in sandbox).

## 3. Accounts, demo data, cashier codes (seeded; safe to print)

| Account | Email / password | Role / notes |
|---|---|---|
| demo_user | demo@locallens.app / demodemo | consumer; trust ~51 (lvl 2); reviews; favorites; saved trip; 4 verified visits, $86 kept local, 2 badges |
| demo_owner | owner@locallens.app / ownerowner | owns ids 1–5: Caffè Reggio, Joe's Pizza, Buvette, Murray's Cheese, McNally Jackson |
| admin | admin@locallens.app / adminadmin | full admin (edit any biz, reply anywhere, verify any code) |
| 12 personas | maya_r…ravi_p @example.com / demodemo | populate reviews/favorites |

Cashier codes (deal_redemptions): valid-unverified → `CAFE5E6F`, `SLICE9AB`,
`SLICE2EF`, `PAIR7A8B`, `NIGHT3AB`, `BRUN4CDE`, `CHEZ5FAB`, `BOOK6CDE`,
`STRD7FAB` (Strand — NOT demo_owner's → reads not_found for them: privacy demo);
already-used → `CAFE3C4D`, `SLICE1CD`, `CAFE1A2B`.

Seed: **3 demo cities, ~90 businesses total** — **~46 NYC** (Village/SoHo/LES/EV;
ids 1–5 owner-run), **~22 San Antonio** (downtown/Southtown/Pearl — the competition
host city), **~22 San Francisco** (Mission/Valencia + Hayes Valley + a North Beach
pair). All coexist in ONE DB; search is radius-bounded, so the **city picker**
(LocationControl → `DEMO_CITIES`) just moves the map centre and each city's own
independents surface. Only NYC has the owner account (ids 1–5) + cashier-mode demo
data; SA/SF are discovery-only (no owner) but get full categories + hours + ~2
reviews each + a few deals, and `migrate._seed_verified_visits` auto-links ~half
their reviews to verified visits (so badges/passport work in every city). 16
categories, ~190 reviews, ~18 active deals, redemptions, favorites, business_views,
**hours for ALL seeded businesses** (drives the Verified-Visits open-now AND the
planner's open-on-arrival check, §14). Aggregates + trust recomputed at seed end
(over ALL businesses). **chain_registry: 2,383 names** — survives `--reseed`.
**Adding the cities requires `migrate --reseed`** (seed runs only on an empty DB);
reseed WIPES runtime activity (registry survives) — a destructive prod-DB op, so
run it deliberately.
Verified-Visits demo (idempotent): flagship **Caffè Reggio (id 1)** enriched
(raw 4.48 / verified 3.86 / trust 4.21); ~54 seeded visits. Caffè Reggio also has
QR check-in enabled (a rotating kiosk code) + active deals (surface in the planner).

## §Deployment (Vercel, all-on-serverless) — LIVE

Prod: **https://getlocallens.vercel.app** (primary, public). Push to `master`
auto-deploys via the GitHub integration. The CLI `vercel` is also authed as
`sivapichappan-5633` (repo linked via gitignored `.vercel/`). A manual `vercel
--prod` works too but is NOT needed (and running it alongside a GitHub deploy can
trip Vercel's burst limit → deployments stuck in `BLOCKED` — happened this session;
fix = just `git push`). A nicer public name = `vercel domains add <name>.vercel.app`
(a PROJECT domain); NOT `vercel alias set` (its URL is auth-gated 401).

Files (repo root unless noted): `vercel.json` (framework vite; buildCommand `cd
frontend && npm install && npm run build`; outputDirectory `frontend/dist`;
function `api/index.py` maxDuration 300, includeFiles `backend/app/**`; rewrites
`/api/(.*)→/api/index` then SPA `/(.*)→/index.html`); `api/index.py` (ASGI: inserts
`backend/` on sys.path, parent `FastAPI()` mounts backend at `/api`, no Mangum);
`requirements.txt` (root prod subset — `psycopg 3.2.13`, `pydantic 2.13.4`,
`bcrypt 5.0.0` bumped for Vercel's Python-3.14 wheels; mirrored in
`backend/requirements.txt` + venv); `.vercelignore` (ships `backend/app/cache`
warm data); `frontend/.env.production` (`VITE_API_BASE_URL=/api` same-origin — the
Maps + OAuth public keys are injected as Vercel build env vars, not committed);
`backend/app/db/connection.py` (pool min 0 / max 4). Smoke (public prod): `/`→200,
`/api/health`→ok, `/api/businesses/search?...&q=coffee` → gemini-classified
independents.

## 4. Backend map (every module, one line)

- `app/main.py` — app factory; CORS; slowapi handler; global exception handler
  (clean 500, logs traceback); lifespan closes pool; routers: auth, businesses,
  reviews, favorites, deals, ai, analytics, recommendations, trips, visits,
  passport. `/health` no DB.
- `app/config.py` — pydantic-settings `settings`; ONLINE master offline switch;
  Verified-Visits §15 block; **`google_oauth_client_id`** (Sign-In audience);
  LLM_* model names.
- `db/connection.py` — psycopg3 ThreadedPool (0–4, dict_row, prepare_threshold
  =None for the Supabase pooler, check + max_idle=240); `transaction()`, `query()`.
- `db/schema.sql` — idempotent DDL; `CREATE EXTENSION vector`; chain_registry;
  Verified-Visits tables (§12); **`users` made `password_hash` nullable + `auth_provider`
  + `oauth_sub`** (Google Sign-In, §13); **`trips.share_token` + unique index**
  (share link, §14); additive `ALTER … IF NOT EXISTS` throughout; CHECKs = semantic
  validation.
- `db/seed.sql` — see §3. `db/migrate.py` — schema; seeds if empty; `--reseed`/
  `--fresh`; idempotently seeds curated brands → registry (live **2,383**) +
  Verified-Visits demo (flagship reviews + verified visits).
- `db/enrich.py` (photos + embeddings + focal points), `db/harvest.py` (registry
  growth, stalled on quota), `db/import_chains.py` (bulk registry import, no API),
  `db/purge_checkpoints.py` (privacy: purge raw visit checkpoints past retention),
  `cache/warm.py` (warms demo flow; the trip-plan warm call uses the new
  start/end/num_stops signature).
- `middleware/security.py` — bcrypt(12), JWT HS256 7-day, current_user/optional_user
  (the planner's `/trips/plan` uses `optional_user` so it personalises when signed
  in, stays anonymous otherwise).
- `middleware/rate_limit.py` — slowapi by IP: AUTH 20/15min, SEARCH 30/min,
  GENERAL 100/15min.
- `repositories/` (ALL SQL): users (+ `get_by_oauth_sub`/`create_oauth_user`/
  `link_oauth` for Sign-In; + `hours_for_ids` batch + `place_ids_to_local_ids`
  batch for the planner), businesses, reviews, favorites, deals (+
  `list_active_for_businesses` batch), chat, **trips** (JSONB snapshots; +
  `set_share_token`/`get_by_share_token`), visits, chains.
- `services/`: brands, chain_registry, classifier, ranker, intent, **llm**
  (OpenAI-compat httpx; `interpret_trip_goals` now also returns a chronological
  `sequence`, §14), embeddings, **places** (§5; `_chip_categories` Retail fix;
  `_CHIP_TO_QUERY["Retail"]`="clothing store"), places_cache, **search_service**
  (§5; `open_at(hours,weekday,minute)` reusable open-check; price filter keeps
  price-UNKNOWN businesses), concierge, analytics, recommendations, reviews_service,
  **trip_planner** (§14 — heavily extended), **trip_export** (hand-rolled `.ics`),
  **google_oauth** (verify a Google ID token via Google's `tokeninfo` + audience/
  email-verified checks, §13), auth_service (+ `google_login`), deals_service,
  photo_focus, geofence/antiabuse/qr/qr_service/visits_service/events/passport/
  review_trust (Verified Visits, §12).
- `routers/` (thin): auth (`/auth/google`), businesses, reviews, **trips**
  (`/plan` [optional_user], `/retime`, save/list/delete, `/{id}/share`,
  `/share/{token}`, `/share/{token}.ics`), visits, passport, etc.
- `tests/` — **154 pytest green.** Highlights: test_classifier, test_search_breadth,
  test_ranker, **test_trip_planner** (multi-option, goal-parsing, realism guards,
  knobs, sequence, open-on-arrival, edit/retime, deals/favourites, bug-fix
  regressions), **test_open_at** (open-at-a-time helper), **test_ics** (.ics format),
  **test_price_filter** (price filter keeps unknowns), **test_google_auth** (Sign-In
  find/link/create + bad token), Verified-Visits suites (geofence/antiabuse/visits/
  review_link/qr/passport/review_trust), `tests/realism_audit.py` (non-pytest
  104-scenario harness).

## 5. Search behavior (current — IMPORTANT)

`search_service.search(params)` — **chains hidden on EVERY search, no toggle**:
local backbone (seeded rows, query/semantic-filtered, capped at the REQUESTED
radius) + a Google layer that branches three ways (`q`→paginated text;
`categories`→per-chip text; pure browse→`search_nearby` DISTANCE-ranked), each
Google batch run through `classifier.annotate()` (registry → 30-day verdict cache
→ ONE batched Gemini audit; uncertain→show as likely_local). Deepen-before-widen
ladder (MIN 10, MAX_PAGES 3, RADIUS_LADDER 20k/50k).

**`_passes_filters`** — radius cap; **category = token-SUBSET containment**
("Restaurant"⊆"Mexican Restaurant", "Coffee"⊆"Coffee Shop", "Bar"≠"Barber");
min_rating; **price (FIXED 2026-06-21): a price filter excludes only businesses
whose KNOWN price_level is out of range — price-UNKNOWN spots (price_level None)
are KEPT.** Most small independents carry no price data, so the old "exclude
unknowns" behaviour hid every independent and surfaced only the chains that had
explicit prices (the budget→2-stops + chains-appearing bug, §14); open_now;
structural `is_independent is False → drop`. Sort via ranker; cap 40.

**Retail category fix (committed):** `_CHIP_TO_QUERY["Retail"]` queries
**"clothing store"** (not the generic "shop"), and `_chip_categories` promotes a
generic shop signal (bare `store` type, or an unmapped `*_shop`/`*_store`) to
**Retail ONLY when Google found no more-specific category** — so bagel shops,
bakeries, and bookstores stop landing in the clothing-store slot.

`open_at(hours, weekday, minute_of_day)` — reusable pure helper (0=Sun..6=Sat,
"HH:MM:SS" parse, overnight-span aware). `_open_now` is now a thin caller; the trip
planner reuses it for the open-on-arrival check (§14).

`vibe_search`, `GET /businesses/{ref}/signals` (glass-box provenance), `/{id}/summary`
— unchanged.

## 6. Algorithms & tunables (chain filter, ranker, trust)

**Chain filter** (`classifier.py` + `chain_registry.py` + `repositories/chains.py`):
chain_registry table (normalized_name UNIQUE, source seed/llm); `brands.match_against`
(seed rows 4-pass FUZZY w/ AMBIGUOUS_BRANDS guard; llm rows EXACT-normalized only);
`classifier.annotate` (registry → 30-day verdict cache → ONE batched `classify_chains`;
small→keep verified_local .9; chain→drop+cache + registry writeback only if
confidence "high"; LLM-fail→likely_local .5 NOT cached). Measured registry recall
0.849 / FP 0 on its 156-row set (CI floors ≥0.80 / FP 0); the Gemini layer's misses
are validated behaviorally, never quoted as a %.

**Ranker** — bayes `(n·avg+m·C)/(n+m)` C=3.7 m=15. **Distance shown/sorted is a
DRIVING estimate** `driving_km = haversine × CIRCUITY_FACTOR=1.4`; candidate-radius
caps stay straight-line; Gaussian σ=2.8 driving-km. DEFAULT_WEIGHTS + INTENT_MULTIPLIERS
unchanged.

**Trust** (same-txn, floored 0): review +10/−10, redemption +5, favorite +2/−2,
**verified visit +5** (§12). Level = score//50 + 1.

(The **trip planner** algorithm is large and now its own section — see §14.)

## 7. Frontend map

**Routes:** `/` Discover (editorial homepage), `/search` Search (FilterBar URL-
synced, Classic|✦Vibe, List|Map toggle below lg), `/business/:ref` Detail (hero,
VerdictBreakdown glass-box, AI summary, hours, deals, reviews CRUD + owner replies,
single-business Location map, **Verified-Visits check-in + two-tier rating toggle**,
§12), `/favorites`, `/deals`, **`/plan`** (Trip Planner v2 — §14: description
textarea + category chips + **separate Start / End / Stops** + a collapsible
**Fine-tune** panel [Who's it for / Occasion / Pace / Budget / Which day] + 3 option
tabs + an **editable** timeline [swap/lock/remove/▲▼/stay −+/add] + deal & favorite
& open-on-arrival badges + "kept local" estimate + Save), **`/trip/shared/:token`**
(public read-only shared day + Add-to-calendar, §14), `/passport` (Verified-Visits
passport, §12), `/profile`, **`/login`/`/register`** (email/password **+ "Continue
with Google"**, §13), owner (`/owner`, `/owner/edit/:id`, `/owner/post-deal`,
`/owner/verify`, **`/owner/checkin-code`** kiosk). **Header:** L-logo lockup + nav
at ≥md, hamburger→MobileMenu below md.

**Components:** ui.tsx (StarRating, PriceLevel, LocalBadge, OpenBadge, BizImage),
BusinessCard, CategoryIcon, MapView (@vis.gl/react-google-maps; + geofence ring +
user pin for check-in, + numbered pins for the planner), ConciergeWidget,
VerdictBreakdown, charts.tsx, LocationControl, Header/MobileMenu/MapListToggle/
navLinks/ThemeToggle/ScrollProgress/ErrorBoundary/Reveal, **CheckInFlow /
VerifiedRating / TrustAdjustedRating / Passport / CheckinKiosk** (Verified Visits,
§12), **GoogleSignInButton** (loads Google Identity Services on demand; renders
nothing if unconfigured/unreachable so email/password is always the fallback, §13),
**SharedTrip** (public shared-day page, §14). The Plan page's `Segmented` pill row
is reused for all the Fine-tune knobs.

**Design (Indigo · NEW fonts 2026-06-21):** tokens.css + tailwind — cream #FBF7F0,
surface #FEFCF8, ink #1F1B16/#5A5247, accent-600 #2E5C8A / accent-700 #21436B,
verified #4F6B4A, likely #7D9477, chain #9A958C, border #E8E0D4. **Typography is now
`--font-display: "Space Grotesk"` (headings) + `--font-body: "IBM Plex Sans"` (body)**
— REPLACED Playfair Display / Lora; the `font-serif` Tailwind utility is the historic
name for the body slot (now a sans stack); `index.html` preloads only these two; the
Tailwind fallbacks are `system-ui, sans-serif`. Dark mode `:root[data-theme="dark"]`,
pre-paint script, sun/moon toggle, AA-checked. Fully mobile-responsive; no horizontal
overflow (`overflow-x:clip` backstop + `min-w-0` grid items). A full awwwards revamp
was built then REVERTED → `git stash@{0}`.

**lib/:** api.ts (typed client; **15s default request timeout with a per-call
override — the trip plan gets 45s**; ApiError 422 extraction; tokenStore; groups
authApi[+`.google`]/businessApi/reviewApi/favoriteApi/dealApi/aiApi/ownerApi/
recommendApi/visitApi/passportApi/**tripApi**[+`.retime`/`.share`/`.sharedTrip`/
`.icsUrl`]), auth.tsx (+ `loginWithGoogle`), location.ts, theme.ts, usePageTitle.

**Tests:** Vitest suite green (incl. VerifiedRating toggle); `npm run build` clean.

## 8. Working agreement (how the user wants work done)

Build in **phases, one at a time**; after each STOP, report, prove the gate (boots,
feature checks, tests green, **zero tracebacks**), and **wait for "proceed."** Zero-
errors rule is sacred (live demo). Strict layering (routers→services→repositories;
SQL only in repositories). Comment the WHY (the student defends every line in Q&A);
prefer hand-rolled explainable code over deps (HTML charts, hand-rolled `.ics`/TOTP,
no chart/icalendar lib). Secrets via env; **never commit .env; never git commit/push
— user does that** (push auto-deploys; do NOT run `vercel --prod`). Black + Prettier
(run Prettier after bulk TSX edits). No dead code/TODOs. Leave servers RUNNING. For
substantial/ambiguous work: Explore → Plan → confirm → build in gated phases.

## 9. Changelog (dated; newest last)

(Pre-2026-06-19 history — MVP through the awwwards-revert, big-city breadth, Glen
Rock seed-flood fix, Discover homepage, trip-planner rebuild + multi-option +
describe-your-day, Vercel deploy, mobile-responsive, zero-overflow, driving-distance
— condensed; see git log + prior doc revisions.)

- **2026-06-19 trip-planner realism** (`b391bd7`) — 100-scenario audit → walk-leg
  cap, per-role caps, time-of-day windows + 9pm cutoff + active-time budget.
- **2026-06-19 the "L" logo** (`170d48b`) — mark + favicon/apple-touch/og/theme-color.
- **2026-06-20 Verified Visits** (`9ccea27`/`26f7bdf`) — proof-of-presence reviews:
  GPS+dwell + rotating-QR check-in, two-tier rating toggle, passport, money-kept-
  local, trust-weighted rating, materialize-on-write for any business. §12. (Later:
  hid the public verification-strength number; moved the spend prompt into the review
  composer.)
- **2026-06-21 Google Sign-In** (`e5d617e`) — "Continue with Google" on Login/Register
  via Google Identity Services → ID token verified server-side against Google's
  `tokeninfo` (audience + email-verified), then find/link-by-email/create + our JWT.
  Additive schema (nullable password_hash, auth_provider, oauth_sub). §13.
- **2026-06-21 fonts + Trip Planner v2** (`66c94cf`) — (a) typography → **Space
  Grotesk + IBM Plex Sans**; (b) Plan-a-day **separate Start/End/Stops** inputs
  (replacing the duration preset); (c) parallelised per-category search (cold plan
  ~26s→~5s); (d) the full **Trip Planner v2** feature set (§14): knobs
  (audience/occasion/pace/budget + "kept local"), follow-described-order, open-on-
  arrival badges, edit-in-place (swap/lock/remove/reorder/dwell via `/trips/retime`),
  deals-on-route + favourites boost, public share link + `.ics` export; (e) the
  Retail→clothing category fix. Built in 6 gated phases.
- **2026-06-21 trip-planner bug fixes** (`1dcad82`) — capped unwalkable fallback legs
  (no more 9.7 km "walkable" days), padding no longer adds a phantom 2nd meal, "read"
  → Bookstore in the offline keyword reader.
- **2026-06-21 budget-filter fix** (`abdc7bc`) — the ROOT cause of the 2-stops / 9.7 km
  / chains-appearing reports: a price/budget filter was excluding every price-UNKNOWN
  business, leaving only the far CHAINS that carry explicit prices. Now price-unknowns
  are kept (only known-over-budget excluded). Fixes the planner AND the search $/$$
  filters. +2 tests.
- **2026-06-21 planner: fill the window + center the meal** (UNCOMMITTED) — reported
  "I said till 4 PM but everything ends by 2." `end_time` was a CAP, never a TARGET, and
  a lone meal sorted LAST. Added `_center_meal` (one meal → mid-day, any-time stops
  before AND after → coffee→bookstore→lunch→shop) + `_spread_to_window` (nudge lunch to
  ~12:30, stretch dwell to a per-role ceiling, then "free time to explore" gaps so the
  last stop ends near end_time; gated by `MIN_FILL_SLACK_MIN`, capped at
  `LATEST_ARRIVAL_MIN` 21:30 so evening windows don't schedule a 10 PM stop). Refactored
  to ONE shared clock authority `_clock_stops` used by both the builder's spread AND
  `retime` — so an edit re-clocks honouring the gaps (never collapses the spread) and a
  removed stop pulls the day earlier. Frontend: `explore_after_min` renders as a "free
  time to explore" row in Plan.tsx + SharedTrip.tsx. +10 tests (163 total); realism audit
  net-improved (38→35 violating itineraries).
- **2026-06-21 multi-city demos: San Antonio + San Francisco** (UNCOMMITTED) — added
  ~22 real independents per city to `seed.sql` (mirroring the NYC blocks: businesses →
  categories → reviews → deals; hours/views/aggregates/trust/verified-visits all run
  over ALL businesses, so the new cities get full parity automatically). One DB,
  radius-bounded search isolates each city; a **city picker** in LocationControl
  (`DEMO_CITIES` in `lib/location.ts`) moves the map centre. `warm.py` warms SA + SF.
  **Needs `migrate --reseed` to apply** (destructive prod-DB op — hand to the user). §3.

**REMAINING / suggested next:** real-quota Gemini key (#1 pre-competition — prod runs
ONLINE=true); **rotate credentials in Vercel env + local `.env` before sharing the
repo**; chain-detection gap (some apparel chains — Aéropostale, Jos A. Bank — aren't
in the registry, so they slip through in offline mode; add common retail chains);
deferred planner ideas (per-stop durations from prose like "2 hour read"; FULL Google
opening hours via an expanded Places field mask; drag-and-drop reorder; route
optimization / walking path line; passport-history personalization).

## 10. Known caveats / honest footnotes

- **Open-on-arrival is lightweight** (§14): real per-weekday hours exist only for
  SEEDED businesses; live Google results only expose "open now", so Google stops show
  "hours unknown". A FULL check needs an expanded Places field mask (higher billing
  tier) — deferred.
- **Trip distances in spread-out suburbs:** a walkable day caps legs at
  `MAX_FALLBACK_LEG_KM=3.0`; truly-far candidates are DROPPED with a "spread out" note
  rather than routed as a 5 km hike. With the budget-filter fix, close independents
  are found again, so this rarely triggers in practice. The planner stays WALKING-only.
- **Chains via the registry gap:** in offline mode (Gemini quota hit), only the brand
  registry catches chains; a few apparel chains aren't in it and can show as "likely
  local". Broader than the planner — a registry addition fixes it.
- Search distance is a UNIFORM driving estimate (haversine × 1.4) — can't reorder by a
  specific road detour; the planner stays on walking distance.
- 6 businesses intentionally photo-less (monogram tiles). Registry recall 0.849/FP 0 is
  a dev-set + CI floor, not a public %. `migrate --reseed/--fresh` wipes runtime
  activity; registry survives reseed.
- Verified-Visits caveats (§12): web `mock_location` always false; materialize trusts
  the client snapshot; retention purge is a manual CLI; category badges only count
  seeded businesses.
- Search.tsx / Plan.tsx are the largest components — work, refactor candidates.
- Custom `.vercel.app` URL gotcha: use `vercel domains add` (public) not `vercel alias
  set` (401). Bundle ~500KB gz (motion/react + maps) — fine for the demo.

## 11. Verification recipes (copy-paste)

```bash
cd backend
./.venv/bin/python -m pytest tests/ -q              # 154 backend tests
PYTHONPATH=. ./.venv/bin/python tests/realism_audit.py  # 104-scenario trip-realism audit
(cd ../frontend && npm test)                        # Vitest
(cd ../frontend && npm run build)                   # tsc -b + vite build
./.venv/bin/python -m app.db.migrate                # idempotent; --reseed | --fresh; applies additive ALTERs
./.venv/bin/python -m app.db.purge_checkpoints      # privacy: purge raw checkpoints past retention (§12)
ONLINE=false ./.venv/bin/uvicorn app.main:app --port 8001   # offline rehearsal
# planner v2:  POST /trips/plan {"lat":…,"lng":…,"interests":["Coffee","Bookstore","Restaurant","Retail"],
#                "start_time":"10:00","end_time":"16:00","num_stops":4,
#                "audience":"solo","occasion":"casual","pace":"relaxed","budget":2,"weekday":1}
#   → {options[{stops,total_walk_km,estimated_spend,sequence_note,spread_note,…}], knobs, num_stops, end_time, start, interpretation}
# retime:   POST /trips/retime {"start":{lat,lng,time},"end_time":"16:00","stops":[…],"dwell_overrides":{}}
# share:    POST /trips/{id}/share (auth) → {share_token}; GET /trips/share/{token} (public); GET /trips/share/{token}.ics
# sign-in:  POST /auth/google {"credential":"<google ID token>"} → 401 for a junk/expired token (real verify ran)
# search:   GET /businesses/search?q=coffee&lat=…&lng=…  ;  ?q=starbucks → 0 (chains filtered)
# verified: POST /visits/{initiate|{id}/checkpoint|{id}/qr}, GET /passport/me   (§12)
# report:   GET /analytics/business/1?metrics=summary&from=1990-01-01&to=1990-12-31 → zeros
```

Gate pattern: backend import OK → uvicorn boot → feature curls → pytest → frontend
tsc/build/vitest → both servers 200 → `grep -ci traceback` logs == 0 → leave servers
running → report → WAIT for "proceed".

## 12. Verified Visits (committed — `9ccea27`/`26f7bdf`)

Proof-of-presence before a review counts — LocalLens's **primary bot-prevention**
answer + the trust primitive behind passport / money-kept-local / trust-weighted
rating. Full doc: **`VERIFIED_VISITS.md`**.

**Schema** (additive): `visits` (state machine), `visit_checkpoints` (audit),
`qr_redemptions` (single-use), `businesses` + `geofence_radius_m`/`qr_secret`/
`google_place_id` (unique), `reviews.visit_id` (+partial-unique → verified). Config
§15 block (fence 100m, dwell 2min, max accuracy 75m, travel 900kmh, qr period 30s,
daily cap 2, retention 30d). **Backend** (router→service→repo): geofence.py /
antiabuse.py / qr.py (HMAC-TOTP 8-char codes) / qr_service.py / visits_service.py
(state machine: anti-abuse→geofence→dwell/code→finalize) / events.py / passport.py /
review_trust.py (verified 1.0× vs unverified 0.4×) + repositories/visits.py.
Methods/strength GPS_GEOFENCE 55 / GPS_GEOFENCE_DWELL 75 / QR_GEOFENCE 90 (the public
strength NUMBER was later hidden — it silently powers the trust rating).

**Review/check-in ANYWHERE:** Google businesses (`gp_<place_id>`) are **materialized**
into a local row on first review/visit from the on-screen snapshot (no Places call),
keyed by `google_place_id`, **excluded from search** (`fetch_active WHERE
google_place_id IS NULL`). **Endpoints:** `POST /visits/{initiate|{id}/checkpoint|
{id}/qr|{id}/spend}`, `GET /visits/{mine|{id}}`, `GET /passport/me`, `POST
/businesses/{id}/qr/enable` + `GET /businesses/{id}/checkin-code`, ref-based reviews.
**Frontend:** CheckInFlow (GPS+dwell hero modal; spend now asked in the review
composer, not the modal) / VerifiedRating (the toggle: flagship 4.5→3.9) /
TrustAdjustedRating / Passport / CheckinKiosk. **Privacy:** location only at check-in;
raw checkpoints purged after 30d; unverified reviews always allowed.

## 13. Google Sign-In (committed — `e5d617e`)

"Continue with Google" on Login + Register, alongside email/password (which stays the
offline-safe fallback). Full doc: **`GOOGLE_SIGNIN.md`**.

**Flow:** the button (Google Identity Services) returns a signed **ID token**; the
backend verifies it via Google's official **`tokeninfo`** endpoint (Google checks its
own signature + expiry over TLS — NO `cryptography` dep needed), then enforces the
checks only WE can: **audience == our client id** (replay defense) + **email_verified**.
Then `auth_service.google_login`: find by `oauth_sub` → else find by (verified) email
and **link** → else create a password-less account → issue **our normal JWT** (identical
session shape, so everything downstream is unchanged).

**Files:** `services/google_oauth.py`, `auth_service.google_login`, `POST /auth/google`,
`models/auth.GoogleLoginIn`, `config.google_oauth_client_id`; schema (nullable
`password_hash` + `auth_provider` + `oauth_sub` + unique index); frontend
`GoogleSignInButton.tsx`, `authApi.google`, `auth.loginWithGoogle`, Login/Register.
**Setup gotcha:** the OAuth client's **Authorized JavaScript origins** must include
every origin the button loads from (localhost:5173 + the two prod URLs); propagation
takes minutes. Client id is PUBLIC (ships in the page); no client secret in this flow.

## 14. Trip Planner v2 (committed — `66c94cf` + `1dcad82` + `abdc7bc`)

The "Plan a day" feature, overhauled from a one-shot generator into a controllable,
personal, realistic planner. Core in `services/trip_planner.py`; the `plan()` response
only ever GAINS fields (backward-compatible; anonymous output unchanged).

**Inputs (`PlanIn`):** `lat/lng`, `interests[]`, **`start_time` + `end_time` +
`num_stops`** (separate — replaced the old quick/half/full `duration` preset; the day
is bounded by the explicit window + count), `goals` (free text), and optional knobs
**`audience` {solo,couple,family,group}** / **`occasion` {casual,date,celebrate}** /
**`pace` {relaxed,normal,packed}** / **`budget` {1,2,3}=$/$$/$$$** / **`weekday`**
(0=Sun..6=Sat) / **`locked_refs[]`**. `optional_user` → personalises for a signed-in
user.

**Engine:**
- `_fetch_pools` runs the per-category searches **CONCURRENTLY** (`asyncio.gather`) —
  cold 5-category plan ~26s→~5s. Budget passes `price_levels` to the search (which now
  KEEPS price-unknown businesses, §5 — the fix for the 2-stops/chains bug).
- Tuning tables (commented constants): `AUDIENCE_PROFILES` / `OCCASION_MODIFIERS`
  (default day + dwell/sigma/prox_w multipliers, clamped), `PACE_DWELL_MULT`
  {relaxed1.4/normal1.0/packed0.7}, `ROLE_SPEND_BASE` (per-role $ floors by
  price_level → `_estimate_spend` "≈ $low–$high kept local"), `_BUDGET_PRICE_LEVELS`.
- `_plan_chips(num_stops, interests, default_chips=, preferred_sequence=)`: pads ONLY
  repeatable kinds (coffee/browse/shop/market) — **meals/desserts/bars are never
  duplicated** (no phantom 2nd lunch); when the user described a `sequence`, orders by
  `(sequence_index, time-of-day rank)` so the described order leads while realism
  windows still apply.
- `_build_stops(…, dwell_mult, weekday, hours_by_ref, locked_refs, favorite_refs,
  diag)`: greedy walkable fill (MAX_LEG_KM 1.5; **fallback leg capped at
  MAX_FALLBACK_LEG_KM=3.0 — beyond that the kind is DROPPED + `diag.spread_out`**, no
  more 9.7 km hikes); ROLE_EARLIEST_MIN windows; a soft open-at-arrival penalty;
  force-keeps `locked_refs`; a `FAVORITE_BONUS=1.25` on favourited refs; attaches a
  per-stop **`bench`** (2–3 same-kind alternates for instant offline swap); adds
  `arrive_min`. `_annotate_open` tags `open_at_arrival`/`hours_known`; `_attach_deals`
  attaches active deals (local id, or `gp_`→`place_ids_to_local_ids`).
- `retime(stops, …, dwell_overrides)`: pure, DB-free re-clock for an edited itinerary
  (the single authority for walk/dwell/window math; powers the client edits).
- `_sequence_note` / `_estimate_spend` / `_attach_deals`; offline keyword reader maps
  **"read"→Bookstore**; the meal guard still strips a phantom restaurant.

**New endpoints:** `POST /trips/retime`; `POST /trips/{id}/share` (auth → token),
`GET /trips/share/{token}` (public read-only, no user_id), `GET /trips/share/{token}.ics`
(`trip_export.to_ics`, hand-rolled VCALENDAR). `interpret_trip_goals` (llm.py) now also
returns `sequence`.

**Frontend (`Plan.tsx`, `SharedTrip.tsx`):** start/end time inputs + a Stops stepper +
a collapsible **Fine-tune** panel (Who's it for / Occasion / Pace / Budget / Which day,
all reuse the `Segmented` pill row); per-option **`estimated_spend`** + `sequence_note`
+ `spread_note`; an **editable** timeline (an `editedStops` copy; swap ♻ cycles the
bench, lock 🔒 toggles `lockedRefs` and the re-plan keeps them, − stay + adjusts dwell,
▲▼ reorder, ✕ remove, ＋ add — each calls `/trips/retime`); open-on-arrival + deal +
favourite badges per stop; saved-trip cards get **Share** (copies a `/trip/shared/:token`
link) + **Add to calendar** (`.ics`). `tripApi` gains `retime`/`share`/`sharedTrip`/
`icsUrl`; the plan call uses a 45s client timeout.

**Verify:** the §11 planner/retime/share curls; UI build clean; 154 pytest green
(incl. knobs, sequence, open-on-arrival, edit/retime, deals/favourites, and the
bug-fix regressions: far-leg drop, no-2nd-meal padding, read→bookstore, price-unknown
kept).
