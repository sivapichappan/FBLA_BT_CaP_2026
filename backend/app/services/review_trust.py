"""Glass-box, hand-rolled trust weighting for reviews (§17).

The public 'raw' average treats every review equally — easy to game with fake
5-stars. We also compute an ADJUSTED rating that weights each review by how much
we trust it: a verified visit counts far more than an anonymous unverified
review; an older account and helpful votes nudge it up. Every weight is a simple,
stated rule (no black-box ML), so a student can defend each number — and the
detail page can show exactly why each review was weighted as it was.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from app.repositories import reviews as reviews_repo

# All weights are plain, defensible constants (not learned).
VERIFIED_WEIGHT = 1.0       # a review backed by a confirmed visit
UNVERIFIED_WEIGHT = 0.4     # an anonymous, unverified review counts much less
STRONG_BONUS = 0.3          # the visit was strongly verified (strength >= 75)
ESTABLISHED_BONUS = 0.15    # reviewer's account is older than 90 days
HELPFUL_BONUS = 0.15        # the review has >= 3 helpful votes
_ESTABLISHED_DAYS = 90
_HELPFUL_MIN = 3


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _weight(row: dict[str, Any]) -> tuple[float, list[str]]:
    """The trust weight for one review, plus the human-readable reasons."""
    reasons: list[str] = []
    if row["is_verified"]:
        weight = VERIFIED_WEIGHT
        reasons.append("verified visit")
        strength = row.get("verification_strength")
        if strength is not None and strength >= 75:
            weight += STRONG_BONUS
            reasons.append("strongly verified")
    else:
        weight = UNVERIFIED_WEIGHT
        reasons.append("unverified")
    created = row.get("user_created_at")
    if created is not None and (_now() - created).days >= _ESTABLISHED_DAYS:
        weight += ESTABLISHED_BONUS
        reasons.append("established account")
    if (row.get("helpful_count") or 0) >= _HELPFUL_MIN:
        weight += HELPFUL_BONUS
        reasons.append("found helpful")
    return weight, reasons


def trust_weighted_rating(business_id: int) -> dict[str, Any]:
    """The trust-adjusted rating for a business, with the factors that produced
    it. Returns adjusted_rating = None when there are no reviews."""
    rows = reviews_repo.rows_for_trust(business_id)
    if not rows:
        return {"adjusted_rating": None, "raw_rating": None, "review_count": 0,
                "verified_share": 0.0, "factors": []}

    total_weight = 0.0
    weighted_sum = 0.0
    verified = 0
    for row in rows:
        weight, _ = _weight(row)
        total_weight += weight
        weighted_sum += weight * row["rating"]
        if row["is_verified"]:
            verified += 1

    raw = sum(r["rating"] for r in rows) / len(rows)
    adjusted = weighted_sum / total_weight if total_weight else raw
    return {
        "adjusted_rating": round(adjusted, 2),
        "raw_rating": round(raw, 2),
        "review_count": len(rows),
        "verified_share": round(verified / len(rows), 2),
        "factors": [
            f"Verified reviews weighted {VERIFIED_WEIGHT:g}× vs {UNVERIFIED_WEIGHT:g}× for unverified",
            "Strongly-verified, established-account, and helpful reviews count a little more",
        ],
    }
