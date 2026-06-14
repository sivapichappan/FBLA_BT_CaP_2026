"""Bulk-import a curated chain list (markdown) into the chain registry.

Companion to the harvester: instead of discovering chains one Gemini audit at
a time, a comprehensive list can be compiled offline (e.g., by an AI assistant
with web search) and imported in one shot — no API quota involved.

Expected file shape (anything else is ignored):

    ## Coffee & Tea
    - Starbucks
    - Dutch Bros Coffee

Every bullet becomes a registry row (source='seed', so the canonical brand
names get the same 4-pass fuzzy matching as the built-in list). Existing
names — built-in, learned, or previously imported — are skipped via
ON CONFLICT, so re-importing an updated file is safe.

Safety: names that normalize to a SINGLE word are matched by prefix at search
time, so a generic English word could swallow small businesses ("Subway" vs
"Subway Deli & Grill" is guarded, but new ambiguous words aren't). The import
prints every single-word insertion for a human eyeball pass; remove a bad one
with:  DELETE FROM chain_registry WHERE normalized_name = '…';

Run from ``backend/``:

    python -m app.db.import_chains path/to/chains.md
"""

from __future__ import annotations

import sys
from pathlib import Path

from app.repositories import chains as chains_repo
from app.services.brands import AMBIGUOUS_BRANDS, normalize_name
from app.services.chain_registry import load as reload_registry


def parse_markdown(text: str) -> list[str]:
    """Extract '- Brand Name' bullets (headers/prose/blank lines ignored)."""
    names: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(("- ", "* ")):
            name = line[2:].strip().strip("*_`").strip()
            if name:
                names.append(name)
    return names


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python -m app.db.import_chains <chains.md>")
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"no such file: {path}")
        return 2

    raw_names = parse_markdown(path.read_text(encoding="utf-8"))
    print(f"Parsed {len(raw_names)} bullets from {path.name}.")

    # Normalize + dedupe within the file (first spelling wins).
    by_normalized: dict[str, str] = {}
    for name in raw_names:
        normalized = normalize_name(name)
        if normalized and normalized not in by_normalized:
            by_normalized[normalized] = name

    entries = [
        {
            "normalized_name": normalized,
            "display_name": display,
            "reason": "Curated US chain list (AI-compiled import)",
        }
        for normalized, display in by_normalized.items()
    ]

    # source='seed' rows get fuzzy matching — right for canonical brand names.
    inserted = chains_repo.add_chains_seed(entries)
    print(f"Inserted {inserted} new chains "
          f"({len(entries) - inserted} already known).")

    # Audit pass: single-word names match by prefix, so list any new ones that
    # aren't already covered by the ambiguity guard for a human once-over.
    singles = sorted(
        n for n in by_normalized
        if " " not in n and n not in AMBIGUOUS_BRANDS
    )
    if singles:
        print(f"\nSingle-word names to eyeball ({len(singles)}) — a generic "
              f"English word here could over-match small businesses:")
        for n in singles:
            print(f"  {n}")
        print("Remove a bad one with: DELETE FROM chain_registry "
              "WHERE normalized_name = '<name>';")

    reload_registry(force=True)  # this process; servers refresh within 10 min
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
