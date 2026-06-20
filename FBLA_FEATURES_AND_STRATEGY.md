# LocalLens — Complete Feature Inventory & FBLA Nationals Strategy

> Working document for taking LocalLens from "a solid app" to a finals-competitive
> FBLA Coding & Programming entry. Built from a full code audit + the official
> 2025–26 FBLA competitive-event guidelines.

**Depth legend:** ◆ genuinely novel · ● solid / well-executed · ○ table-stakes (any CRUD app has it)

---

## Part 0 — The most important finding: you're already on-topic

The repo name `FBLA_BT_CaP_2026` decodes to **FBLA Business Technology, Coding & Programming, 2026.** The official **2025–26 Coding & Programming topic, "Byte-Sized Business Boost,"** asks competitors to:

> *"Use your programming skills to build a tool that helps users discover and support small, local businesses in their community."*

Required feature bullets (per the guideline) and how LocalLens already hits each:

| Topic requirement | Where you built it |
|---|---|
| Sort businesses by category | Search category filters, `/businesses/categories` |
| Leave reviews / ratings | `routes/reviews.py` (full CRUD) |
| Sort by reviews / ratings | Ranking + sort modes in `/businesses/search` |
| Bookmark / save favorites | `routes/favorites.py` (dual-source) |
| Display special deals / coupons | `routes/deals.py` + Deals page |
| **Verification step to prevent bot activity** | **Verified Visits** (proof-of-presence: GPS geofence + dwell-time, hardened with a rotating QR/counter code — all server-validated against GPS spoofing, impossible-travel, mock-location, replay, and farming). A bot at a keyboard physically cannot produce one. Layered on top of JWT auth + slowapi rate limiting + bcrypt 5-attempt lockout. See **`VERIFIED_VISITS.md`**. |
| *Intelligent feature (Q&A / recommendations / smart filters)* | **The Groq LLM concierge — this is the rubric's exact named example** |

**Event format (verify against the official PDF):** live, two-round **presentation** event — 3-min setup, **7-min presentation, 3-min Q&A** — team of 1–3, **110-point** rating sheet. No projector/power in prelims (battery only), and conference Wi-Fi is officially *"unreliable."*

> ⚠️ **One thing to confirm immediately with your adviser / the official guideline PDF:** sources disagree on whether 2025–26 Coding & Programming also has a **prejudged program-URL** component (a separate ~200-pt sheet) in addition to the live presentation. If it does, a **publicly viewable, bug-free hosted URL** becomes mandatory (this is why your Vercel deploy + working credentials matter). Treat "the deployed app must work on its own URL" as in-scope until you've confirmed otherwise. Official PDF: <https://connect.fbla.org/headquarters/files/High%20School%20Competitive%20Events%20Resources/Individual%20Guidelines/Presentation%20Events/Coding-and-Programming.pdf>

**Why this matters:** you are not adapting a generic app to a rubric. You're sitting on a topic-perfect build. The work now is *surfacing* the depth you already have, *closing* a few credibility gaps, and *rehearsing* a demo that can't fail.

---

## Part 1 — Complete Feature & Function Inventory

### 1.1 Authentication & Accounts (`routes/auth.py`, `middleware/`, `jwt_utils.py`)

| Feature | Depth | What it does |
|---|---|---|
| Register | ○ | Create account; bcrypt hash; auto-generates unique username |
| Login **with lockout** | ● | 5 failed attempts → 15-min account lock (anti-brute-force) |
| JWT auth middleware | ● | `get_current_user` validates Bearer token; proper 401 vs 403 |
| Get / update profile | ○ | Profile fields, default location, trust score, level |
| Change email / password | ● | Both require current-password verification |
| Delete account | ○ | Password-confirmed, permanent |
| Rate limiting | ● | slowapi: 5/15min auth, 30/min search, 100/15min general |

### 1.2 Business Search & Discovery (`routes/businesses.py`)

| Feature | Depth | What it does |
|---|---|---|
| **Search with filters** | ◆ | Google Places + local DB; radius, category, min-rating, price, open-now, independent-only; sort by best-match/distance/rating/reviews; **Bayesian rating smoothing**; rate-limited |
| Graceful zero-results fallback | ● | Returns 5 closest businesses so the UI is never blank |
| Get business detail | ● | Unified interface for local (`id`) and Google (`gp_…`) sources |
| Create / update business | ● | Multi-table transaction (business + categories + hours + photos); owner/admin auth |
| Autocomplete + geocode | ● | Google-backed location type-ahead and address→lat/lng |
| Categories taxonomy | ○ | Category list for filters |

### 1.3 The Local-vs-Chain Intelligence Engine — your crown jewels (`utils/`, `data/`)

This is what separates LocalLens from a Google Maps reskin. **Lead with this.**

| Feature | Depth | What it does |
|---|---|---|
| **Chain detector (10-signal fusion)** | ◆ | Aggregates 10 independent signals (known-brand list, locator subdomains, toll-free phone, name patterns, possessive/"The X" personal names, Google editorial-summary language, per-type priors, review-volume vs type baseline, rating distribution, city-in-name) by weighted average in [−1,+1], maps to probability, and **gates on confidence** so one weak signal can never exclude a business. Emits a per-signal breakdown. |
| **Two-phase filter pipeline** | ◆ | Phase 0 hard-excludes non-customer-facing types (parking, govt, schools) + soft-scores warehouses/HQs out; Phase 1 zero-tolerance brand list, then composite detection at 0.65. Sorts survivors by independence. |
| **Type-specific review baselines** | ◆ | Knows a 600-review coffee shop is normal but a 600-review bakery is suspicious — real domain modeling, not a global threshold. |
| Multi-pass fuzzy brand matching | ● | `"Starbucks #4271 - Downtown"` → `starbucks`; handles trademarks, store numbers, apostrophes, prefix matches over ~800 brands |
| Local-confidence badges | ● | `verified_local` / `likely_local` from probability + confidence thresholds |
| **Unit + end-to-end tests** | ● | `test_chain_detector.py` tests the *hard* case: unknown chains caught by composite signals; true locals survive. (Your only test file — most FBLA projects have none.) |

### 1.4 AI Concierge — the "Intelligent Feature" (`routes/ai.py`, `utils/intent_*`, `utils/ai_business_ranker.py`)

| Feature | Depth | What it does |
|---|---|---|
| **Two-stage LLM pipeline** | ◆ | (1) `llama-3.1-8b-instant` classifies intent into 8 buckets + extracts query/price → (2) fetch + rank businesses → (3) `llama-3.3-70b` generates a grounded, "recommend only from provided data" reply |
| **Intent-weighted ranking** | ◆ | 8 factors (distance, rating, reviews, independence, customer-facing, price, category, open) **re-weighted per intent** — `OPEN_NOW` ×5 open-status, `CHEAP_BUDGET` ×4 price, `SUPPORT_LOCAL` ×4 independence — then renormalized |
| **Empirical-Bayes rating smoothing** | ● | `(n/(n+m))·avg + (m/(n+m))·c`, c=3.7, m=15 — a 4.9★/5-review place smooths to ~4.3, killing rank-poisoning |
| **Gaussian distance decay** | ● | `exp(−km²/2σ²)`, σ=2km — smooth falloff, no hard cliff |
| Session persistence | ● | `chat_sessions`/`chat_messages`; atomic `UPDATE…RETURNING` touch-or-create; last-10-message context window |
| Google-outage fallback | ● | Falls back to local DB with haversine distance if Places fails |
| Chat widget + suggestion cards | ● | Plain-English in → text reply + clickable business cards out (`ai-chat.js`) |

### 1.5 Reviews, Favorites, Deals

| Feature | Depth | What it does |
|---|---|---|
| Review CRUD + **transactional re-aggregation** | ● | Every write atomically recomputes `average_rating` / `review_count` |
| Sortable, paginated reviews | ● | recent / rating-high / rating-low / helpful |
| Favorites (**dual-source**) | ● | Save a local business *or* a Google place (`gp_…`); denormalized snapshot survives deletion |
| Deals: create / list / geo-active / **redeem** | ● | Per-user + total limits, hex redemption codes, `redemption_count` increment |

### 1.6 Business-Owner Analytics — ⚠️ backend-only (`routes/analytics.py`)

| Feature | Depth | What it does |
|---|---|---|
| Business analytics endpoint | ● | avg rating, review count, favorites, deal claims, rating distribution, 30-day review trend |
| Deal analytics endpoint | ○ | Per-deal redemption/claim counts |

> 🔴 **These endpoints have NO front-end UI.** Half your pitch (the owner side) is currently invisible. See Part 4, Item #1 — this is the biggest single score swing in the whole project.

### 1.7 Maps, Location & Frontend UX (`frontend/`)

| Feature | Depth | What it does |
|---|---|---|
| **URL-encoded filter state** | ◆ | Filters serialize to `#/search?q=…&min_rating=…` — shareable, reloadable searches |
| **Bidirectional map↔card hover sync** | ◆ | Hovering a result enlarges its map pin and vice-versa; custom badge-colored numbered pins |
| Geolocation + reverse geocoding | ● | Browser geolocation, localStorage cache, server sync, friendly "City, State" display |
| Hash-router SPA | ● | 9 pages, no framework, route params + query strings |
| Responsive header / mobile bottom-sheet | ● | 768px breakpoint, auth-aware nav, slide-in sheet |
| **Editorial design system** | ● | Warm cream + rust, Fraunces/Source Serif type — distinctive, premium, *memorable*; deliberately no gradients |
| UX polish kit | ○ | Skeleton loaders, button-loading spinners, star/price components, 30+ inline SVG icons, staggered fade-ins, modal confirms, friendly empty states |
| Auth-gated pages | ● | favorites/profile/settings show a sign-in prompt, not an error |

### 1.8 Infrastructure & Deploy

| Feature | Depth | What it does |
|---|---|---|
| Connection pooling | ● | `psycopg2` threaded pool; `$1→%s` placeholder shim; SSL required |
| Global exception handler | ● | Logs traceback, returns clean 500 (no info leak) |
| Photo proxy + caching | ● | Masks Google key, 24h cache headers, dodges CORS |
| Vercel serverless deploy | ● | Mangum-wrapped FastAPI + static frontend |

---

## Part 2 — Why it currently reads "average / vibecoded"

Both a technical judge and a business judge independently flagged the same gaps. Honest version:

1. **The depth is concentrated in ~4 files.** The chain detector, ranker, intent classifier, and search are genuinely strong; the other ~30 features are competent CRUD scaffolding. If you demo the CRUD, you look generic; if you demo the engine, you look brilliant.
2. **Your best claim is unbacked.** `chain_detector.py` asserts *"95% precision / ~90% recall"* in a **code comment** with no dataset, no confusion matrix — resting on ~11 hand-picked test fixtures. A CS judge will puncture this in Q&A and it damages trust in everything else.
3. **The moat is invisible.** Chain detection + intent ranking are backend logic. On screen it can look like Google Maps unless you *show* the difference.
4. **Half the pitch has no UI.** Owner profile, deal-posting, and the analytics dashboard exist only as endpoints → the "customizable report" rubric line (worth up to ~10–30 pts depending on sheet) is currently **unscorable**.
5. **Input validation is auth-only.** Every other route takes raw `request.json()` — no coordinate-range, length, or discount-range checks. Directly costs the "validate syntactic AND semantic" rubric line.
6. **Demo fragility.** Three external single-points-of-failure (Supabase, Google, Groq) + zero offline fallback + officially unreliable Wi-Fi = a timeout reads as a "crash" on the heaviest-weighted bands.
7. **The docs self-incriminate.** `PROJECT_REPORT.md` admits the README is stale and that *API keys/DB password are exposed and "should be rotated."* `FUTURE_CHANGES.md` says reCAPTCHA *"was removed."* A judge who opens these loses confidence fast.
8. **Small "unfinished" tells.** `helpful_count` can never increment (no endpoint/UI); a real TOCTOU race in deal redemption contradicts the "prevents double-redemption" claim.

None of this is fatal. It's the gap between "impressive student project" and "survives cross-examination."

---

## Part 3 — How FBLA judges actually score this (the 110-pt rubric)

| Rubric line | Max | Your current band | What moves you to the top band |
|---|---|---|---|
| Code Quality — language selection | 5 | mid | Justify Python/FastAPI in **industry terms** (async I/O, Pydantic type-safety, ASGI), not "I know Python" |
| Code Quality — comments / naming / formatting | 5 | mid–high | Comments that "assist judges throughout the demo" |
| Code Quality — modular, readable, **advanced** | 10 | high | Your router/services/middleware/utils split + the detector = the "advanced knowledge" band |
| UX — design rationale + **accessibility** | 10 | low–mid | **Verbalize** the journey + add real ARIA/keyboard/contrast |
| UX — intuitive + clear instructions | 5 | high | In-app help |
| UX — navigation + **intelligent feature** | 5 | **top achievable** | The **Groq chatbot is the textbook intelligent feature** — name it |
| UX — **input validated (syntactic + semantic)** | 5 | low | Add validation everywhere; demo graceful rejection live |
| Functionality — **addresses all topic bullets** | 10 | mid–high | **Name each bullet out loud** as you demo it |
| Functionality — **customizable report** | 10 | **low (no UI)** | Build the owner analytics dashboard with date/metric filters |
| Functionality — data storage | 5 | high | Show the Postgres schema, relations, data types |
| Delivery — organized / clear | 10 | depends | Rehearsed 7-min arc |
| Delivery — confidence / body / eye contact / voice | 10 | depends | Demonstrate **all four** for full marks |
| Delivery — **Q&A** | 10 | depends | Confident, accurate answers; "I don't know" scores **zero** on this line |
| **Protocols** (all-or-nothing) | 10 | free if disciplined | ≤3 devices, on-topic, no judge interaction at setup, no clicked QR/links, nothing left behind |
| Penalties | −5/−5 | avoid | Dress code + late arrival are pure self-inflicted losses |

**Current estimate: ~82–90 / 110.** Closing the Part 4 Tier-1 items realistically moves you to **95–105**, finals range.

---

## Part 4 — The plan: make it BE impressive (and SEEM it)

Ranked by score-per-hour. **Tier 1 = do these first.**

### Tier 1 — biggest swings (build + fix)

| # | Change | Scores | Effort | Impact |
|---|---|---|---|---|
| 1 | **Build the business-owner UI**: "Add your business" form, "Post a deal" form, and a one-screen **analytics dashboard with a date-range + metric filter** wired to the endpoints that *already exist*. | Customizable report (≤30 pts) + makes the whole two-sided pitch demonstrable | Med | **High** |
| 2 | **Offline-capable seeded demo**: commit a `schema.sql` + seed ~15–20 real local businesses, reviews, active deals, a demo user **and** a demo owner account; degrade search/AI to seeded data if Google/Groq are down. | Protects the heavy Functionality bands against Wi-Fi failure | Med | **High** |
| 3 | **"LocalLens vs Google" side-by-side moment** in the demo: same query, show chains-everywhere vs your verified-local results; explain the 10-signal detector in one plain-English sentence. | Makes the moat visible; answers "why not Yelp?" | Low | **High** |
| 4 | **Validation everywhere**: Pydantic models on businesses/deals/reviews/ai-chat with syntactic **and** semantic checks (lat ∈ [−90,90], rating ∈ [1,5], non-empty/length-capped messages) + friendly 422s. Demo by typing garbage. | "Validate syntactic + semantic" line; engineering-maturity signal | Low | **High** |
| 5 | **Prove the detector**: build a labeled set (~100–200 real businesses, hand-tagged chain/local) + a script that prints a **confusion matrix + precision/recall/F1**. Replace the comment's bare "95%/90%" with the real number; put the matrix on a slide. | Converts the biggest liability into the biggest flex; "advanced knowledge" band | Med | **High** |

### Tier 2 — credibility & correctness

| # | Change | Scores | Effort | Impact |
|---|---|---|---|---|
| 6 | **Make the bot-prevention bullet visible**: explicitly demo the 5-attempt lockout + rate limiting (or re-add a lightweight CAPTCHA). | Topic-bullet coverage + protocol block | Low | Med |
| 7 | **Fix the deal-redemption TOCTOU**: enforce limits *inside* the transaction (`UPDATE … WHERE redemption_count < total_limit RETURNING` / `SELECT … FOR UPDATE`). | Makes "atomic / no double-redemption" true; clean Q&A answer | Low | Med |
| 8 | **Accessibility pass** on the core flow (ARIA roles, label associations, keyboard nav, contrast) — then narrate it. | UX-design rationale + accessibility band | Med | Med |
| 9 | **Threshold sensitivity slide** + wire the already-computed intent-classifier **confidence** into ranking (currently dead code). | Turns magic numbers into defensible engineering | Med | Med |

### Tier 3 — presentation & docs (seem impressive)

| # | Change | Scores | Effort | Impact |
|---|---|---|---|---|
| 10 | **Rewrite README** to match the real stack; remove the self-incriminating "keys exposed" notes (rotate + scrub first, then state security cleanly); add a **one-page architecture + data-model diagram** + open-source attribution list. | Documentation requirement; trust | Low | Med |
| 11 | **Open with a market + impact + business-model slide**: # of local businesses at risk, the ad-driven discovery gap, and how LocalLens sustains itself (free profiles + paid featured placement / deal fees). One concrete impact metric. | "Addresses the problem / business case" impression (business judges weight this heavily) | Low | High |
| 12 | **Script a topic-bullet checklist** into the 7-min arc — say each feature's name as you show it. | Top Functionality band requires the correlation be *explained* | Low | Med |
| 13 | **Rehearse Q&A**: "why this stack," "how does bot-prevention work," "how do you make money," "how would you scale," "how is this different from Yelp." Every team member speaks. | Heavily-weighted Q&A + delivery bands | Low | Med |
| 14 | **Protocol discipline**: ≤3 devices, dress code, arrive early, battery-charged, nothing left behind, don't ask judges to scan QR/links. | Banks the free 10 protocol pts; avoids −10 in penalties | Low | Med |

---

## Part 5 — A 7-minute demo script that can't fail

A concrete arc that hits every rubric lever (adapt freely; rehearse until it's muscle memory; run it **offline on seeded data**):

- **0:00–1:00 — The problem (business hook).** "You search 'coffee near me' and end up at Starbucks. 30M+ U.S. small businesses get buried under ads and chains. LocalLens flips that." *(Part 4 #11)*
- **1:00–2:30 — The intelligent feature, live.** Open the AI concierge, type *"cheap lunch near me."* Show the plain-English reply + clickable local cards. Name it: "This is our intelligent feature — intent classification + LLM recommendations grounded only in real data." *(rubric: intelligent feature, top band)*
- **2:30–3:30 — The moat, made visible.** The "vs Google" side-by-side. "Behind this is a 10-signal engine that tells a local cafe from a chain — and here's the proof," flash the **confusion matrix**. *(Part 4 #3, #5)*
- **3:30–5:00 — Trust you can't fake (the headline) + topic checklist.** On a business page, hit the **"Verified reviews only"** toggle — the rating visibly drops **4.5 → 3.9** in front of the judges. "Every one of these is backed by a **Verified Visit** — GPS geofence + dwell-time, server-checked against spoofing and replay. *This* is our verification step to prevent bot activity: a bot at a keyboard physically cannot stand inside a shop." (Optionally show the owner's rotating check-in code + the verified-visit passport.) Then narrate the topic bullets — **category sort**, **reviews & ratings**, **sort-by-rating**, **favorites**, **deals/coupons** — and type garbage into a field to show **validation** rejecting it gracefully. (Rate-limiting + the 5-attempt lockout are the supporting anti-bot layers — mention in passing.) *(bot-prevention headline + functionality + validation + topic coverage)*
- **5:00–6:00 — The other side of the marketplace.** Log in as the **demo owner**: add a business, post a deal, open the **analytics dashboard**, change the **date filter** to show it's a customizable report. *(Part 4 #1 — the line that's currently unscorable)*
- **6:00–7:00 — Tech justification + impact close.** "FastAPI for async I/O and Pydantic validation; PostgreSQL for relational integrity; we validate at format and meaning levels." Close on impact + business model. *(industry-terminology bands + business case)*
- **7:00–10:00 — Q&A.** Every member fields questions. Never "I don't know" — bridge to what you do know. *(Part 4 #13)*

---

## Appendix — Sources (verify the final rubric yourself)

- Coding & Programming 2025–26 guideline (110-pt sheet): <https://connect.fbla.org/headquarters/files/High%20School%20Competitive%20Events%20Resources/Individual%20Guidelines/Presentation%20Events/Coding-and-Programming.pdf>
- FBLA Coding & Programming event page: <https://www.fbla.org/competitive-events/coding-programming/>
- FBLA HS competitive events hub: <https://www.fbla.org/high-school/competitive-events/>
- NLC programming info: <https://www.fbla.org/nlc-ms-hs/programming/>
- Past winning projects (study these): <https://github.com/fbla-competitive-events>

> **Two caveats on the research:** (1) confirm whether your year/state adds a **prejudged program-URL** gate — if so, a public, bug-free hosted URL is mandatory; (2) point splits can vary slightly by the exact sheet, so verify against the official PDF before finalizing your talk.
