"""
Composite chain-vs-local detection for LocalLens.

Public entry point: ``detect_chain(business: dict) -> dict``.

Each signal is independent and may return ``None`` when it has nothing to say.
The aggregator takes a weighted average over signals that fired, so missing
fields never penalise a business. Output includes per-signal breakdown so
callers can show *why* a business was flagged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

from app.data.chain_brands import match_chain, normalize_name

# Threshold above which a business is considered a chain.
# 0.65 — balanced. Empirically validated in the reference algorithm
# (95% precision / ~90% recall on a small chain/local validation set).
CHAIN_THRESHOLD = 0.65

# Minimum confidence required for an exclusion (unless the primary signal
# is a high-certainty one — see _is_high_certainty_chain). A single weak
# signal should never be enough to drop a business.
MIN_EXCLUSION_CONFIDENCE = 0.30

# Signal names that are reliable enough to flag a chain on their own,
# regardless of overall confidence.
HIGH_CERTAINTY_SIGNALS = {"known_brand", "locator_subdomain"}

# --- Type priors (independent of the existing scorer's tiers) ---------------

CHAIN_HEAVY_TYPES = {
    "gas_station", "fast_food_restaurant", "convenience_store", "bank", "atm",
    "pharmacy", "car_rental", "department_store", "warehouse_store",
    "home_improvement_store", "auto_parts_store", "cell_phone_store",
    "discount_store", "supermarket", "hotel", "extended_stay_hotel", "motel",
    "insurance_agency", "mattress_store",
}

CHAIN_LEAN_TYPES = {
    "coffee_shop", "sandwich_shop", "ice_cream_shop", "shoe_store",
    "fitness_center", "car_repair", "car_wash", "pet_store",
    "clothing_store", "furniture_store", "health_food_store",
    "beauty_supply_store", "thrift_store",
}

LOCAL_LEAN_TYPES = {
    "cafe", "bakery", "fine_dining_restaurant", "seafood_restaurant",
    "brewery", "butcher_shop", "jewelry_store", "book_store", "hardware_store",
    "brunch_restaurant", "ramen_restaurant", "sushi_restaurant",
    "italian_restaurant", "mexican_restaurant", "thai_restaurant",
    "vietnamese_restaurant", "indian_restaurant", "japanese_restaurant",
    "korean_restaurant", "greek_restaurant", "turkish_restaurant",
    "mediterranean_restaurant",
}

LOCAL_HEAVY_TYPES = {
    "art_gallery", "art_studio", "florist", "tailor", "body_art_service",
    "farmers_market", "bed_and_breakfast", "performing_arts_theater",
    "antique_store", "gift_shop", "pawn_shop", "second_hand_store",
    "lawn_care", "locksmith", "moving_company", "plumber", "electrician",
    "roofing_contractor",
}

# Per-type "expected" review-count baselines. Counts well above these for
# small-footprint types are a chain signal.
TYPE_REVIEW_BASELINE = {
    "fast_food_restaurant": 800,
    "coffee_shop": 600,
    "restaurant": 400,
    "cafe": 250,
    "bar": 250,
    "bakery": 200,
    "gas_station": 300,
    "convenience_store": 200,
    "pharmacy": 300,
    "supermarket": 1500,
    "bank": 100,
    "hotel": 800,
}

# --- Lexical patterns -------------------------------------------------------

LOCATION_NUMBER_RE = re.compile(r"#\s*\d{2,}|\bstore\s*\d+|\bunit\s*\d{2,}|\bno\.?\s*\d{2,}", re.I)
TRADEMARK_RE = re.compile(r"[®™©]")
ALL_CAPS_ACRONYM_RE = re.compile(r"^[A-Z]{2,5}$")
SUFFIX_LOCATION_RE = re.compile(
    r"\s-\s(downtown|midtown|uptown|north|south|east|west|central|airport|"
    r"mall|plaza|square|station|terminal|outlet)\b",
    re.I,
)
PERSONAL_POSSESSIVE_RE = re.compile(r"^[A-Z][a-z]{2,}'s\b")
THE_X_Y_Z_RE = re.compile(r"^the\s+\w+\s+\w+", re.I)

CHAIN_DESCRIPTION_RE = re.compile(
    r"\b(chain|franchise|nationwide|nationally|multinational|global brand|"
    r"locations across|fast[- ]food|outlet of)\b",
    re.I,
)
LOCAL_DESCRIPTION_RE = re.compile(
    r"\b(family[- ]owned|family[- ]run|locally[- ]owned|neighborhood|"
    r"independent|artisan|small[- ]batch|hand[- ]made|since \d{4})\b",
    re.I,
)

TOLL_FREE_RE = re.compile(r"^\+?1?[\s\-.]?\(?(800|888|877|866|855|844|833)\)?")

# Words to strip before checking whether a domain mirrors the business name.
DOMAIN_NOISE = {"the", "and", "of", "a", "an", "co", "inc", "llc", "ltd", "company"}


# --- Signal infrastructure --------------------------------------------------

@dataclass
class Signal:
    name: str
    score: float          # in [-1, +1]; +1 = chain, -1 = local
    weight: float         # in [0, 1]; how much this signal counts when present
    reason: str

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "score": round(self.score, 3),
            "weight": self.weight,
            "reason": self.reason,
        }


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


# --- Individual signals -----------------------------------------------------

def _signal_known_brand(name: str) -> Optional[Signal]:
    if not name:
        return None
    chain = match_chain(name)
    if chain:
        return Signal("known_brand", 1.0, 1.0, f"matches known chain: {chain}")
    return None


def _signal_website(name: str, website: Optional[str]) -> Optional[Signal]:
    """Website-based chain signals.

    Two reliable patterns:
      1. Locator subdomain (locations.X.com / stores.X.com) — high-certainty
         chain tell, named ``locator_subdomain`` so callers can treat it
         as bypassing the confidence floor.
      2. Domain unrelated to business name — sometimes a corporate parent
         (yum.com → Taco Bell). Weak signal, low weight.

    The previous "domain mirrors brand" check was REMOVED because every
    local business with its own website triggers it (Bella Vita Ristorante
    → bellavitanj.com is normal, not a chain signal).
    """
    if not website:
        return None
    try:
        host = urlparse(website).netloc.lower()
    except ValueError:
        return None
    if not host:
        return None
    if host.startswith("www."):
        host = host[4:]

    # Locator-style subdomains are an unambiguous chain tell.
    if any(sd in host for sd in ("locations.", "stores.", "find.", "locator.")):
        return Signal("locator_subdomain", 0.9, 0.7, f"locator-style subdomain: {host}")

    name_tokens = [
        t for t in re.split(r"[^a-z0-9]+", normalize_name(name))
        if t and t not in DOMAIN_NOISE
    ]
    if not name_tokens:
        return None

    domain_root = host.split(".")[0] if "." in host else host

    # If any meaningful name token (≥4 chars) appears in the domain root,
    # the domain mirrors the business — that's a local pattern, not a
    # chain pattern. "Bella Vita Ristorante" → bellavitanj.com mirrors
    # "bella" / "vita". "Smile Dental" → smiledentalnj.com mirrors
    # "smile" / "dental". Return None (no signal).
    if any(t in domain_root for t in name_tokens if len(t) >= 4):
        return None

    # Domain unrelated to name — possible corporate parent (yum.com →
    # Taco Bell). Weak signal, low weight; we used to set this at
    # 0.5/0.5 but it fired too often on legitimate small businesses.
    return Signal("website", 0.4, 0.3, f"domain '{host}' unrelated to business name")


def _signal_phone(phone: Optional[str]) -> Optional[Signal]:
    if not phone:
        return None
    if TOLL_FREE_RE.match(phone.strip()):
        return Signal("phone", 0.8, 0.5, "toll-free number (corporate)")
    return None


def _signal_name_pattern(name: str) -> Optional[Signal]:
    if not name:
        return None
    score = 0.0
    reasons = []

    if LOCATION_NUMBER_RE.search(name):
        score += 0.7
        reasons.append("location number in name")
    if TRADEMARK_RE.search(name):
        score += 0.4
        reasons.append("trademark symbol")
    if ALL_CAPS_ACRONYM_RE.match(name.strip()):
        score += 0.4
        reasons.append("all-caps acronym name")
    if SUFFIX_LOCATION_RE.search(name):
        score += 0.5
        reasons.append("location suffix (e.g. ' - Airport')")

    if not reasons:
        return None
    return Signal("name_pattern", _clamp(score), 0.5, "; ".join(reasons))


def _signal_personal_name(name: str) -> Optional[Signal]:
    if not name:
        return None
    # Possessives are weakly local — many famous chains use this format
    # (Wendy's, McDonald's, Claire's, Macy's). Don't let it dominate.
    if PERSONAL_POSSESSIVE_RE.match(name) and len(name.split()) <= 4:
        return Signal("personal_name", -0.4, 0.3, "personal possessive name")
    if THE_X_Y_Z_RE.match(name) and len(name.split()) >= 3:
        return Signal("personal_name", -0.3, 0.3,
                      "'The X Y' descriptive name")
    return None


def _signal_editorial_summary(summary: Optional[str]) -> Optional[Signal]:
    if not summary:
        return None
    chain_hit = bool(CHAIN_DESCRIPTION_RE.search(summary))
    local_hit = bool(LOCAL_DESCRIPTION_RE.search(summary))
    if chain_hit and not local_hit:
        return Signal("editorial", 0.8, 0.4,
                      "editorial summary uses chain language")
    if local_hit and not chain_hit:
        return Signal("editorial", -0.8, 0.4,
                      "editorial summary uses local language")
    return None


def _signal_type_prior(primary_type: Optional[str]) -> Optional[Signal]:
    if not primary_type:
        return None
    if primary_type in CHAIN_HEAVY_TYPES:
        return Signal("type_prior", 0.7, 0.4,
                      f"type '{primary_type}' is mostly chains")
    if primary_type in CHAIN_LEAN_TYPES:
        return Signal("type_prior", 0.3, 0.4,
                      f"type '{primary_type}' leans chain")
    if primary_type in LOCAL_LEAN_TYPES:
        return Signal("type_prior", -0.3, 0.4,
                      f"type '{primary_type}' leans local")
    if primary_type in LOCAL_HEAVY_TYPES:
        return Signal("type_prior", -0.7, 0.4,
                      f"type '{primary_type}' is mostly locals")
    return None


def _signal_review_volume(review_count: Optional[int],
                          primary_type: Optional[str]) -> Optional[Signal]:
    if not review_count:
        return None
    baseline = TYPE_REVIEW_BASELINE.get(primary_type or "", 300)
    ratio = review_count / baseline
    if ratio >= 4:
        return Signal("review_volume", 0.7, 0.3,
                      f"{review_count} reviews ≫ baseline {baseline}")
    if ratio >= 2:
        return Signal("review_volume", 0.3, 0.3,
                      f"{review_count} reviews above baseline {baseline}")
    if ratio < 0.1:
        return Signal("review_volume", -0.4, 0.3,
                      f"{review_count} reviews ≪ baseline {baseline}")
    if ratio < 0.4:
        return Signal("review_volume", -0.2, 0.3,
                      f"{review_count} reviews below baseline {baseline}")
    return None


def _signal_rating_distribution(rating: Optional[float],
                                review_count: Optional[int]) -> Optional[Signal]:
    if rating is None or review_count is None or review_count < 30:
        return None
    if 3.4 <= rating <= 4.0 and review_count >= 500:
        return Signal("rating_dist", 0.4, 0.2,
                      "high-volume mid-rating profile typical of chains")
    if rating >= 4.5 and review_count < 500:
        return Signal("rating_dist", -0.4, 0.2,
                      "high-rating low-volume profile typical of locals")
    return None


def _signal_city_in_name(name: str, address: Optional[str],
                         city: Optional[str] = None) -> Optional[Signal]:
    if not name:
        return None
    # Prefer the parsed city field; fall back to splitting the address.
    candidate_city = (city or "").strip().lower()
    if not candidate_city and address:
        parts = address.split(",")
        if len(parts) >= 2:
            candidate_city = " ".join(parts[1].strip().split()[:2]).lower()
    if not candidate_city or len(candidate_city) < 4:
        return None
    if candidate_city in name.lower():
        return Signal("city_in_name", -0.6, 0.3,
                      f"city '{candidate_city}' appears in name")
    return None


# --- Aggregation ------------------------------------------------------------

def _aggregate(signals: list[Signal]) -> tuple[float, float, Optional[Signal]]:
    """Returns (chain_probability, confidence, primary_signal)."""
    if not signals:
        return 0.5, 0.0, None
    total_weight = sum(s.weight for s in signals)
    if total_weight == 0:
        return 0.5, 0.0, None
    weighted_sum = sum(s.weight * s.score for s in signals) / total_weight
    probability = (weighted_sum + 1) / 2  # map [-1,1] → [0,1]
    # Confidence = how much of the maximum possible weight actually fired.
    # 4.0 ≈ approximate sum of all signal max-weights when every one fires.
    max_possible = 4.0
    confidence = min(1.0, total_weight / max_possible)
    primary = max(signals, key=lambda s: s.weight * abs(s.score))
    return probability, confidence, primary


# --- Public API -------------------------------------------------------------

def detect_chain(business: dict, threshold: float = CHAIN_THRESHOLD) -> dict:
    """Score a business as chain vs local using composite signals.

    Args:
        business: dict produced by ``google_places.format_place`` (or any
            dict with the same keys). Recognised fields: ``name``,
            ``primary_type``, ``address_line_1``, ``city``, ``average_rating``,
            ``review_count``, ``business_status``, ``website``,
            ``editorial_summary``, ``description``, ``phone``.
        threshold: probability above which ``is_chain`` is True.

    Returns:
        {
            "chain_probability": float in [0, 1],
            "is_chain": bool,
            "confidence": float in [0, 1],
            "primary_reason": str | None,
            "signals": [ {name, score, weight, reason}, ... ],
        }
    """
    name = business.get("name") or ""
    primary_type = business.get("primary_type")
    address = business.get("address_line_1") or business.get("formatted_address") or ""
    city = business.get("city")
    rating = business.get("average_rating")
    review_count = business.get("review_count")
    website = business.get("website") or business.get("websiteUri")
    summary = business.get("editorial_summary") or business.get("description")
    phone = (
        business.get("phone")
        or business.get("international_phone_number")
        or business.get("internationalPhoneNumber")
    )

    candidates = [
        _signal_known_brand(name),
        _signal_website(name, website),
        _signal_phone(phone),
        _signal_name_pattern(name),
        _signal_personal_name(name),
        _signal_editorial_summary(summary),
        _signal_type_prior(primary_type),
        _signal_review_volume(review_count, primary_type),
        _signal_rating_distribution(rating, review_count),
        _signal_city_in_name(name, address, city),
    ]
    signals = [s for s in candidates if s is not None]

    probability, confidence, primary = _aggregate(signals)

    # Above-threshold flag must be backed by enough evidence. A single
    # weak chain signal (e.g. "this is a mattress_store, mostly chains")
    # is not enough on its own — many independents exist in chain-heavy
    # categories. Bypass the confidence floor only when the primary
    # signal is itself high-certainty (known brand, locator subdomain).
    above_threshold = probability >= threshold
    primary_is_certain = primary is not None and primary.name in HIGH_CERTAINTY_SIGNALS
    is_chain = above_threshold and (
        confidence >= MIN_EXCLUSION_CONFIDENCE or primary_is_certain
    )

    return {
        "chain_probability": round(probability, 3),
        "is_chain": is_chain,
        "confidence": round(confidence, 3),
        "primary_reason": primary.reason if primary else None,
        "signals": [s.to_dict() for s in signals],
    }
