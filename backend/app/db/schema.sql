-- ============================================================================
-- LocalLens v2 — database schema (PostgreSQL)
--
-- Mirrors BUILD_SPEC §6. Notes:
--   * CHECK constraints double as a last line of SEMANTIC validation at the DB
--     (coordinates in range, rating 1–5, discount 1–100, ends_at > starts_at).
--     The API validates the same rules earlier with Pydantic (§12); the DB
--     guarantees them even if a write path is ever missed.
--   * `IF NOT EXISTS` everywhere makes the migrate script safely re-runnable.
--   * business_hours is added here (referenced by the owner add-business flow,
--     §11, and the seed, §20, though omitted from the §6 DDL listing).
-- ============================================================================

-- pgvector powers the "vibe" semantic search (business embeddings + cosine
-- similarity). Supabase ships the extension; this is a no-op when present.
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  default_lat   DOUBLE PRECISION,
  default_lng   DOUBLE PRECISION,
  trust_score   INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'owner', 'admin')),
  -- Anti-bot login throttling (§8.6): track failures and a temporary lockout.
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Businesses ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  lat              DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng              DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  address          TEXT,
  phone            TEXT,
  website          TEXT,
  price_level      SMALLINT CHECK (price_level BETWEEN 1 AND 4),
  is_independent   BOOLEAN,
  local_confidence REAL CHECK (local_confidence BETWEEN 0 AND 1),
  average_rating   REAL NOT NULL DEFAULT 0,
  review_count     INTEGER NOT NULL DEFAULT 0,
  photo_url        TEXT,                -- proxy path or owner-supplied URL
  embedding        vector(768),         -- semantic profile for vibe search
  photo_focus_x    SMALLINT CHECK (photo_focus_x BETWEEN 0 AND 100),  -- smart-crop
  photo_focus_y    SMALLINT CHECK (photo_focus_y BETWEEN 0 AND 100),  -- focal point (%)
  owner_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive migration for databases created before the smart-crop columns —
-- idempotent, so re-running the schema never touches existing data.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS photo_focus_x SMALLINT CHECK (photo_focus_x BETWEEN 0 AND 100);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS photo_focus_y SMALLINT CHECK (photo_focus_y BETWEEN 0 AND 100);

-- ── Categories + many-to-many junction ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS business_categories (
  business_id BIGINT REFERENCES businesses(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (business_id, category_id)
);

-- ── Business hours (0 = Sunday … 6 = Saturday) ───────────────────────────────
CREATE TABLE IF NOT EXISTS business_hours (
  id          BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (business_id, day_of_week)
);

-- ── Reviews (one per user per business; aggregates re-computed in a txn) ─────
CREATE TABLE IF NOT EXISTS reviews (
  id            BIGSERIAL PRIMARY KEY,
  business_id   BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

-- ── Deals + redemptions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id               BIGSERIAL PRIMARY KEY,
  business_id      BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  discount_pct     SMALLINT NOT NULL CHECK (discount_pct BETWEEN 1 AND 100),
  per_user_limit   INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit >= 1),
  total_limit      INTEGER CHECK (total_limit >= 1),
  redemption_count INTEGER NOT NULL DEFAULT 0,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  CHECK (ends_at > starts_at)          -- semantic rule enforced at the DB
);

CREATE TABLE IF NOT EXISTS deal_redemptions (
  id          BIGSERIAL PRIMARY KEY,
  deal_id     BIGINT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ                  -- set when the owner marks it used ("cashier mode")
);

-- ── Owner replies to reviews (one per review) ────────────────────────────────
CREATE TABLE IF NOT EXISTS review_replies (
  id         BIGSERIAL PRIMARY KEY,
  review_id  BIGINT UNIQUE NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Detail-page view log (feeds the owner analytics funnel) ─────────────────
CREATE TABLE IF NOT EXISTS business_views (
  id          BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = signed-out viewer
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Saved trips (the small-business trip planner) ────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  params     JSONB NOT NULL,   -- the request that built it (duration, interests, start)
  stops      JSONB NOT NULL,   -- ordered stop snapshots; survive source deletion
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Favorites (local id OR Google place id; denormalized snapshot) ──────────
CREATE TABLE IF NOT EXISTS favorites (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_ref  TEXT NOT NULL,           -- local id (as text) or Google place id (gp_...)
  snapshot_json JSONB NOT NULL,          -- survives source deletion
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_ref)
);

-- ── AI concierge sessions + messages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Chain registry: names we KNOW are not small businesses ──────────────────
-- The first gate of the search pipeline. Seeded from the curated brand list at
-- migrate time (source='seed'); grows as Gemini convicts new chains at search
-- time (source='llm'). Seed rows match fuzzily (4-pass); llm rows match by
-- EXACT normalized name only, so a learned name can never blanket-hide an
-- unrelated independent that happens to share a prefix.
CREATE TABLE IF NOT EXISTS chain_registry (
  id              BIGSERIAL PRIMARY KEY,
  normalized_name TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('seed', 'llm')),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes (hot lookup paths) ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_deals_business   ON deals(business_id);
CREATE INDEX IF NOT EXISTS idx_bizcat_category  ON business_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_hours_business   ON business_hours(business_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user   ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_views_business   ON business_views(business_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_redemptions_code ON deal_redemptions(code);
CREATE INDEX IF NOT EXISTS idx_trips_user       ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_chain_source     ON chain_registry(source);
