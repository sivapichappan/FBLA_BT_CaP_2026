# LocalLens — Slide-Deck Diagram Brief for Claude

> Paste this entire file into the chat. Read the context first, then produce
> the diagrams. **Each diagram is a SEPARATE deliverable — make each one as
> its own SVG artifact, one at a time, in order.** After each diagram, pause
> so I can request tweaks before you move to the next.

---

## Part 1 — Project context (read fully before drawing)

**What this is for.** I'm a high-school student presenting **LocalLens** at the
FBLA Coding & Programming national competition. The format is a live, judged
presentation: a 7-minute talk with a short slide deck plus a live demo of the
running app, then 3 minutes of Q&A, scored on a 110-point rubric. The slides
must be mostly diagrams and bullets — no code on screen — and judges view them
from across a room, so every diagram needs very large labels, minimal text,
and instantly readable structure. Everything on a slide must survive
cross-examination in Q&A, which is why every number in this brief is real and
measured from the actual codebase. These diagrams are the visual backbone of
the deck; the live app demo carries the rest.

**The product.** LocalLens is a two-sided web platform that helps people
discover and support small, independent local businesses — and gives those
business owners free tools the big platforms charge for. The consumer side
has search with category/price/rating filters, reviews and ratings,
favorites, deals with redemption codes, a semantic "vibe" search ("old new
york atmosphere" finds century-old taverns by meaning, not keywords), an AI
concierge chat, a trip planner that builds walkable all-independent
itineraries, and personalized "For you" picks. The owner side has business
listing management, deal posting, a cashier mode for verifying customer
redemption codes at the counter, and a customizable analytics dashboard
(date-range + metric selection, views → favorites → redemptions conversion
funnel, CSV export). The design is warm and editorial: a beige paper canvas,
one deep indigo accent, Playfair Display headlines, Lora body text — it
deliberately looks like a printed magazine, not a SaaS dashboard, and the
diagrams should match that feeling exactly.

**The signature capability — the thing that makes LocalLens different.**
LocalLens shows *only* small, independently-owned businesses. Everywhere.
Always. Chains are not down-ranked or filtered by a toggle; they are
structurally excluded by a three-gate pipeline that runs on every search:

1. **Gate 1 — Chain Registry.** A persistent database table of **2,383 known
   chain names** (a 509-brand curated seed list, grown by AI learning and a
   bulk curated import). Matching is fuzzy and storefront-aware: "Starbucks
   #4271 - Downtown" still matches "starbucks". This gate is instant and
   free — most chains die here.
2. **Gate 2 — Recent Audit Cache.** Every past verdict is remembered per
   business for 30 days, so repeat searches cost zero AI calls.
3. **Gate 3 — Gemini AI Audit.** All remaining unknowns go to Google's
   Gemini model in **one batched call** with a strict, carefully engineered
   definition: corporate chains, franchises, big-box, banks, and
   venture-backed multi-city brands are out; a beloved locally-owned
   business with a handful of locations in one city (think Joe's Pizza in
   NYC) stays in. The prompt's hard rule: **if unsure, answer "small"** —
   hiding a real independent business is the one unacceptable error.

There is a **learning loop**: every high-confidence chain verdict from Gate 3
is written back into the registry permanently, so the system gets faster,
cheaper, and smarter with every search, in every city. There is also an
honest **failure mode**: if the AI is unreachable (offline demo, rate limit),
the registry still filters, and anything unverifiable is *shown* with a
"likely local" badge rather than hidden. A "why this verdict?" glass-box
panel in the UI shows exactly which gate decided and the plain-English
reason — the system is interrogable, not a black box. Searches also
guarantee a minimum of ten results by automatically widening the search
radius (5 km → 20 km → 50 km) and telling the user honestly when it did.

**Measured, never asserted.** The registry layer is validated by an
automated test harness over **156 real hand-labeled businesses (73 chains,
83 independents)**: it catches **62 of 73 chains (84.9% recall)** with
**zero false positives (100% precision)** — and the test suite fails the
build if recall ever drops below 0.80 or even one independent is wrongly
matched. The registry's growth story: 509 curated seed brands → 569 after
live AI learning → **2,383** after a curated bulk import.

**Architecture.** The frontend is a React 18 + TypeScript single-page app
(Vite build, Tailwind with design tokens), deployed on **Vercel's** edge
CDN. It talks JSON over HTTPS with JWT bearer auth to a **FastAPI (Python,
async)** backend organized in three strict layers: **routers** (HTTP only —
Pydantic validation), **services** (all business logic: search, the chain
classifier, an intent-weighted ranker, trip planner, embeddings, concierge),
and **repositories** (all SQL, parameterized — no SQL anywhere else). The
backend connects to three externals: **Supabase** (managed PostgreSQL with
the pgvector extension for 768-dimension semantic embeddings; ACID
transactions), **Google Places + Geocoding + Maps** (live nationwide
business data), and **Gemini AI** (chain audits, concierge replies, review
summaries, embeddings). Resilience is a first-class feature: every external
call is failure-wrapped and falls back to an on-disk cache or a
deterministic substitute (keyword classifier + templated replies for the
concierge; honest "unavailable" notices for semantic search; elegant
monogram tiles for photos), and a single `ONLINE=false` switch rehearses
the entire offline path — a dead conference Wi-Fi is invisible on stage.

**Data model highlights** (PostgreSQL): `users` (with roles and a trust
score), `businesses` (with photo, 768-dim embedding vector, and smart-crop
focal point), a categories junction table, `reviews` (one per user per
business, with owner replies), `favorites` and `trips` (JSONB snapshots
that survive the source being deleted), `deals` → `deal_redemptions`
(redemption caps enforced under a row lock — double-redemption is
impossible even under concurrency, proven by an 8-thread test),
`business_views` (powers the analytics funnel), and `chain_registry` (the
blocklist). Review aggregates are recomputed inside the same transaction as
every write, and CHECK constraints double as semantic validation.

**Why this matters for the diagrams:** the judges score "modular/advanced
code," "data storage," "intelligent feature," and "addresses the topic" —
each diagram below maps to one of those scored lines. Accuracy of the
numbers matters; visual elegance matters; readability from distance matters
most of all.

---

## Part 2 — Global style (applies to EVERY diagram)

All diagrams: **SVG artifact, 16:9, 1920×1080**, flat design, readable from
across a room (very large labels, minimal text, generous spacing).

- Background: warm beige `#FBF7F0`
- Primary text: warm near-black `#1F1B16`
- Accent: deep indigo `#21436B`, lighter indigo `#2E5C8A`
- Success/local: forest green `#4F6B4A`
- Muted/chain gray: `#9A958C` · Hairline borders: `#E8E0D4`
- Rounded rectangles, **no gradients**, at most very soft shadows
- Serif headings (Playfair-Display-like), clean secondary face for labels
- Overall feel: editorial print magazine, not a SaaS dashboard

---

## Part 3 — The diagrams (five separate deliverables, in order)

### DIAGRAM 1 of 5 — The chain-filter pipeline (the "moat" slide)

Title: **"How LocalLens Shows Only Small Businesses"**

A left-to-right pipeline with 4 stages connected by arrows:

1. **"Pull Everything"** — box showing raw search results entering from two
   sources: "Google Places (live)" and "Our database (owner-listed)". Show a
   mixed stack of example chips entering: "Starbucks", "Joe's Pizza",
   "Blank Street", "Maya's Bakery", "CVS Pharmacy", "Old Town Bar".
2. **"Gate 1 · Chain Registry"** — indigo box. Sub-label: "2,383 known chain
   names · instant & free · matches 'Starbucks #4271 - Downtown' too". Show
   "Starbucks" and "CVS Pharmacy" chips dropping out below with a small ✗.
3. **"Gate 2 · Recent Audit Cache"** — indigo box. Sub-label: "remembers
   every past verdict for 30 days · repeat searches cost zero AI calls".
4. **"Gate 3 · Gemini AI Audit"** — indigo box. Sub-label: "one batched
   call · strict definition: corporate chains & franchises out,
   locally-owned stays · IF UNSURE → SHOW IT". Show "Blank Street" dropping
   out with ✗.

OUTPUT (right side): a green-bordered box **"Only Small Businesses"** with
surviving chips "Joe's Pizza", "Maya's Bakery", "Old Town Bar", each with a
small green "VERIFIED LOCAL" badge.

LEARNING LOOP: curved arrow from Gate 3 back to Gate 1 labeled "new chains
learned permanently — every search makes it smarter".

FOOTNOTE BAR (bottom, small): "Offline? The registry keeps filtering, and
anything unverifiable is SHOWN, never hidden — we never hide a real
independent business."

### DIAGRAM 2 of 5 — System architecture

Title: **"LocalLens Architecture"**

Three tiers, top to bottom, connected by labeled arrows:

- TIER 1 (top): "Browser — React 18 + TypeScript SPA" with sub-chips
  "Vite · Tailwind (design tokens) · hosted on Vercel edge CDN". Arrow down
  labeled "JSON over HTTPS · JWT auth".
- TIER 2 (middle, largest): "FastAPI Backend (Python, async)" containing
  THREE stacked layers, one line each:
  - "Routers — HTTP only: validate input (Pydantic)"
  - "Services — ALL business logic: search · chain classifier · ranker ·
    trip planner · embeddings · AI concierge"
  - "Repositories — ALL SQL, parameterized"
  Side annotation in indigo: "Strict layering — no SQL outside repositories,
  no logic in routers".
- TIER 3 (bottom): three side-by-side boxes the backend points to:
  - "Supabase — managed PostgreSQL + pgvector" · sub-label "users · reviews ·
    deals · chain registry · 768-dim embeddings · ACID transactions"
  - "Google Places + Geocoding + Maps" · sub-label "live nationwide business
    data"
  - "Gemini AI" · sub-label "chain audits · concierge · summaries ·
    embeddings"

RESILIENCE OVERLAY: from the Google and Gemini boxes, dashed gray arrows to
two small boxes: "on-disk demo cache (stale OK)" and "deterministic
fallbacks (keyword classifier + templates)". Caption: "every external call
has a fallback — a dead network is invisible on stage".

### DIAGRAM 3 of 5 — Data model (ER diagram)

Title: **"Relational Data Model (PostgreSQL on Supabase)"**

Table cards with 3–5 key fields each, indigo header strips, connected with
crow's-foot relationship lines:

- `users` (id, email UNIQUE, role: user/owner/admin, trust_score)
- `businesses` (id, name, lat/lng, avg_rating, review_count, photo_url,
  embedding vector(768), owner_id → users)
- `categories` + `business_categories` (many-to-many junction)
- `reviews` (rating 1–5, body, UNIQUE one per user per business) →
  `review_replies` (one owner reply per review)
- `favorites` (user_id, business_ref, snapshot JSONB)
- `deals` (discount %, total_limit, starts < ends) → `deal_redemptions`
  (code, redeemed_at, verified_at)
- `business_views` (business_id, viewed_at) — powers the analytics funnel
- `trips` (user_id, stops JSONB)
- `chain_registry` (normalized_name UNIQUE, source: seed/llm, reason) —
  standalone card, the search pipeline's blocklist

FOUR CALLOUT NOTES in indigo, attached to the relevant tables:

1. on reviews→businesses: "rating aggregates recomputed INSIDE the same
   transaction — can never drift"
2. on favorites & trips: "JSONB snapshots survive the source business being
   deleted"
3. on deal_redemptions: "row lock + guarded update = double-redemption
   impossible, even under concurrency"
4. on businesses: "CHECK constraints double as semantic validation
   (lat ∈ ±90, rating 1–5, ends_at > starts_at)"

### DIAGRAM 4 of 5 — Measured accuracy (the credibility slide)

Title: **"Measured, Never Asserted"** — big numbers are the heroes.

LEFT HALF — "The test: 156 real businesses, hand-labeled": a split bar or
icon array showing 73 chains + 83 independents. Below it, a simple
confusion-matrix-style result for the registry layer:

- Chains caught: 62 of 73 → big number **"84.9% recall"**
- Independents wrongly flagged: big green **"0"** → "100% precision — zero
  false positives"

Caption: "automated test suite FAILS the build if recall drops below 0.80
or even ONE independent is wrongly matched".

RIGHT HALF — "The registry keeps growing": a simple 3-step growth bar:
**509** (curated seed list) → **569** (+AI-learned from live searches) →
**2,383** (after curated bulk import), labeled "every learned chain blocks
instantly, in every city, forever".

FOOTNOTE BAR: "False positives are the one unacceptable error — hiding a
real small business defeats the product. So uncertainty always resolves to
SHOW."

### DIAGRAM 5 of 5 — Resilience / fallback map (the "it cannot crash" slide)

Title: **"Built to Never Fail on Stage"**

A clean 3-column ladder. Column headers: "Dependency" → "Primary (online)" →
"Fallback (automatic & silent)". Six rows:

1. Business discovery | Google Places live | on-disk cache, then seeded
   local data
2. Chain filtering | registry + Gemini audit | registry alone (2,383
   names); unverified businesses SHOWN, badged "likely local"
3. AI concierge | Gemini intent + reply | keyword classifier + templated
   reply (labeled "⚙ offline mode" in the UI)
4. Semantic "vibe" search | Gemini embeddings + pgvector | honest
   "unavailable offline" notice — never fake results
5. Review summaries | Gemini digest (cached) | block hidden — never
   hallucinated
6. Business photos | Google photo proxy | elegant monogram tile — never a
   broken image

Arrows between columns; fallback column tinted very light indigo.

BOTTOM BANNER in indigo: "One switch (ONLINE=false) rehearses the entire
offline path · request timeouts · error boundaries · a global handler — no
stack trace can ever reach the screen."
