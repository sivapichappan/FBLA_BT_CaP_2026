"""In-process view of the chain registry — the search pipeline's first gate.

Two tiers with different matching rules, because they carry different evidence:

* **seed** rows come from the curated brand list. They are canonical brand
  names, so the full 4-pass fuzzy match applies ("Starbucks #4271 - Downtown"
  still matches "starbucks").
* **llm** rows are single Gemini convictions of one specific storefront name.
  They match by EXACT normalized name only — a learned "joe's pizza" in one
  city must never blanket-hide "Joe's Pizza & Sons" somewhere else.

The registry is loaded once per process and refreshed on a short TTL so
learning in one worker propagates to others. Every DB touch is failure-wrapped:
with the database down we fall back to the in-memory curated list, so the
filter never stops working (zero-runtime-errors rule, §13).
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from app.repositories import chains as chains_repo
from app.services.brands import CHAIN_BRANDS, match_against, normalize_name

log = logging.getLogger("locallens.chain_registry")

# How long a loaded snapshot stays fresh before we re-read the table.
_RELOAD_TTL_S = 600

_seed_names: set[str] = set(CHAIN_BRANDS)  # safe default before first load
_llm_entries: dict[str, dict[str, Any]] = {}
_loaded_at: float = 0.0


def load(force: bool = False) -> None:
    """(Re)load the registry from the DB; keep the previous state on failure."""
    global _seed_names, _llm_entries, _loaded_at
    if not force and time.monotonic() - _loaded_at < _RELOAD_TTL_S and _loaded_at:
        return
    try:
        rows = chains_repo.list_all()
        seed = {r["normalized_name"] for r in rows if r["source"] == "seed"}
        llm = {
            r["normalized_name"]: {"display_name": r["display_name"], "reason": r["reason"]}
            for r in rows
            if r["source"] == "llm"
        }
        # The curated list is always honored even if the DB seed is stale.
        _seed_names = seed | set(CHAIN_BRANDS)
        _llm_entries = llm
        _loaded_at = time.monotonic()
    except Exception as exc:
        log.warning("Registry load failed (%s) — using in-memory brand list.", exc)
        _loaded_at = time.monotonic()  # don't hammer a dead DB every request


def match(name: str) -> Optional[dict[str, Any]]:
    """Is this storefront name a known chain? Returns provenance or None."""
    load()

    hit = match_against(name, _seed_names, fuzzy=True)
    if hit:
        return {
            "matched": hit,
            "source": "seed",
            "reason": f'Matches "{hit}" in the curated chain-brand list.',
        }

    # LLM-learned names: exact only (plus the apostrophe-collapse pass).
    learned = match_against(name, set(_llm_entries), fuzzy=False)
    if learned:
        entry = _llm_entries[learned]
        return {
            "matched": learned,
            "source": "llm",
            "reason": entry.get("reason") or "Previously identified as a chain by the AI audit.",
        }
    return None


def record_llm_chains(items: list[dict[str, Any]]) -> None:
    """Persist newly convicted chains and start matching them immediately.

    A DB failure here loses the LEARNING, never the current request's
    filtering — the caller has already dropped these from its results.
    """
    entries = []
    for item in items:
        normalized = normalize_name(item["display_name"])
        if not normalized or normalized in _seed_names or normalized in _llm_entries:
            continue
        entries.append(
            {
                "normalized_name": normalized,
                "display_name": item["display_name"],
                "reason": item.get("reason"),
            }
        )
        _llm_entries[normalized] = {
            "display_name": item["display_name"],
            "reason": item.get("reason"),
        }
    if not entries:
        return
    try:
        added = chains_repo.add_chains(entries)
        if added:
            log.info("Registry learned %d new chain name(s): %s",
                     added, ", ".join(e["normalized_name"] for e in entries))
    except Exception as exc:
        log.warning("Could not persist %d learned chain(s): %s", len(entries), exc)


def _set_state_for_tests(seed: set[str], llm: dict[str, dict[str, Any]]) -> None:
    """Test seam: install registry state without a database."""
    global _seed_names, _llm_entries, _loaded_at
    _seed_names = seed
    _llm_entries = llm
    _loaded_at = time.monotonic()
