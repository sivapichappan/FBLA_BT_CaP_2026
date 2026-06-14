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
from app.services.brands import CHAIN_BRANDS

_HERE = Path(__file__).parent
_SCHEMA = _HERE / "schema.sql"
_SEED = _HERE / "seed.sql"

# Tables emptied by --reseed, child-first so foreign keys don't block the wipe.
_SEED_TABLES = [
    "review_replies", "deal_redemptions", "deals", "reviews", "business_views",
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

    print("✓ migrate complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
