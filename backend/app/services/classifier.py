"""The small-business filter — every Google result passes through here.

Pipeline (cheapest evidence first; chains are hidden EVERYWHERE, no toggle):

1. **Chain registry** (services/chain_registry): seeded brand list + names
   Gemini has already convicted. Free, instant, catches the common case.
2. **Per-place verdict cache** (places_cache, 30-day TTL): a business Gemini
   has already judged never costs a second call.
3. **Gemini audit** — ONE batched call for all remaining unknowns, with a
   strict definition (corporate chains/franchises = hide; locally-owned
   multi-location single-city businesses = small) and an uncertainty rule
   that always favors SHOWING (never hide a real independent).
4. **Learning**: high-confidence chain verdicts are written back to the
   registry, so the next search — in any city — drops that name for free.

Failure policy (§13): if the LLM is unreachable or returns garbage, unknowns
PASS as small businesses, badged "likely_local" with verdict_source
"unverified-offline" — the registry alone keeps filtering. The pipeline can
degrade, but it can never crash a search or silently hide an independent.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Optional

from app.services import chain_registry, llm, places_cache

log = logging.getLogger("locallens.classifier")

VERDICT_CACHE_PREFIX = "verdict:"  # places_cache key per Google place_id
VERDICT_TTL_S = 86400 * 30         # ownership rarely changes; re-check monthly

# What the ranker's independence factor sees for each provenance tier.
CONFIRMED_CONFIDENCE = 0.90
UNVERIFIED_CONFIDENCE = 0.50

LlmFn = Callable[[list[dict]], Awaitable[Optional[dict[str, dict]]]]


def _mark_small(b: dict[str, Any], *, source: str, reason: str,
                confidence: float, badge: str) -> None:
    """Annotate a surviving candidate with its small-business provenance."""
    b["is_independent"] = True
    b["local_confidence"] = confidence
    b["local_badge"] = badge
    b["verdict_source"] = source
    b["verdict_reason"] = reason


def _llm_row(b: dict[str, Any]) -> dict[str, Any]:
    """The evidence one unknown contributes to the batched prompt (nulls omitted)."""
    row = {
        "id": b.get("place_id"),
        "name": b.get("name"),
        "type": b.get("primary_type"),
        "categories": b.get("categories"),
        "reviews": b.get("review_count"),
        "rating": b.get("average_rating"),
        "website": b.get("website"),
        "summary": b.get("editorial_summary"),
        "address": b.get("address"),
    }
    return {k: v for k, v in row.items() if v not in (None, "", [])}


async def annotate(candidates: list[dict[str, Any]], *,
                   llm_fn: Optional[LlmFn] = None) -> list[dict[str, Any]]:
    """Filter Google candidates down to small businesses (annotated in place).

    Returns only the survivors. ``llm_fn`` is injectable for tests; it defaults
    to the real batched Gemini call.
    """
    survivors: list[dict[str, Any]] = []
    unknowns: list[dict[str, Any]] = []

    for b in candidates:
        # Gate 1 — the registry (checked BEFORE the per-place cache: a newly
        # learned name is stronger, fresher evidence than an old "small").
        if chain_registry.match(b["name"]):
            continue

        # Gate 2 — this exact place was judged before.
        cached = None
        if b.get("place_id"):
            cached = places_cache.get(
                f"{VERDICT_CACHE_PREFIX}{b['place_id']}", max_age_s=VERDICT_TTL_S
            )
        if cached:
            if cached.get("verdict") == "chain":
                continue
            _mark_small(b, source="gemini", reason=cached.get("reason") or "",
                        confidence=CONFIRMED_CONFIDENCE, badge="verified_local")
            survivors.append(b)
            continue

        unknowns.append(b)

    # Gate 3 — one batched Gemini call for everything still unknown.
    verdicts: Optional[dict[str, dict]] = {}
    if unknowns:
        verdicts = await (llm_fn or llm.classify_chains)([_llm_row(b) for b in unknowns])

    learned: list[dict[str, Any]] = []
    for b in unknowns:
        v = (verdicts or {}).get(str(b.get("place_id")))
        if v is None:
            # Offline / malformed / missing id → pass, honestly badged, NOT
            # cached (we want to re-try verification next time we're online).
            _mark_small(
                b, source="unverified-offline",
                reason="Couldn't verify online — shown to be fair to small businesses.",
                confidence=UNVERIFIED_CONFIDENCE, badge="likely_local",
            )
            survivors.append(b)
        elif v["verdict"] == "small":
            if b.get("place_id"):
                places_cache.set(f"{VERDICT_CACHE_PREFIX}{b['place_id']}",
                                 {"verdict": "small", "reason": v["reason"]})
            _mark_small(b, source="gemini", reason=v["reason"],
                        confidence=CONFIRMED_CONFIDENCE, badge="verified_local")
            survivors.append(b)
        else:  # chain → hide now; learn the NAME only on high confidence
            if b.get("place_id"):
                places_cache.set(f"{VERDICT_CACHE_PREFIX}{b['place_id']}",
                                 {"verdict": "chain", "reason": v["reason"]})
            if v["confidence"] == "high":
                learned.append({"display_name": b["name"], "reason": v["reason"]})

    if learned:
        chain_registry.record_llm_chains(learned)
    return survivors


def verdict_for_local(row: dict[str, Any]) -> dict[str, Any]:
    """Provenance for a LocalLens-listed business (seeded or owner-added).

    These rows are accountable to a real owner record, so they skip the
    registry and the LLM entirely — small by construction.
    """
    return {
        "source": "local-owner",
        "reason": "Listed directly on LocalLens by its owner — accountable, not scraped.",
        "confidence": float(row.get("local_confidence") or CONFIRMED_CONFIDENCE),
    }


async def classify_one(detail: dict[str, Any]) -> dict[str, Any]:
    """Full provenance trail for one Google place (the "why this verdict?" panel).

    Unlike annotate(), this never drops anything — a chain gets an honest
    "reads as a chain" verdict rather than disappearing, because the user is
    already looking at its detail page.
    """
    checks: list[dict[str, str]] = [
        {"step": "owner_record", "outcome": "skipped",
         "detail": "Not a LocalLens-listed business."},
    ]

    registry_hit = chain_registry.match(detail["name"])
    if registry_hit:
        which = ("curated brand list" if registry_hit["source"] == "seed"
                 else "AI-learned chain names")
        checks.append({"step": "chain_registry", "outcome": "matched",
                       "detail": f'Matches "{registry_hit["matched"]}" ({which}).'})
        checks.append({"step": "verdict_cache", "outcome": "skipped",
                       "detail": "Registry already decided."})
        checks.append({"step": "gemini", "outcome": "skipped",
                       "detail": "Registry already decided."})
        return {"verdict": "chain", "source": "known-registry",
                "reason": registry_hit["reason"], "confidence": CONFIRMED_CONFIDENCE,
                "checks": checks}
    checks.append({"step": "chain_registry", "outcome": "passed",
                   "detail": "No match among seeded or learned chain names."})

    cached = None
    if detail.get("place_id"):
        cached = places_cache.get(
            f"{VERDICT_CACHE_PREFIX}{detail['place_id']}", max_age_s=VERDICT_TTL_S
        )
    if cached:
        checks.append({"step": "verdict_cache", "outcome": "hit",
                       "detail": "This place was audited recently; reusing that verdict."})
        checks.append({"step": "gemini", "outcome": "skipped",
                       "detail": "Cached verdict reused."})
        return {"verdict": cached["verdict"], "source": "gemini",
                "reason": cached.get("reason") or "", "confidence": CONFIRMED_CONFIDENCE,
                "checks": checks}
    checks.append({"step": "verdict_cache", "outcome": "miss",
                   "detail": "First time auditing this place."})

    verdicts = await llm.classify_chains([_llm_row(detail)])
    v = (verdicts or {}).get(str(detail.get("place_id")))
    if v is None:
        checks.append({"step": "gemini", "outcome": "unavailable",
                       "detail": "AI audit unreachable — shown unverified rather than hidden."})
        return {"verdict": "small", "source": "unverified-offline",
                "reason": "Couldn't verify online — shown to be fair to small businesses.",
                "confidence": UNVERIFIED_CONFIDENCE, "checks": checks}

    checks.append({"step": "gemini", "outcome": "answered",
                   "detail": f'Gemini verdict: {v["verdict"]} ({v["confidence"]} confidence).'})
    if detail.get("place_id"):
        places_cache.set(f"{VERDICT_CACHE_PREFIX}{detail['place_id']}",
                         {"verdict": v["verdict"], "reason": v["reason"]})
    if v["verdict"] == "chain" and v["confidence"] == "high":
        chain_registry.record_llm_chains(
            [{"display_name": detail["name"], "reason": v["reason"]}])
    return {"verdict": v["verdict"], "source": "gemini", "reason": v["reason"],
            "confidence": CONFIRMED_CONFIDENCE, "checks": checks}
