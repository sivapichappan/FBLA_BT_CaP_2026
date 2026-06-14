# LocalLens — Data Model

Full DDL: [backend/app/db/schema.sql](../backend/app/db/schema.sql) ·
Seed: [backend/app/db/seed.sql](../backend/app/db/seed.sql) (46 real NYC independents with photos,
hours, 101 reviews, deals, redemptions, favorites, a month of view history, and three demo
accounts — consumer, owner, admin).

Requires the **pgvector** extension (`CREATE EXTENSION vector`) — `businesses.embedding
vector(768)` stores each business's semantic profile for vibe search.

## Entity-relationship diagram

```
                 ┌─────────────┐
                 │   users     │ id, email*, username*, password_hash,
                 │             │ role(user|owner|admin), trust_score,
                 │             │ failed_logins, locked_until, default_lat/lng
                 └──┬───┬───┬──┘
        owns (0..n) │   │   │ writes (0..n)
                    ▼   │   ▼
        ┌────────────┐  │  ┌────────────┐    one per (user,business)
        │ businesses │  │  │  reviews   │◄── UNIQUE(business_id,user_id)
        │            │  │  │ rating 1–5 │
        │ lat/lng ✓  │  │  │ body ≤2000 │──► review_replies (1:1, UNIQUE
        │ price 1–4  │  │  └─────┬──────┘    review_id) — the owner's
        │ avg_rating │  │        │           public response
        │ review_cnt │  │        │ aggregates roll up to businesses
        │ photo_url  │  │        │ (inside the SAME transaction)
        │ embedding  │  │        ▼
        │ vector(768)│  │   businesses.average_rating / review_count
        │ focus_x/y  │  │   (photo_focus_*: smart-crop focal point, 0–100%)
        └─┬───┬───┬──┘  │
          │   │   │     │ saves (0..n)
          │   │   │     ▼
          │   │   │  ┌───────────────┐  business_ref = local id OR "gp_…"
          │   │   │  │  favorites    │  snapshot_json JSONB survives the
          │   │   │  │               │  source business being deleted
          │   │   │  └───────────────┘  UNIQUE(user_id, business_ref)
          │   │   │
          │   │   └───────────────┐
          │   ▼                   ▼
          │ ┌──────────────────┐ ┌──────────────────┐
          │ │ business_hours   │ │ business_categories │ many-to-many
          │ │ dow 0–6, times   │ │  ──► categories(name*) │
          │ └──────────────────┘ └──────────────────┘
          │
          ├──► business_views (business_id, user_id NULL ok, viewed_at)
          │       one row per detail-page view → powers the views trend
          │       and the views→favorites→redemptions funnel
          ▼
   ┌────────────┐ 1..n  ┌──────────────────┐
   │   deals    │──────►│ deal_redemptions │ code, redeemed_at,
   │ pct 1–100  │       │ (user_id FK)     │ verified_at (cashier mode);
   │ starts<ends│       └──────────────────┘ caps enforced under a
   │ total_limit│                            row lock — race-proof
   └────────────┘
   trips(user_id) — saved itineraries: params JSONB + stops JSONB snapshot
   chat_sessions(user_id) 1..n chat_messages(role user|assistant)
   chain_registry — normalized_name*, display_name, source(seed|llm), reason
     the search pipeline's first gate: 509 curated brands (seeded at migrate,
     matched fuzzily) + names Gemini has convicted (matched EXACT-only);
     NOT touched by --reseed — learned rows are knowledge, not demo data
```

`*` = UNIQUE. Every FK has `ON DELETE CASCADE` (or `SET NULL` for `businesses.owner_id`, so a
deleted owner account doesn't take the listing down with it).

## Constraints as semantic validation

The CHECK constraints are the last line of the layered validation story (§12): the API validates
with Pydantic first, but the database independently guarantees the same rules —

- `lat BETWEEN -90 AND 90`, `lng BETWEEN -180 AND 180`
- `rating BETWEEN 1 AND 5`, `char_length(body) BETWEEN 1 AND 2000` (reviews and replies)
- `discount_pct BETWEEN 1 AND 100`, `per_user_limit >= 1`, `ends_at > starts_at`
- `role IN ('user','owner','admin')`, one review per user per business, one reply per review

## Denormalization, deliberately

- `businesses.average_rating` / `review_count` are recomputed **in the same transaction** as every
  review create/update/delete — read-heavy search never aggregates, and the values can't drift.
- `users.trust_score` is adjusted **in the same transaction** as the action that earns it
  (review +10, redemption +5, favorite +2; deletions reverse; floored at 0; the favorite +2 fires
  only when the upsert actually inserted, detected via `(xmax = 0)`). Level = score ÷ 50 + 1.
- `favorites.snapshot_json` and `trips.stops` are point-in-time JSONB copies of the card data, so
  a favorite or saved trip still renders if the source (a local row or a Google place) disappears.
- `deals.redemption_count` is incremented under a `SELECT … FOR UPDATE` row lock with a guarded
  `UPDATE … WHERE redemption_count < total_limit`, proven race-proof under 8-thread concurrency.
- `chain_registry` learns: high-confidence Gemini chain verdicts insert with
  `ON CONFLICT DO NOTHING` (concurrent searches can never conflict). Escape hatch for a bad
  learned row: `DELETE FROM chain_registry WHERE source = 'llm' AND normalized_name = '…'` —
  `reason` and `created_at` make every learned row auditable.

## Data structures & scope (for the rubric's data-storage line)

- A business's categories: a **set-valued list** materialized by `array_agg` over the junction
  table; its hours: a 7-row **list of day records**; its semantic profile: a **768-dimension
  vector** compared by cosine distance (`<=>`).
- Search/concierge results: a **ranked array** of one canonical dict shape regardless of source.
- The classifier verdict: a **list of `{step, outcome, detail}` check objects** — the pipeline's
  own execution trail, which is exactly what the glass-box UI renders.
- The concierge context: the **last-10 list** of `{role, content}` messages.
- A trip: an **ordered list of stop records** (arrival time, dwell, walking leg) — order is the
  payload, which is why it's stored as a JSONB array rather than rows.
- Scope: module-level constants (brand list, type priors, intent weights, smoothing constants,
  slot templates) are defined once and shared read-only; all per-request data (params, candidates,
  scores) stays request-scoped; the only process-level mutable state is the connection pool.

## Indexes

Hot lookup paths each get one: `reviews(business_id)`, `deals(business_id)`,
`business_categories(category_id)`, `business_hours(business_id)`, `favorites(user_id)`,
`chat_messages(session_id)`, `business_views(business_id, viewed_at)` (range scans for the
analytics window), `deal_redemptions(code)` (cashier lookups), `trips(user_id)` — plus the
implicit unique indexes on every `UNIQUE` constraint.
