"""Apply the schema and (optionally) the demo seed to the configured database.

Run from the ``backend/`` directory:

    python -m app.db.migrate            # create tables; seed only if empty
    python -m app.db.migrate --reseed   # wipe demo tables, then re-seed

We do this in Python with psycopg rather than the ``psql`` CLI so there is no
external tool dependency — the same driver the app already uses applies the DDL.
``schema.sql`` is fully idempotent (``CREATE TABLE IF NOT EXISTS``); the seed is
only applied to an empty database (or after ``--reseed`` truncates the tables),
so re-running migrate never duplicates rows.
"""

from __future__ import annotations

import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from app.db.connection import _dsn
from app.middleware.security import hash_password
from app.services.brands import CHAIN_BRANDS

_HERE = Path(__file__).parent
_SCHEMA = _HERE / "schema.sql"
_SEED = _HERE / "seed.sql"

# Tables emptied by --reseed, child-first so foreign keys don't block the wipe.
# (reviews references visits via visit_id, so reviews is wiped before visits.)
_SEED_TABLES = [
    "review_replies", "deal_redemptions", "deals",
    "visit_checkpoints", "qr_redemptions", "reviews", "visits",
    "business_views",
    "trips", "business_categories", "business_hours", "favorites",
    "chat_messages", "chat_sessions", "businesses", "categories", "users",
]


def _split_statements(sql: str) -> list[str]:
    """Split a parameter-free SQL script into individual statements.

    Drops full-line ``--`` comments, then splits on ``;``. Safe for our schema/
    seed because neither contains a semicolon inside a string literal.
    """
    body = "\n".join(
        line for line in sql.splitlines() if not line.strip().startswith("--")
    )
    return [stmt.strip() for stmt in body.split(";") if stmt.strip()]


def _run_sql_file(conn: psycopg.Connection, path: Path) -> None:
    """Execute a whole .sql file.

    psycopg can usually run a multi-statement, parameter-free string in one
    ``execute``. If a given setup rejects that, we fall back to running each
    statement individually so the migration still succeeds.
    """
    sql = path.read_text(encoding="utf-8")
    try:
        conn.execute(sql)
    except psycopg.errors.SyntaxError:
        for statement in _split_statements(sql):
            conn.execute(statement)


# ── Verified-Visits demo data ────────────────────────────────────────────────
# The flagship business gets a curated review set that makes the raw-vs-verified
# gap VIVID: a cluster of glowing UNVERIFIED 5★ reviews inflates the headline
# average, while a smaller set of measured CONFIRMED-VISIT reviews tells the
# honest story. That is exactly the phenomenon Verified Visits exposes (fake /
# incentivised positives game the public number; verified reviews don't). All of
# this is demo data, like the rest of the seed.
_FLAGSHIP_ID = 1  # Caffè Reggio — the business the demo's trust toggle centres on.

# (username, rating, verified, body). The 7 verified ratings average ~3.9; the
# 8 unverified are all 5★, pulling the public average up to ~4.5.
_FLAGSHIP_REVIEWS = [
    ("marco_visconti", 3, True,  "A real Village institution, but honestly the espresso was lukewarm and the service slow the afternoon I stopped in."),
    ("nadia_kessler",  4, True,  "Lovely old-world atmosphere and a decent cappuccino — good, not amazing. Worth it for the history."),
    ("theo_ramos",     4, True,  "Solid coffee and unbeatable people-watching on the patio. A touch pricey for what it is."),
    ("priya_sundaram", 4, True,  "Cozy and full of character. The pastries actually outshone the coffee for me."),
    ("liam_doyle",     4, True,  "Been stopping in for years — consistent if not mind-blowing. The sidewalk seating is the real draw."),
    ("hana_morimoto",  4, True,  "Good espresso and a genuine piece of NYC. Gets loud and crowded on weekends, though."),
    ("owen_bishop",    4, True,  "Charming spot. The reputation runs a little ahead of the actual cup these days, but I still enjoy it."),
    ("gabriela_costa", 5, False, "The BEST cappuccino in all of New York! Absolutely magical every single time."),
    ("dylan_fischer",  5, False, "Five stars isn't enough. Perfect cafe, perfect coffee, perfect everything!"),
    ("amara_okeke",    5, False, "Obsessed. I could sit here for hours — hands down my favourite spot in the city."),
    ("victor_ngo",     5, False, "Incredible! The vibe, the espresso, the history — flawless. Go now!"),
    ("sophie_laurent", 5, False, "An absolute gem. Best coffee experience I've ever had, no contest."),
    ("ravi_anand",     5, False, "Phenomenal in every way. I tell everyone I know to come here."),
    ("ingrid_haas",    5, False, "Pure perfection. The most charming cafe in Manhattan, bar none."),
    ("marcus_webb",    5, False, "Unreal. Five stars all day — this place is a treasure!"),
]


def _seed_flagship_reviews(conn: psycopg.Connection) -> int:
    """Add the curated flagship reviews (and the verified visits behind the
    verified ones). Idempotent via ON CONFLICT + an existing-review check, so a
    re-run never duplicates. Recomputes the flagship's denormalized aggregate."""
    biz = conn.execute(
        "SELECT id, lat, lng FROM businesses WHERE id = %s", [_FLAGSHIP_ID]
    ).fetchone()
    if not biz:
        return 0
    pw = hash_password("demodemo")  # same throwaway demo password as the seed users
    added = 0
    for username, rating, verified, body in _FLAGSHIP_REVIEWS:
        email = f"{username}@reggio.demo"
        user_id = conn.execute(
            """INSERT INTO users (email, password_hash, username)
               VALUES (%s, %s, %s)
               ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
               RETURNING id""",
            [email, pw, username],
        ).fetchone()["id"]
        existing = conn.execute(
            "SELECT id, visit_id FROM reviews WHERE business_id = %s AND user_id = %s",
            [_FLAGSHIP_ID, user_id],
        ).fetchone()
        if existing:
            review_id, has_visit = existing["id"], existing["visit_id"]
        else:
            review_id = conn.execute(
                "INSERT INTO reviews (business_id, user_id, rating, body) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                [_FLAGSHIP_ID, user_id, rating, body],
            ).fetchone()["id"]
            has_visit, added = None, added + 1
        if verified and has_visit is None:
            visit_id = conn.execute(
                """INSERT INTO visits
                       (user_id, business_id, method, status, verified_at, expires_at,
                        verification_strength, spend_cents, latitude, longitude, distance_m)
                   VALUES (%s, %s, 'GPS_GEOFENCE_DWELL', 'VERIFIED',
                           now() - interval '5 days', now() - interval '5 days',
                           80, 750, %s, %s, 11)
                   RETURNING id""",
                [user_id, _FLAGSHIP_ID, biz["lat"], biz["lng"]],
            ).fetchone()["id"]
            conn.execute("UPDATE reviews SET visit_id = %s WHERE id = %s", [visit_id, review_id])
    # Keep the denormalized average/count in sync after adding reviews.
    conn.execute(
        """UPDATE businesses SET
               average_rating = COALESCE((SELECT AVG(rating)::real FROM reviews WHERE business_id = %s), 0),
               review_count   = (SELECT COUNT(*) FROM reviews WHERE business_id = %s)
           WHERE id = %s""",
        [_FLAGSHIP_ID, _FLAGSHIP_ID, _FLAGSHIP_ID],
    )
    return added


def _seed_verified_visits(conn: psycopg.Connection) -> int:
    """For NON-flagship businesses, mark ~half their reviews (even ids) as
    verified visits so the passport / badges / money-kept-local features have
    breadth across many businesses. Idempotent: only touches reviews that aren't
    already linked, so a re-run never duplicates."""
    reviews = conn.execute(
        "SELECT id, business_id, user_id, rating, created_at FROM reviews "
        "WHERE visit_id IS NULL AND business_id <> %s",
        [_FLAGSHIP_ID],
    ).fetchall()
    linked = 0
    for r in reviews:
        if r["id"] % 2 != 0:
            continue
        # A backdated VERIFIED dwell visit at the business's own coordinates, with
        # a plausible deterministic spend for the "money kept local" counter.
        spend_cents = 1200 + (r["business_id"] * 137) % 2300   # ~$12–$35
        visit_id = conn.execute(
            """INSERT INTO visits
                   (user_id, business_id, method, status, verified_at, expires_at,
                    verification_strength, spend_cents, latitude, longitude, distance_m)
               SELECT %s, %s, 'GPS_GEOFENCE_DWELL', 'VERIFIED', %s, %s, 78, %s,
                      b.lat, b.lng, 14
               FROM businesses b WHERE b.id = %s
               RETURNING id""",
            [r["user_id"], r["business_id"], r["created_at"], r["created_at"],
             spend_cents, r["business_id"]],
        ).fetchone()["id"]
        conn.execute("UPDATE reviews SET visit_id = %s WHERE id = %s", [visit_id, r["id"]])
        linked += 1
    return linked


def main() -> int:
    fresh = "--fresh" in sys.argv
    reseed = "--reseed" in sys.argv

    # autocommit so each DDL statement is durable as it runs.
    with psycopg.connect(_dsn(), autocommit=True, row_factory=dict_row) as conn:
        if fresh:
            # DESTRUCTIVE: drop every table in the public schema so the v2 schema
            # can be created from a clean slate (used to clear a leftover v1 DB).
            print("→ --fresh: dropping ALL tables in the public schema …")
            tables = conn.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            ).fetchall()
            for row in tables:
                conn.execute(f'DROP TABLE IF EXISTS public."{row["tablename"]}" CASCADE')
            print(f"  dropped {len(tables)} table(s).")

        print("→ applying schema.sql …")
        _run_sql_file(conn, _SCHEMA)
        print("  schema applied.")

        # Seed the chain registry from the curated brand list. Idempotent
        # (ON CONFLICT DO NOTHING) and deliberately NOT part of --reseed:
        # LLM-learned rows are accumulated knowledge, not demo data.
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO chain_registry (normalized_name, display_name, source, reason) "
                "VALUES (%s, %s, 'seed', 'Curated US chain-brand list') "
                "ON CONFLICT (normalized_name) DO NOTHING",
                [(brand, brand.title()) for brand in sorted(CHAIN_BRANDS)],
            )
        total = conn.execute(
            "SELECT count(*) AS n FROM chain_registry WHERE source = 'seed'"
        ).fetchone()["n"]
        print(f"→ chain registry: {total} seed brands present.")

        if reseed:
            print("→ --reseed: truncating demo tables …")
            conn.execute(
                "TRUNCATE " + ", ".join(_SEED_TABLES) + " RESTART IDENTITY CASCADE;"
            )

        # Seed only when empty so a normal migrate is safe to re-run.
        count = conn.execute("SELECT count(*) AS n FROM businesses").fetchone()["n"]
        if count == 0:
            print("→ seeding demo data (NYC) …")
            _run_sql_file(conn, _SEED)
            seeded = conn.execute("SELECT count(*) AS n FROM businesses").fetchone()["n"]
            print(f"  seeded {seeded} businesses.")
        else:
            print(f"→ businesses table already has {count} rows; skipping seed "
                  f"(use --reseed to replace).")

        # Verified-Visits demo data (idempotent; safe on an already-seeded DB):
        # first the curated flagship review set, then ~half of everyone else's.
        flagship = _seed_flagship_reviews(conn)
        if flagship:
            print(f"→ flagship demo reviews: added {flagship} reviews to business {_FLAGSHIP_ID}.")
        linked = _seed_verified_visits(conn)
        if linked:
            print(f"→ verified-visit demo data: linked {linked} reviews to verified visits.")

    print("✓ migrate complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
