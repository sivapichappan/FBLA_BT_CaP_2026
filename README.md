# LocalLens

**Find the local spot, not the chain.**

LocalLens is a two-sided local-business discovery platform. For consumers, it surfaces genuine
independent businesses — ranked by local character and quality, not ad spend — with search,
reviews, favorites, deals, a trip planner, and an AI concierge. For business owners, it offers a
free listing, deal posting, a cashier code-verification mode, and a customizable analytics
dashboard with a conversion funnel.

Its signature capability: LocalLens shows **only small, independent businesses — everywhere,
always**. Every search runs a three-gate filter: a persistent **chain registry** (509 curated
brands, plus every chain the system has ever caught) drops known chains for free; everything
unknown gets **one batched Gemini audit** against a strict definition (corporate chains and
franchises out; a beloved local with a handful of same-city locations stays in); and every new
conviction is **learned** — written back to the registry so the next search, in any city, blocks
it instantly. A "why this verdict?" panel shows exactly which gate decided and why. Search
"coffee" on a typical map app and you get Starbucks; here, Starbucks cannot appear.

Built for the FBLA Coding & Programming 2025–26 topic, **"Byte-Sized Business Boost."**

---

## The six topic requirements → where they live

| Topic requirement | Implementation |
|---|---|
| Sort businesses by category | Category chip filters on Search (`FilterBar`), backed by a relational categories taxonomy |
| Leave reviews or ratings | Full review CRUD; each write recomputes the business's average **inside one transaction**; owners can post one public reply per review |
| Sort by reviews or ratings | Sort modes incl. rating with **empirical-Bayes smoothing** (a 4.9★/5-review spot ranks below a 4.6★/400-review one) |
| Save or bookmark favorites | Dual-source favorites (local DB or Google Places) with a denormalized snapshot that survives deletion |
| Display special deals or coupons | Owner-posted deals; users redeem for codes; **race-proof** redemption caps (`SELECT … FOR UPDATE` + guarded increment); owners verify and consume codes at the counter (cashier mode) |
| Verification step to prevent bot activity | bcrypt password hashing + JWT auth + per-IP rate limiting + **5-attempt / 15-minute account lockout** |

**Intelligent feature:** the AI concierge — LLM intent classification → deterministic intent-weighted
ranking → grounded LLM replies that can only recommend businesses from real data, with a fully
deterministic fallback when offline.

## Beyond the brief

- **Vibe (semantic) search** — describe a feeling ("old New York atmosphere") instead of a
  keyword. Businesses get a 768-dimension embedding profile; the query embeds once and matches by
  cosine similarity via **pgvector**, and live Google results are embedded on the fly (batched,
  cached per place) so it works in any city, not just the seeded one.
- **Hybrid classic search** — keyword matching plus one gated semantic pass for multi-word queries
  ("fresh pasta" finds the pasta shop whose name never says "pasta"), unified with
  classifier-verified live Google results.
- **A minimum of 10 results, honestly** — when an area is sparse, the search circle widens
  automatically (up to Google's 50 km cap) until at least 10 small businesses are found, and the
  UI says so ("Widened the search to 20 km…") instead of showing an empty page.
- **Small-business trip planner** — pick a duration and interests, get a walkable, time-blocked
  itinerary built **only from independents by construction** (the candidate pool comes from the
  chain-free search pipeline), with greedy nearest-good-neighbor routing, walking times, an AI
  narration (deterministic fallback offline), and save/revisit for signed-in users.
- **"For you" picks** — content-based recommendations with an explainable reason string
  ("Because you saved 3 bookstore spots"); no black box.
- **AI review summaries** — a cached two-sentence "what people love here" digest, grounded only in
  that business's actual reviews; hidden (never hallucinated) when the LLM is unreachable.
- **Owner analytics with a funnel** — views → favorites → redemptions with step-conversion
  percentages, date-range + metric customization, CSV export, and print.
- **Trust scoring** — contributions earn a visible reputation (review +10, redemption +5,
  favorite +2; deletions reverse it; floored at 0; level = score ÷ 50 + 1), applied in the **same
  transaction** as the action so the score can't drift.
- **Photos with smart cropping and smart fallbacks** — Google photos are proxied through the
  backend (the key never reaches the client), and each stored photo's **focal point** is computed
  once at enrich time (edge-energy analysis with Pillow) so card crops keep the storefront sign or
  the food in frame instead of blindly center-cropping; offline or missing photos render an
  editorial monogram tile, never a broken-image icon.
- **Location switcher** — search any city (geocoded), use the device location, or snap back to the
  NYC demo center; every page follows instantly.
- **Dark mode** — a warm "paper at night" token set, AA-checked, persisted, defaulting to the OS
  preference; the map re-themes with it.

---

## How the chain filter works — and what's measured

Three gates, cheapest evidence first:

1. **Chain registry** (Postgres `chain_registry`): 509 curated brand names matched with a 4-pass
   fuzzy matcher ("Starbucks #4271 - Downtown" → starbucks), plus every chain the AI has ever
   convicted. Free and instant.
2. **Gemini audit**: all remaining unknowns go out in **one batched call** with a strict
   definition and an explicit uncertainty rule — *if unsure, answer "small"*. Verdicts are cached
   per place for 30 days, so repeat searches cost zero AI calls.
3. **Learning**: high-confidence chain verdicts are written back to the registry; the system gets
   cheaper and stronger with every search, in every city.

What we claim is exactly what we measure. The **registry layer** is validated by an automated
harness over **156 hand-labeled real businesses**
([backend/tests/labeled_businesses.json](backend/tests/labeled_businesses.json)): it currently
catches **62 of 73 chains (recall 0.849) with zero false positives**, and the test FAILS if recall
ever drops below 0.80 or a single independent is wrongly matched. The Gemini layer's behavior
(uncertainty handling, malformed-response safety, learning gates) is pinned by unit tests with
canned responses — we describe it, we don't quote an unmeasured percentage for it. Reproduce:

```bash
cd backend && python -m pytest tests/test_classifier.py -v -s   # prints the harness
```

False positives are the error we engineer hardest against: hiding a genuine independent is the
one failure this product can't accept, so uncertainty always resolves to *show the business* —
including when the AI is unreachable (unknowns appear badged "likely local" instead of vanishing).

---

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python 3.12 + FastAPI** | ASGI async I/O serves concurrent discovery + concierge requests without blocking; **Pydantic** gives declarative, type-safe validation at the framework boundary; auto-generated OpenAPI schema |
| Database | **PostgreSQL (Supabase) + pgvector** | ACID transactions and relational integrity; review aggregation and deal redemption run inside transactions to prevent race conditions; pgvector adds cosine-similarity search over business embeddings |
| Frontend | **React 18 + TypeScript + Vite + Tailwind** | Component model for a two-sided UI; compile-time type safety; tokenized design system (which is also what makes dark mode a 20-line change) |
| Discovery | **Google Places API (New)** + owner-added local businesses | Live nationwide coverage, unified behind one canonical shape |
| AI | **Gemini** via its OpenAI-compatible endpoint | Provider-agnostic `LLM_*` config; the chain-vs-small audit, concierge, summaries, and trip narration via chat; `gemini-embedding-001` (768 dims) for semantic search; graceful degradation if unavailable (registry keeps filtering, unknowns shown honestly) |
| Maps | Google Maps JS via `@vis.gl/react-google-maps` | Custom numbered pins, bidirectional card↔pin hover sync |

Architecture is strictly layered — routers (HTTP) → services (logic) → repositories (SQL) — with
no SQL outside `repositories/` and no business logic in routers. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

---

## Running it

Prerequisites: Python 3.11+, Node 18+, a PostgreSQL database (Supabase works), and API keys for
Google Maps Platform (Places + Geocoding + Maps JS) and an LLM provider (Gemini by default).

```bash
# 1) Configure secrets (never committed)
cp backend/.env.example backend/.env      # set DATABASE_URL, JWT_SECRET, GOOGLE_MAPS_API_KEY, LLM_API_KEY
cp frontend/.env.example frontend/.env    # set VITE_GOOGLE_MAPS_API_KEY

# 2) One-command boot (creates venv, installs deps, migrates + seeds, starts both servers)
./run.sh
```

Backend: `http://localhost:8000` · Frontend: `http://localhost:5173`

Demo accounts (seeded):

| Account | Login | What it shows |
|---|---|---|
| Consumer | `demo@locallens.app` / `demodemo` | Reviews, favorites, redemptions, trust level, saved trip |
| Owner | `owner@locallens.app` / `ownerowner` | Owns five NYC businesses; dashboard, deals, cashier mode, replies |
| Admin | `admin@locallens.app` / `adminadmin` | Can edit any listing, reply anywhere, verify any code |

Useful commands:

```bash
cd backend
python -m app.db.migrate            # apply schema; seed if empty (--reseed to refresh, --fresh to wipe)
python -m app.db.enrich             # fetch photos + compute embeddings for seeded businesses
python -m app.cache.warm            # pre-fetch demo queries (searches, geocodes, vibes, a trip plan)
python -m pytest tests/ -v -s       # full backend suite incl. the accuracy harness
ONLINE=false uvicorn app.main:app   # force the deterministic/cached path (network-free demo)

cd frontend
npm test                            # Vitest component/client unit tests
```

---

## Resilience (it must never crash on stage)

- Every external call (Places, Geocoding, LLM, embeddings) is failure-wrapped: on any error it
  serves the on-disk cache or seeded data — never an exception, never an infinite spinner.
- The concierge and trip narration fall from LLM → deterministic template **silently**; each reply
  is labeled "✦ AI" or "⚙ offline mode" in the UI. Review summaries hide rather than hallucinate;
  vibe search shows a calm "unavailable offline" notice.
- The chain filter degrades, never dies: with the AI unreachable, the registry (509 brands + every
  learned chain) keeps filtering, and unverifiable businesses are SHOWN with a "likely local"
  badge — uncertainty never hides a real independent.
- `ONLINE=false` forces the entire offline path for rehearsal.
- Frontend: request timeouts (15 s), route-level error boundaries, skeleton loaders, photo→monogram
  fallbacks, and friendly empty/error states throughout.

## Security

- Secrets live in environment variables only; the repo ships `.env.example` templates.
- bcrypt (cost 12) password hashing; JWT bearer auth; parameterized SQL everywhere.
- Per-IP rate limiting plus per-account lockout (5 failed logins → 15-minute lock).
- The Google photo fetch is proxied through the backend so the server key never reaches the client;
  the browser Maps key should be referrer-restricted in Google Cloud Console.
- Cashier mode never leaks other businesses' data: a code for a business you don't own reads as
  `not_found`, indistinguishable from a typo.

## Accessibility

WCAG AA targets: ≥4.5:1 body-text contrast in **both themes** (light and dark palettes are each
contrast-checked), full keyboard navigation with visible focus rings, a skip-to-content link,
semantic landmarks and per-page titles, ARIA labels on interactive elements (toggles use
`aria-pressed`, disclosures `aria-expanded`), `aria-live` on concierge replies, and
`prefers-reduced-motion` disables all animation. Dark mode defaults to `prefers-color-scheme`.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — request flow, layering, fallback paths
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — schema, ER diagram, data-structure notes
- [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md) — every library and API, with licenses

The previous iteration of this project (vanilla-JS frontend, earlier backend) is preserved
unmodified in [legacy/](legacy/).
