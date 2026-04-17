import re
from app.data.chain_brands import match_chain

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

HIGH_TRAFFIC_TYPES = {
    "restaurant", "cafe", "bar", "bakery", "fast_food_restaurant",
    "coffee_shop", "hotel", "tourist_attraction",
}

TIER_1_CHAIN = {
    "gas_station", "fast_food_restaurant", "convenience_store",
    "hotel", "bank", "car_rental", "pharmacy", "department_store",
    "supermarket", "home_improvement_store", "warehouse_store",
    "auto_parts_store", "cell_phone_store", "discount_store",
}

TIER_2_MODERATE_CHAIN = {
    "coffee_shop", "sandwich_shop", "ice_cream_shop", "pet_store",
    "shoe_store", "fitness_center", "car_repair", "car_wash",
    "extended_stay_hotel", "motel",
}

TIER_4_MODERATE_LOCAL = {
    "cafe", "bakery", "fine_dining_restaurant", "seafood_restaurant",
    "brewery", "butcher_shop", "jewelry_store", "book_store",
    "hardware_store", "mediterranean_restaurant", "indian_restaurant",
    "japanese_restaurant", "thai_restaurant", "vietnamese_restaurant",
    "mexican_restaurant", "italian_restaurant", "chinese_restaurant",
    "korean_restaurant", "greek_restaurant", "turkish_restaurant",
    "brunch_restaurant", "ramen_restaurant", "sushi_restaurant",
    "vegetarian_restaurant", "vegan_restaurant",
}

TIER_5_LOCAL = {
    "art_gallery", "art_studio", "florist", "tailor",
    "body_art_service", "farmers_market", "bed_and_breakfast",
    "performing_arts_theater", "antique_store", "gift_shop",
    "pawn_shop", "second_hand_store", "furniture_store",
    "lawn_care", "locksmith", "moving_company", "plumber",
    "electrician", "roofing_contractor",
}

NON_CF_PATTERN = re.compile(
    r"\b(headquarters|hq|warehouse|distribution|wholesale only|corporate office|administrative|logistics|data center|call center|manufacturing|training center|fulfillment)\b",
    re.IGNORECASE,
)
CF_PATTERN = re.compile(
    r"\b(shop|store|restaurant|café|cafe|salon|clinic|gallery|gym|studio|boutique|bakery|bar|pub|grill|diner|kitchen|market)\b",
    re.IGNORECASE,
)


def _compute_name_score(name: str, address: str) -> float | None:
    score = 0.0
    has_signal = False

    if re.search(r"#\d{3,}|\bStore\s*\d+|\bUnit\s*\d{3,}", name, re.IGNORECASE):
        score -= 0.7; has_signal = True
    if re.search(r"[®™]", name):
        score -= 0.5; has_signal = True
    if re.match(r"^[A-Z]{2,5}$", name.strip()):
        score -= 0.3; has_signal = True

    if re.search(r"[A-Z][a-z]{2,}'s\b", name):
        score += 0.4; has_signal = True
    if re.search(r"^The\s+\w+\s+\w+", name, re.IGNORECASE):
        score += 0.25; has_signal = True
    if len(name.split()) >= 4:
        score += 0.15; has_signal = True

    parts = address.lower().split(",")
    if len(parts) >= 2:
        city = " ".join(parts[1].strip().split()[:2])
        if city and len(city) > 3 and city in name.lower():
            score += 0.3; has_signal = True

    return max(-1.0, min(1.0, score)) if has_signal else None


def _compute_review_count_score(count: int, primary_type: str | None) -> float | None:
    if count is None:
        return None
    is_high_traffic = any(t in (primary_type or "") for t in HIGH_TRAFFIC_TYPES)
    m = 2 if is_high_traffic else 1

    if count < 15 * m: return 0.3
    if count < 100 * m: return 0.1
    if count < 500 * m: return 0.0
    if count < 2000 * m: return -0.2
    return -0.4


def _compute_type_prior(primary_type: str | None) -> float | None:
    if not primary_type:
        return None
    if primary_type in TIER_1_CHAIN: return -0.5
    if primary_type in TIER_2_MODERATE_CHAIN: return -0.2
    if primary_type in TIER_4_MODERATE_LOCAL: return 0.2
    if primary_type in TIER_5_LOCAL: return 0.4
    return 0.0


def _compute_customer_facing_score(primary_type: str | None, business_status: str | None, name: str) -> float:
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


def score_business(business: dict) -> dict:
    name = business.get("name") or ""
    primary_type = business.get("primary_type")
    address = business.get("address_line_1") or ""
    review_count = business.get("review_count") or 0
    business_status = business.get("business_status")

    # Phase 0: Hard type exclusion
    if primary_type and primary_type in NON_CUSTOMER_FACING_TYPES:
        return {
            "independence_score": 0, "customer_facing_score": 0,
            "local_badge": None, "excluded": True,
            "exclusion_reason": "Non-customer-facing type",
        }

    # Customer-facing score
    cf_score = _compute_customer_facing_score(primary_type, business_status, name)
    if cf_score < 0.3:
        return {
            "independence_score": 0, "customer_facing_score": cf_score,
            "local_badge": None, "excluded": True,
            "exclusion_reason": "Not customer-facing",
        }

    # Phase 1: Chain name lookup
    chain = match_chain(name)
    if chain:
        return {
            "independence_score": 0.05, "customer_facing_score": cf_score,
            "local_badge": None, "excluded": True,
            "exclusion_reason": f"Known chain: {chain}",
        }

    # Phase 2: Heuristic scoring
    signals = []

    name_score = _compute_name_score(name, address)
    if name_score is not None:
        signals.append((0.30, name_score))

    review_score = _compute_review_count_score(review_count, primary_type)
    if review_score is not None:
        signals.append((0.35, review_score))

    type_score = _compute_type_prior(primary_type)
    if type_score is not None:
        signals.append((0.35, type_score))

    total_weight = sum(w for w, _ in signals)
    if total_weight == 0:
        independence_score = 0.55
    else:
        weighted_sum = sum(w * v for w, v in signals) / total_weight
        independence_score = (weighted_sum + 1) / 2

    excluded = independence_score < 0.3
    local_badge = None
    if not excluded:
        local_badge = "verified_local" if independence_score >= 0.6 else "likely_local"

    return {
        "independence_score": round(independence_score, 2),
        "customer_facing_score": round(cf_score, 2),
        "local_badge": local_badge,
        "excluded": excluded,
        "exclusion_reason": "Independence score below threshold" if excluded else None,
    }


def filter_and_score_businesses(businesses: list[dict]) -> list[dict]:
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
        })

    results.sort(key=lambda x: x.get("independence_score", 0), reverse=True)
    return results
