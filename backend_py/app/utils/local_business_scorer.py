"""
Local-business scorer + filter.

Two stages:
  Phase 0 — hard exclusion of non-customer-facing places (parking lots, govt,
            schools, churches, etc.). These can never be local businesses.
  Phase 1 — composite chain-vs-local detection via ``chain_detector.detect_chain``.
            Excludes any business whose chain probability ≥ 0.55, or any
            business whose name appears on the known-brand list.

The output schema (independence_score / customer_facing_score / local_badge)
is preserved so the AI ranker and the frontend keep working unchanged.
"""

from __future__ import annotations

import re
from app.data.chain_brands import match_chain
from app.utils.chain_detector import detect_chain

# Threshold above which a business is excluded as a chain.
# 0.65 is the empirically validated value from the reference algorithm;
# previous 0.55 was too aggressive and excluded legitimate independents.
# The detector additionally requires either confidence ≥ 0.30 OR a
# high-certainty signal (known brand / locator subdomain) to flag.
CHAIN_EXCLUSION_THRESHOLD = 0.65

# Probability/confidence cutoffs for showing a positive "local" badge.
VERIFIED_LOCAL_PROB = 0.35
VERIFIED_LOCAL_CONFIDENCE = 0.4
LIKELY_LOCAL_PROB = 0.50
LIKELY_LOCAL_CONFIDENCE = 0.25

NON_CUSTOMER_FACING_TYPES = {
    "corporate_office", "manufacturer", "supplier", "wholesaler",
    "government_office", "local_government_office", "post_office",
    "fire_station", "police", "courthouse", "embassy",
    "parking", "parking_lot", "parking_garage",
    "apartment_building", "apartment_complex", "condominium_complex",
    "research_institute", "television_studio", "cemetery",
    "transit_depot", "transit_station", "toll_station",
    "church", "mosque", "synagogue", "hindu_temple",
    "school", "primary_school", "secondary_school", "university",
    "library", "city_hall", "prison",
    "electric_vehicle_charging_station", "atm",
}

NON_CF_PATTERN = re.compile(
    r"\b(headquarters|hq|warehouse|distribution|wholesale only|corporate office|"
    r"administrative|logistics|data center|call center|manufacturing|"
    r"training center|fulfillment)\b",
    re.IGNORECASE,
)
CF_PATTERN = re.compile(
    r"\b(shop|store|restaurant|café|cafe|salon|clinic|gallery|gym|studio|"
    r"boutique|bakery|bar|pub|grill|diner|kitchen|market)\b",
    re.IGNORECASE,
)


def _customer_facing_score(primary_type: str | None,
                           business_status: str | None,
                           name: str) -> float:
    score = 0.5
    if primary_type and primary_type in NON_CUSTOMER_FACING_TYPES:
        score -= 0.5
    else:
        score += 0.3
    if business_status == "CLOSED_PERMANENTLY":
        score -= 0.4
    if NON_CF_PATTERN.search(name):
        score -= 0.3
    if CF_PATTERN.search(name):
        score += 0.2
    return max(0.0, min(1.0, score))


def _badge_for(probability: float, confidence: float) -> str | None:
    """Map detector output to the frontend's local_badge enum."""
    if probability <= VERIFIED_LOCAL_PROB and confidence >= VERIFIED_LOCAL_CONFIDENCE:
        return "verified_local"
    if probability <= LIKELY_LOCAL_PROB and confidence >= LIKELY_LOCAL_CONFIDENCE:
        return "likely_local"
    return None


def score_business(business: dict) -> dict:
    """Score a single business and decide whether to keep it.

    Returns a dict mirroring the legacy contract:
        {
          independence_score, customer_facing_score, local_badge,
          excluded, exclusion_reason,
          chain_detection,   # NEW: full per-signal breakdown for diagnostics
        }
    """
    name = business.get("name") or ""
    primary_type = business.get("primary_type")
    business_status = business.get("business_status")

    # Phase 0a — hard type exclusion.
    if primary_type and primary_type in NON_CUSTOMER_FACING_TYPES:
        return {
            "independence_score": 0,
            "customer_facing_score": 0,
            "local_badge": None,
            "excluded": True,
            "exclusion_reason": "Non-customer-facing type",
            "chain_detection": None,
        }

    # Phase 0b — soft customer-facing scoring (filters HQs, warehouses, etc.).
    cf_score = _customer_facing_score(primary_type, business_status, name)
    if cf_score < 0.3:
        return {
            "independence_score": 0,
            "customer_facing_score": cf_score,
            "local_badge": None,
            "excluded": True,
            "exclusion_reason": "Not customer-facing",
            "chain_detection": None,
        }

    # Phase 1a — known brand list is zero-tolerance, regardless of other signals.
    known = match_chain(name)
    if known:
        return {
            "independence_score": 0.05,
            "customer_facing_score": cf_score,
            "local_badge": None,
            "excluded": True,
            "exclusion_reason": f"Known chain: {known}",
            "chain_detection": None,
        }

    # Phase 1b — composite multi-signal chain detection.
    detection = detect_chain(business, threshold=CHAIN_EXCLUSION_THRESHOLD)
    chain_prob = detection["chain_probability"]
    confidence = detection["confidence"]

    if detection["is_chain"]:
        return {
            "independence_score": round(1 - chain_prob, 2),
            "customer_facing_score": round(cf_score, 2),
            "local_badge": None,
            "excluded": True,
            "exclusion_reason": f"Likely chain: {detection.get('primary_reason') or 'composite signals'}",
            "chain_detection": detection,
        }

    return {
        "independence_score": round(1 - chain_prob, 2),
        "customer_facing_score": round(cf_score, 2),
        "local_badge": _badge_for(chain_prob, confidence),
        "excluded": False,
        "exclusion_reason": None,
        "chain_detection": detection,
    }


def filter_and_score_businesses(businesses: list[dict]) -> list[dict]:
    """Run every business through ``score_business`` and return survivors,
    sorted by independence_score descending. Each survivor gets the new
    fields merged onto its dict in-place-style."""
    results = []
    for biz in businesses:
        result = score_business(biz)
        if result["excluded"]:
            continue
        results.append({
            **biz,
            "independence_score": result["independence_score"],
            "customer_facing_score": result["customer_facing_score"],
            "local_badge": result["local_badge"],
            "chain_detection": result["chain_detection"],
        })

    results.sort(key=lambda x: x.get("independence_score", 0), reverse=True)
    return results
