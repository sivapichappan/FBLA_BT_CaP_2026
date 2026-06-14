"""Data access for the chain registry — the persistent list of names known to
NOT be small businesses. Seeded from the curated brand list at migrate time;
grows as the Gemini classifier convicts new chains at search time."""

from __future__ import annotations

from typing import Any

from app.db.connection import query, transaction


def list_all() -> list[dict[str, Any]]:
    """Every registry row (the in-process cache loads from this once)."""
    return query(
        "SELECT normalized_name, display_name, source, reason FROM chain_registry"
    )


def _insert(entries: list[dict[str, Any]], source: str) -> int:
    """Shared insert; duplicates are silently skipped so concurrent writers
    (or re-imports of the same list) can never conflict."""
    if not entries:
        return 0
    inserted = 0
    with transaction() as conn:
        for e in entries:
            cur = conn.execute(
                "INSERT INTO chain_registry (normalized_name, display_name, source, reason) "
                "VALUES (%(normalized_name)s, %(display_name)s, %(source)s, %(reason)s) "
                "ON CONFLICT (normalized_name) DO NOTHING",
                {**e, "source": source},
            )
            inserted += cur.rowcount
    return inserted


def add_chains(entries: list[dict[str, Any]]) -> int:
    """Chains the Gemini audit convicted at search time (exact-only matching)."""
    return _insert(entries, "llm")


def add_chains_seed(entries: list[dict[str, Any]]) -> int:
    """Curated canonical brand names (bulk import) — get full fuzzy matching."""
    return _insert(entries, "seed")
