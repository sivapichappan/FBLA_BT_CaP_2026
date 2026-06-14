# LocalLens v2 — Claude Code Build Specification

> **You are Claude Code. Build this application end to end.** This document is your complete brief: mission, scoring rubric, architecture, data model, API surface, feature acceptance criteria, design system, and build order. Build it to be **excellent in every category** — clean, modular, well-commented code; a production-grade API; a distinctive, accessible UI; and resilient behavior that never crashes on stage.
>
> **How to work:** Build in the phases defined in §21, in order. After each phase, ensure the app **runs with no errors** before continuing. Comment thoroughly and write readable, modular code — the human author must be able to explain *every line* live (see §18). Keep all secrets in environment variables; never hard-code keys.

---

## 1. Mission & product

**LocalLens** helps people discover and support small, independent local businesses — and helps those business owners reach customers. Its signature capability: it can **tell a genuine local business from a chain**, and *show its reasoning*, so a search for "coffee near me" surfaces the neighborhood cafe instead of the nearest Starbucks.

Two-sided product:
- **Diners/locals:** trustworthy, local-first discovery — ranked by genuine independence and quality, not ad spend — plus reviews, favorites, deals, and an AI concierge.
- **Business owners:** a free profile, deal posting, and an analytics dashboard the big platforms charge for.

---

## 2. The scoring rubric this build optimizes for (build rubric-aware)

This is an FBLA Coding & Programming competition entry. Every architectural decision should serve one or more of these scored lines. Optimize deliberately for the **"Exceeds"** band:

| Scored line | What "Exceeds" requires — design toward this |
|---|---|
| Language selection | Stack chosen for defensible, industry reasons (see §4 rationale). |
| Comments / naming / formatting | Logical, useful, complete comments; consistent naming; clean formatting. |
| Modular / advanced | Layered architecture (thin routers, logic-only services, isolated data access); demonstrates advanced technique (the detector, the empirical-Bayes ranker). |
| UX design + accessibility | Clear design rationale, coherent user journey, **WCAG AA** accessibility. |
| Intuitive / instructions | Obvious navigation; in-app help; clear empty/error states. |
| Navigation + **intelligent feature** | No nav/spelling errors + an interactive AI concierge (recommendations / Q&A). |
| Input validation | Validated on **both syntactic AND semantic** levels; friendly errors; never crashes. |
| Addresses all prompt parts | All six topic features (§8), each implemented well. |
| **Customizable report** | Owner analytics dashboard with **user-customizable** date-range + metric filters (§11). |
| Data storage | Relational schema, correct types, sensible scope, arrays/lists where appropriate (§6). |

The human presents slides + the live website (no code on screen), but the **source code is submitted and judged**, and the human must defend it in Q&A — so code quality and clarity are first-class deliverables, not afterthoughts.

---

## 3. Non-negotiable requirements & constraints

1. **Must run as a complete, self-contained application with no runtime errors.** Every external call is wrapped so a failure produces a friendly message or a fallback — **never an unhandled exception or an infinite spinner.**
2. **API-first, with graceful fallback.** The product uses live APIs for full functionality (business discovery, LLM concierge, geocoding). It also ships a **local cache + seed dataset + a deterministic concierge fallback** so the rehearsed demo flow works identically even if a call fails. (This is resilience, not an offline-only product — see §13.)
3. **All six topic features** (§8) fully working.
4. **A customizable report** (owner analytics dashboard, §11).
5. **An intelligent feature** (AI concierge, §10).
6. **Input validation on both syntactic and semantic levels** (§12).
7. **Clean, modular, thoroughly commented code** (§18).
8. **No secrets in the repo** (§15). Use `.env`; commit `.env.example` only.

---

## 4. Tech stack (with the rationale to defend it)

**Backend — Python 3.11+ / FastAPI**
- *Why:* ASGI **async I/O** lets one worker serve concurrent discovery + concierge requests without blocking; **Pydantic** gives declarative, type-safe request validation at the framework boundary (directly earns the validation line); FastAPI auto-generates an **OpenAPI** schema, so the API is self-documenting. Python's data ecosystem powers the detector and ranker.

**Database — PostgreSQL (Supabase)**
- *Why:* **ACID transactions** and **relational integrity** for user-generated data (reviews, favorites, deals). Review re-aggregation and deal redemption run **inside transactions** to prevent race conditions. Hosted, production-grade.

**Business discovery — Google Places API** (+ owner-added local businesses in Postgres, unified behind one interface)
- *Why:* live, nationwide coverage so the app works for a real business in any town — not a toy seed set.

**Geocoding / autocomplete — Google Geocoding + Places Autocomplete.**

**Maps — Google Maps JS via `@vis.gl/react-google-maps`** (custom numbered pins + bidirectional card↔pin hover sync).

**Intelligent feature — two-stage LLM** via an OpenAI-compatible endpoint (default **Groq**, `llama-3.1-8b-instant` for intent + `llama-3.3-70b-versatile` for the grounded reply), **with a deterministic local fallback** (rule/keyword intent classifier + empirical-Bayes ranker + templated NL) that activates if the LLM is unavailable.

**Frontend — React 18 + TypeScript + Vite + Tailwind CSS**
- *Why:* component model for a maintainable two-sided UI; TypeScript for compile-time safety; Vite for fast builds; Tailwind for a tokenized, consistent design system. Use the **Motion** library (`motion/react`) for orchestrated animation.

**Auth & security — JWT (Bearer), bcrypt password hashing, `slowapi` rate limiting.**

**Testing — `pytest`** (incl. the detector accuracy harness), **Vitest** for frontend units.

---

## 5. Repository structure

```
locallens/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app factory; mounts routers, middleware, exception handlers
│   │   ├── config.py               # settings from env (Pydantic BaseSettings); ONLINE flag, constants
│   │   ├── db/
│   │   │   ├── connection.py        # psycopg pool; transaction context manager
│   │   │   ├── schema.sql           # full DDL
│   │   │   └── seed.sql             # demo dataset (see §20)
│   │   ├── repositories/            # data access only — one module per aggregate
│   │   │   ├── businesses.py  reviews.py  deals.py  favorites.py  users.py  chat.py
│   │   ├── services/                # business logic — NO SQL, NO HTTP framework objects
│   │   │   ├── detector.py          # 10-signal chain detector
│   │   │   ├── intent.py            # local intent classifier (8 buckets) — also the LLM fallback
│   │   │   ├── ranker.py            # intent-weighted empirical-Bayes ranker
│   │   │   ├── concierge.py         # orchestrates: intent → fetch → rank → reply (LLM or template)
│   │   │   ├── places.py            # Google Places client + local-DB unification + response cache
│   │   │   └── analytics.py         # owner dashboard aggregations
│   │   ├── models/                  # Pydantic request/response schemas (validation lives here)
│   │   ├── routers/                 # thin HTTP layer
│   │   │   ├── auth.py  businesses.py  reviews.py  deals.py  favorites.py  ai.py  analytics.py
│   │   ├── middleware/              # JWT auth dependency, rate limiting, global exception handler
│   │   └── cache/                   # on-disk JSON cache of API responses for the demo path
│   ├── tests/
│   │   ├── test_detector.py         # accuracy harness → confusion matrix + precision/recall/F1
│   │   ├── labeled_businesses.json  # ~120–150 hand-labeled rows (chain/local)
│   │   └── test_*.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx  App.tsx
│   │   ├── routes/                  # Search, BusinessDetail, Favorites, Deals, Concierge,
│   │   │                            #   Profile, Settings, Owner (Dashboard/AddBusiness/PostDeal)
│   │   ├── components/              # BusinessCard, MapView, ConciergeWidget, SignalBreakdown,
│   │   │                            #   VsGoogleToggle, StarRating, PriceLevel, FilterBar, ...
│   │   ├── lib/                     # api client, auth context, hooks, formatters
│   │   ├── styles/                  # tokens.css (design system), tailwind.config
│   │   └── types/                   # shared TS types mirroring the API
│   ├── index.html  vite.config.ts  tailwind.config.ts
│   └── .env.example
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md              # + diagram
│   ├── DATA_MODEL.md                # + ER diagram
│   └── ATTRIBUTION.md               # libraries + APIs + licenses
└── run.sh / run.bat                 # boot backend + serve frontend build, open browser
```

**Layering rule (enforce it):** routers parse/validate input and call services; services hold all logic and call repositories; repositories own all SQL. No SQL outside `repositories/`. No business logic in routers.

---

## 6. Data model (PostgreSQL)

Full DDL in `schema.sql`. Use correct types, foreign keys, and indexes. Constraints below double as semantic validation.

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  default_lat   DOUBLE PRECISION,
  default_lng   DOUBLE PRECISION,
  trust_score   INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL DEFAULT 'user'    -- CHECK (role IN ('user','owner','admin'))
                CHECK (role IN ('user','owner','admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  lat              DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng              DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  phone            TEXT,
  price_level      SMALLINT CHECK (price_level BETWEEN 1 AND 4),
  is_independent   BOOLEAN,
  local_confidence REAL CHECK (local_confidence BETWEEN 0 AND 1),
  average_rating   REAL NOT NULL DEFAULT 0,
  review_count     INTEGER NOT NULL DEFAULT 0,
  owner_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE business_categories (          -- many-to-many junction
  business_id BIGINT REFERENCES businesses(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (business_id, category_id)
);

CREATE TABLE reviews (
  id            BIGSERIAL PRIMARY KEY,
  business_id   BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)             -- one review per user per business
);

CREATE TABLE deals (
  id               BIGSERIAL PRIMARY KEY,
  business_id      BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  discount_pct     SMALLINT NOT NULL CHECK (discount_pct BETWEEN 1 AND 100),
  per_user_limit   INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit >= 1),
  total_limit      INTEGER CHECK (total_limit >= 1),
  redemption_count INTEGER NOT NULL DEFAULT 0,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  CHECK (ends_at > starts_at)               -- semantic rule enforced at the DB
);

CREATE TABLE deal_redemptions (
  id        BIGSERIAL PRIMARY KEY,
  deal_id   BIGINT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE favorites (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_ref  TEXT NOT NULL,              -- local id or Google place id (gp_...)
  snapshot_json JSONB NOT NULL,             -- denormalized; survives source deletion
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_ref)
);

CREATE TABLE chat_sessions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reviews_business ON reviews(business_id);
CREATE INDEX idx_deals_business   ON deals(business_id);
CREATE INDEX idx_bizcat_category  ON business_categories(category_id);
```

**Data-structure notes the human will reference in Q&A:** a business's categories = a **list** from the junction; search/concierge results = a **ranked list (array)**; the detector's per-signal output = a **list of `{signal, value, weight}` objects**; the concierge context = a **list of the last 10 messages**. **Scope:** module-level constants (brand list, intent→weight maps, smoothing constants, distance σ) are defined once and shared read-only; per-request data (query, results, scores) stays request-scoped.

---

## 7. API surface

All write routes validate with Pydantic (§12) and return friendly `422` on bad input. Protected routes require a valid JWT. Apply rate limits (auth: 5 / 15 min; search: 30 / min; general: 100 / 15 min).

**Auth** — `POST /auth/register`, `POST /auth/login` (5-attempt lockout, 15-min), `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/change-password`, `POST /auth/change-email`, `DELETE /auth/account`.

**Businesses** — `GET /businesses/search` (query; filters: radius, category[], min_rating, price_level, open_now, independent_only; sort: best_match|distance|rating|reviews; returns ranked list with `local_confidence` + badge), `GET /businesses/{ref}` (local id or `gp_…`), `GET /businesses/{ref}/signals` (the 10-signal breakdown for the glass-box popover), `POST /businesses` (owner/admin), `PATCH /businesses/{id}` (owner/admin), `GET /businesses/categories`, `GET /businesses/autocomplete`, `GET /businesses/geocode`.

**Reviews** — `GET /businesses/{id}/reviews` (sort: recent|rating_high|rating_low|helpful; paginated), `POST /businesses/{id}/reviews` (transactional re-aggregation of avg + count), `PATCH /reviews/{id}`, `DELETE /reviews/{id}`, `POST /reviews/{id}/helpful`.

**Favorites** — `GET /favorites`, `POST /favorites`, `DELETE /favorites/{ref}`.

**Deals** — `GET /deals` (geo-active), `GET /businesses/{id}/deals`, `POST /deals` (owner), `PATCH /deals/{id}` (owner), `POST /deals/{id}/redeem` (atomic — see §8.5).

**AI concierge** — `POST /ai/chat` (`{message, session_id?}` → `{reply, businesses[], session_id}`), `GET /ai/sessions/{id}`.

**Analytics (owner)** — `GET /analytics/business/{id}?from=&to=&metrics=` (customizable report — see §11), `GET /analytics/deal/{id}`.

---

## 8. Core features + acceptance criteria (the six topic requirements)

**8.1 Sort by category.** Multi-select category filter; filter state serialized to the URL (shareable/reloadable). *Done when:* selecting "food" + "services" filters results and the URL reflects it.

**8.2 Reviews & ratings.** Authenticated CRUD; each write **recomputes `average_rating` + `review_count` inside one transaction**. *Done when:* posting/editing/deleting a review updates the business aggregate atomically and one user can't review the same business twice.

**8.3 Sort by reviews/ratings.** Sort modes incl. rating and review count, using **empirical-Bayes smoothing** so low-sample outliers don't top the list. *Done when:* a 4.9★ / 5-review place ranks below a 4.6★ / 400-review place under "rating."

**8.4 Save/bookmark favorites.** Save a local *or* Google business; store a **denormalized snapshot** so it survives deletion. *Done when:* favoriting works for both sources and a removed business still renders from the snapshot.

**8.5 Deals/coupons.** Owners post deals; users redeem with a generated hex code. **Double-redemption is impossible by design:** redeem inside a transaction with `UPDATE deals SET redemption_count = redemption_count + 1 WHERE id = $1 AND (total_limit IS NULL OR redemption_count < total_limit) RETURNING id;` plus a per-user check. *Done when:* concurrent redeems never exceed the limit.

**8.6 Anti-bot verification.** bcrypt hashing + **5-attempt account lockout (15-min)** + `slowapi` rate limiting; demoable live. *Done when:* the 6th failed login is locked out and rapid requests are throttled.

---

## 9. Differentiators

**9.1 Chain-vs-local detector (`services/detector.py`).** Fuse 10 independent signals — known-brand list (~800 brands, fuzzy/multi-pass match handling store numbers & possessives), locator subdomains, toll-free phone, name patterns, possessive/"The X" personal names, Google editorial-summary language, per-type priors, **review-volume vs a type-specific baseline** (a 600-review coffee shop is normal; a 600-review bakery is suspicious), rating distribution, and city-in-name — into a weighted score in `[-1, +1]`, map to a probability, and **gate on confidence** so a single weak signal can never exclude a real local. Return a per-signal breakdown.

**9.2 Accuracy harness (`tests/test_detector.py`).** Run the detector over `labeled_businesses.json` (~120–150 hand-labeled rows) and print a **confusion matrix + precision / recall / F1**. The README cites the *measured* numbers. **No accuracy claim may appear anywhere without this test backing it.**

**9.3 Intent-weighted ranker (`services/ranker.py`).** Score candidates across 8 factors (distance, rating, review count, independence, customer-facing, price fit, category match, open-now), **re-weighted per detected intent** (e.g., `OPEN_NOW` ×5 open-status; `CHEAP_BUDGET` ×4 price; `SUPPORT_LOCAL` ×4 independence) then renormalized. Apply **empirical-Bayes rating smoothing** `score = (n/(n+m))·avg + (m/(n+m))·c` (c≈3.7, m≈15) and **Gaussian distance decay** `exp(-d²/(2σ²))` (σ≈2 km). Comment the math.

**9.4 Glass-box popover (frontend `SignalBreakdown`).** Clicking a business reveals the 10 signals, their values/weights, and the resulting probability + confidence band. Turns the model into something a judge can interrogate.

**9.5 "LocalLens vs Google" toggle (`VsGoogleToggle`).** One control re-runs the same query showing (a) raw proximity/popularity order vs (b) LocalLens's local-first ranking — the signature 20-second demo moment.

---

## 10. Intelligent feature — the AI concierge (`services/concierge.py`)

Three stages, **online-first with a deterministic fallback**:

1. **Intent classification.** Online: a fast LLM classifies the message into 8 intents and extracts query terms / price. Offline/fallback: `services/intent.py` does keyword/regex routing into the same 8 buckets. Either way the output schema is identical.
2. **Fetch + rank.** Pull candidates (Places + local DB), then rank with `services/ranker.py` (pure, deterministic, always local).
3. **Reply.** Online: a larger LLM writes a grounded reply with a strict "recommend ONLY from the provided businesses — never invent one" system prompt. Fallback: a **templated** reply populated from the ranked rows (`"3 budget-friendly lunch spots near you, all independent: …"`).

Persist sessions/messages; use a last-10-message context window. Return clickable business cards alongside the text. **The concierge must never hang or hallucinate a business** — on any LLM error, fall through to the deterministic path silently.

---

## 11. Owner side — incl. the customizable report

- **Add/edit business** (`routes/owner/AddBusiness`): form with full validation; writes business + categories + hours in one transaction.
- **Post/manage deals** (`routes/owner/PostDeal`): validated deal form.
- **Analytics dashboard (`routes/owner/Dashboard`) — this is the scored "customizable report."** A single screen the owner **customizes**: a **date-range picker** and a **metric multi-select** (avg rating, review count, favorites, deal claims/redemptions, rating distribution, review trend). Charts and a table re-render from the user's selection, and the view is **exportable** (CSV/print). *Done when:* changing the date range or selected metrics visibly recomputes the report. This single feature is worth ~10 points — do not cut it.

---

## 12. Input validation (syntactic + semantic)

Every write route uses a Pydantic model. Validate **both** levels and return a friendly, specific `422`:
- **Syntactic (format/type):** `lat ∈ [-90,90]`, `lng ∈ [-180,180]`, `rating` integer `∈ [1,5]`, `discount_pct ∈ [1,100]`, review body non-empty & ≤ 2000 chars, well-formed email, valid timestamps.
- **Semantic (meaning/rules):** a validly-typed coordinate **outside the served region**; `ends_at` **not after** `starts_at`; `total_limit` below current `redemption_count`; a duplicate review. Provide messages a human understands ("Discount must be between 1 and 100%"), never a raw stack trace.

---

## 13. Resilience & error handling (so it never crashes on stage)

- **Global exception handler:** catches anything uncaught, logs the traceback server-side, returns a clean `500` with a friendly client message. No stack trace ever reaches the UI.
- **Per-call fallback:** wrap every external call (Places, LLM, geocode) in try/except. On failure → serve from the on-disk cache or seed data; the concierge falls to its deterministic path. A network hiccup is invisible to the demo.
- **Demo cache:** a small CLI (`backend/app/cache/warm.py`) pre-fetches and stores API responses for the **rehearsed demo queries/city** so the scripted flow is instant and reliable regardless of connectivity.
- **Frontend:** skeleton loaders, request timeouts with retry, friendly empty/error states, error boundaries on every route. Never an infinite spinner.

---

## 14. UI/UX design system (distinctive, editorial, accessible)

**Aesthetic direction:** warm editorial — premium, calm, "printed-magazine" feel. Deliberately **no gradients, no generic SaaS look**. Commit fully.

**Design tokens (`styles/tokens.css`, mirrored in Tailwind):**
```
--cream:      #FBF7F0;   /* app background */
--surface:    #FEFCF8;   /* cards */
--ink:        #1F1B16;   /* primary text (warm near-black) */
--ink-soft:   #5A5247;   /* secondary text */
--rust-600:   #B4451F;   /* accent: large/decorative */
--rust-700:   #8F3415;   /* accent: text & icons (AA on cream) */
--verified:   #4F6B4A;   /* "verified local" badge (forest) */
--chain:      #9A958C;   /* "chain" badge (muted) */
--border:     #E8E0D4;   /* warm hairline borders */
--shadow:     0 8px 24px rgba(80,50,20,0.08);  /* warm, soft */
```
- **Type:** **Fraunces** (variable display — high optical contrast) for headings; **Source Serif 4** for body; a small mono only for codes/IDs. (No Inter/Roboto/system fonts.)
- **Layout:** generous negative space, a clear single primary action per screen, asymmetric editorial composition where it helps.
- **Texture/depth:** a very low-opacity paper-grain overlay for atmosphere; warm-tinted soft shadows (never flat gray).
- **Motion (`motion/react`):** one orchestrated page-load with **staggered fade-up reveals** (animation-delay); smooth card/pin hover; respect **`prefers-reduced-motion`** (disable all motion when set).

**Signature interactions:** (1) the vs-Google toggle; (2) the glass-box signal popover; (3) bidirectional map↔card hover-sync with badge-colored numbered pins.

**Accessibility (WCAG AA — additive, doesn't dilute the look):** body text contrast **≥ 4.5:1** (use `--rust-700` for text); full keyboard navigation with visible focus rings; `Enter`/`Space` activate cards; ARIA roles/labels on map, search, concierge, and cards; `aria-live` on the concierge reply; alt text on all imagery; semantic HTML and ordered headings.

**Pages:** Search (map + ranked list), Business detail (with reviews + signal popover), Concierge, Favorites, Deals, Profile, Settings, and the Owner area (Dashboard / Add Business / Post Deal). Auth-gated pages show a sign-in prompt, not an error.

---

## 15. Security

- All secrets in env vars; commit only `.env.example`. Never log secrets. Add a strict `.gitignore`.
- JWT Bearer auth; bcrypt password hashing; per-route rate limiting.
- Proxy the Google Maps photo/key through the backend so the key isn't exposed client-side.
- Parameterized SQL everywhere (no string interpolation).

---

## 16. Testing

- `pytest`: the detector accuracy harness (confusion matrix + P/R/F1), the ranker (smoothing/decay behavior), validation (rejects garbage), and the deal-redemption limit (no over-redemption under concurrency).
- Vitest: critical components (BusinessCard, FilterBar, ConciergeWidget) and the api client.
- A `make test` / script target that runs both.

---

## 17. Documentation deliverables (required by the competition)

- **README.md** — what it does, the problem, **how to run** (env setup + `run.sh`), feature list mapped to the six topic bullets, the **measured** detector accuracy, and a clean security section.
- **ARCHITECTURE.md** — request flow (React SPA → FastAPI → services → Postgres / Places / LLM, with the fallback path) + a diagram.
- **DATA_MODEL.md** — the schema + an ER diagram.
- **ATTRIBUTION.md** — every library and API with purpose + license (FastAPI, Pydantic, Uvicorn, psycopg, slowapi, bcrypt, React, Vite, Tailwind, Motion, @vis.gl/react-google-maps, Google Maps/Places, the LLM provider, SQLite if used for cache).

---

## 18. Coding standards (scored — and the human must defend every line)

- **Comments** that explain *why*, not just *what*, especially for the detector signal fusion, the empirical-Bayes math, the intent re-weighting, and every transaction. Logical, useful, complete.
- **Naming:** descriptive, consistent; each variable does one job; correct data types.
- **Modularity:** the §5 layering strictly enforced; small focused functions; no dead code (e.g., `helpful_count` has a working endpoint; no unused params).
- Format with Black (Python) + Prettier (TS). No commented-out junk, no TODOs left in submitted code.

---

## 19. Environment variables (`.env.example`)

```
# Backend
DATABASE_URL=postgresql://...            # Supabase Postgres
JWT_SECRET=change-me
GOOGLE_MAPS_API_KEY=...
LLM_API_KEY=...                          # Groq or any OpenAI-compatible provider
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_INTENT_MODEL=llama-3.1-8b-instant
LLM_REPLY_MODEL=llama-3.3-70b-versatile
ONLINE=true                              # set false to force the deterministic/cached path
# Frontend
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_MAPS_API_KEY=...
```

---

## 20. Seed data (`seed.sql`)

Seed for a believable demo + the fallback path: ~30–50 real-feeling local businesses across food/retail/services in **one demo city**, each with categories, hours, 3–10 reviews, and a few **active** deals; plus **two demo accounts** — `demo_user` and `demo_owner` (who owns 2–3 of the businesses). Use this same set as the cache fallback so the scripted demo never depends on a live call.

---

## 21. Build order (build in this sequence; verify each phase runs before the next)

**Phase 0 — Skeleton.** Repo structure; FastAPI app factory + health check; Vite/React/Tailwind shell with tokens + fonts; Postgres connection; `schema.sql` + `seed.sql` applied; `run.sh`. *Gate: app boots, DB seeded, frontend renders.*

**Phase 1 — Minimum Viable Product (the safety floor).** Auth (register/login/lockout); business search (Places + local, ranked) with the FilterBar + MapView; reviews CRUD with transactional aggregation; favorites; deals + redemption; **validation on every write**; the concierge (deterministic path first). *Gate: all six topic features work end to end with no errors.*

**Phase 2 — Differentiators.** Chain detector + the accuracy harness (confusion matrix); intent-weighted ranker wired into search + concierge; the LLM concierge layered on top of the deterministic fallback; the glass-box signal popover; the vs-Google toggle. *Gate: tests pass; detector accuracy is measured, not asserted.*

**Phase 3 — Owner side + customizable report.** Add-business + post-deal forms; the analytics dashboard with date-range + metric filters + export. *Gate: changing filters recomputes the report.*

**Phase 4 — Polish.** Accessibility pass (contrast, keyboard, ARIA, reduced-motion); motion/staggered reveals; skeletons + error boundaries + empty states; the demo-cache warmer; docs (README, ARCHITECTURE, DATA_MODEL, ATTRIBUTION). *Gate: full AA pass; runs clean with `ONLINE=false`.*

---

## 22. Definition of done (final checklist)

- [ ] Boots and runs end to end with **zero unhandled errors**; every external call has a fallback.
- [ ] All six topic features work; the correlation is documented in the README.
- [ ] Intelligent concierge works online **and** via the deterministic fallback; never hallucinates a business.
- [ ] Owner analytics dashboard is **user-customizable** (date range + metrics) and exportable.
- [ ] Validation is syntactic **and** semantic on every write, with friendly errors.
- [ ] Detector accuracy is **measured** (confusion matrix in tests; numbers in README).
- [ ] Deal redemption cannot exceed limits under concurrency.
- [ ] UI hits WCAG AA; the editorial design system is applied consistently.
- [ ] Code is modular, thoroughly commented, consistently named; tests pass.
- [ ] No secrets in the repo; `.env.example` only; docs complete (README, ARCHITECTURE, DATA_MODEL, ATTRIBUTION).
