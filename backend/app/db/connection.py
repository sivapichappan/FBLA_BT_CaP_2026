"""PostgreSQL access: a lazily-created connection pool plus a transaction helper.

This is the **only** place the app opens database connections. Repositories
(``repositories/``) import ``transaction`` / ``query`` from here; nothing else
talks to psycopg directly (BUILD_SPEC §5).

Design choices worth defending in Q&A:

* **Pooling** — opening a TCP+TLS connection to Supabase is slow; a small pool
  reuses warm connections across requests.
* **Lazy init** — the pool is created on first use, not at import, so the app
  (and ``/health``) boots even when ``DATABASE_URL`` is unset or Postgres is
  down.
* **dict rows** — ``row_factory=dict_row`` returns each row as a ``dict`` keyed
  by column name, which maps cleanly onto Pydantic response models.
* **Transactions** — the ``transaction()`` context manager commits on success
  and rolls back on any exception, so multi-statement writes (review
  re-aggregation, deal redemption) are atomic (BUILD_SPEC §8.2, §8.5).
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import settings

_pool: ConnectionPool | None = None


def _dsn() -> str:
    """Return the connection string, ensuring SSL is required.

    Supabase (and most hosted Postgres) require TLS. If the caller's
    ``DATABASE_URL`` does not already specify ``sslmode``, we append
    ``sslmode=require`` so connections never fail for a missing flag.
    """
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to backend/.env (see .env.example)."
        )
    dsn = settings.database_url
    if "sslmode=" not in dsn:
        dsn += ("&" if "?" in dsn else "?") + "sslmode=require"
    return dsn


def get_pool() -> ConnectionPool:
    """Return the process-wide pool, creating it on first call."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=_dsn(),
            # Serverless-safe sizing: on Vercel each warm function instance keeps
            # its own pool, so min_size=0 means an idle instance holds ZERO server
            # connections, and a small max keeps (max_size × warm instances) well
            # under Supabase's pooler connection cap. Locally this just means the
            # first query opens the first connection (negligible).
            min_size=0,
            max_size=4,
            # Hosted poolers silently drop idle TCP connections; without these,
            # the first request after a quiet period could draw a dead
            # connection and 500. check= validates each connection ON CHECKOUT
            # (a cheap round-trip) and max_idle recycles ones parked too long —
            # together they make idle-then-burst usage (a live demo!) safe.
            check=ConnectionPool.check_connection,
            max_idle=240,
            kwargs={
                "row_factory": dict_row,      # dict rows for every connection
                # Supabase's transaction pooler (pgbouncer, port 6543) does not
                # support server-side prepared statements; disabling auto-prepare
                # keeps us compatible with the pooler AND a direct connection.
                "prepare_threshold": None,
                # Fail a connection attempt fast on a network blip (vs hanging),
                # so a transient hiccup surfaces quickly instead of a long stall.
                "connect_timeout": 10,
            },
            open=True,
        )
    return _pool


def close_pool() -> None:
    """Close the pool on application shutdown (called from the lifespan hook)."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """Yield a pooled connection inside a transaction.

    Commits when the ``with`` block exits cleanly; rolls back on any exception;
    always returns the connection to the pool. Use for any write, especially
    multi-statement ones that must be atomic.

        with transaction() as conn:
            conn.execute("INSERT ...", [...])
            conn.execute("UPDATE ...", [...])   # both commit together
    """
    with get_pool().connection() as conn:  # pool handles commit/rollback/return
        yield conn


def query(sql: str, params: list[Any] | tuple[Any, ...] | None = None) -> list[dict]:
    """Run a read query and return all rows as a list of dicts.

    Uses parameterized SQL (``%s`` placeholders) — never string interpolation —
    so it is injection-safe (BUILD_SPEC §15).
    """
    with get_pool().connection() as conn:
        cur = conn.execute(sql, params or [])
        return cur.fetchall() if cur.description else []
