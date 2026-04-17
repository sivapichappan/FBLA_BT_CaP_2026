import math

DEFAULT_WEIGHTS = {
    "distance": 0.25, "rating": 0.22, "review_count": 0.13,
    "independence": 0.12, "customer_facing": 0.08, "price_match": 0.08,
    "category_match": 0.07, "open_status": 0.05,
}

INTENT_MULTIPLIERS = {
    "CHEAP_BUDGET":      {"price_match": 4.0, "distance": 0.8, "rating": 0.7, "independence": 1.2},
    "NEARBY_CLOSEST":    {"distance": 3.5, "rating": 0.5, "review_count": 0.4, "open_status": 2.0},
    "HIGHLY_RATED":      {"rating": 3.0, "review_count": 2.5, "distance": 0.6, "price_match": 0.5},
    "SPECIFIC_CATEGORY": {"category_match": 4.0},
    "OPEN_NOW":          {"open_status": 5.0, "distance": 1.5, "rating": 0.7},
    "SUPPORT_LOCAL":     {"independence": 4.0, "customer_facing": 2.0, "distance": 0.8, "rating": 0.9},
    "EXPLORATORY":       {"distance": 0.6, "rating": 0.8, "review_count": 0.6, "independence": 1.5},
    "GENERAL_CHAT":      {},
}


def _norm_distance(km: float, sigma: float = 2.0) -> float:
    return math.exp(-(km ** 2) / (2 * sigma ** 2))


def _norm_rating(avg: float, count: int, c: float = 3.7, m: int = 15) -> float:
    if count == 0:
        return c / 5.0
    bayesian = (count / (count + m)) * avg + (m / (count + m)) * c
    return bayesian / 5.0


def _norm_review_count(count: int, baseline: int = 50) -> float:
    return min(1.0, math.log(1 + count) / math.log(1 + baseline))


def _norm_price(level, direction) -> float:
    if level is None:
        return 0.5
    if direction == "cheap":
        return (5 - level) / 4
    if direction == "expensive":
        return level / 4
    return 1.0 - abs(level - 2.5) / 2.5


def _norm_category(biz_type, search_query) -> float:
    if not search_query:
        return 0.5
    if not biz_type:
        return 0.0
    biz = biz_type.lower().replace("_", " ")
    q = search_query.lower()
    if biz in q or q in biz:
        return 1.0
    q_words = q.split()
    b_words = biz.split()
    overlap = [w for w in q_words if any(w in bw or bw in w for bw in b_words)]
    return 0.7 if overlap else 0.0


def _norm_open(is_open, intent: str):
    if intent == "OPEN_NOW" and is_open is False:
        return None  # hard exclude
    if is_open is True:
        return 1.0
    if is_open is False:
        return 0.3
    return 0.5


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def rank_businesses(businesses: list[dict], user_lat: float, user_lng: float, intent: dict) -> list[dict]:
    intent_type = intent.get("intent", "EXPLORATORY")
    mods = INTENT_MULTIPLIERS.get(intent_type, {})

    weights = {}
    total = 0.0
    for k, v in DEFAULT_WEIGHTS.items():
        weights[k] = v * mods.get(k, 1.0)
        total += weights[k]
    for k in weights:
        weights[k] /= total

    scored = []
    for biz in businesses:
        dist_km = haversine_distance(user_lat, user_lng, biz.get("latitude", 0), biz.get("longitude", 0))

        open_score = _norm_open(biz.get("is_open_now"), intent_type)
        if open_score is None:
            continue

        scores = {
            "distance": _norm_distance(dist_km),
            "rating": _norm_rating(biz.get("average_rating", 0), biz.get("review_count", 0)),
            "review_count": _norm_review_count(biz.get("review_count", 0)),
            "independence": biz.get("independence_score") if biz.get("independence_score") is not None else 0.5,
            "customer_facing": biz.get("customer_facing_score") if biz.get("customer_facing_score") is not None else 0.5,
            "price_match": _norm_price(biz.get("price_level"), intent.get("price_direction")),
            "category_match": _norm_category(biz.get("primary_type") or biz.get("category_name"), intent.get("search_query")),
            "open_status": open_score,
        }

        composite = sum(weights[k] * scores[k] for k in weights)

        scored.append({
            "id": biz.get("id"),
            "place_id": biz.get("place_id"),
            "name": biz.get("name", ""),
            "description": biz.get("description"),
            "editorial_summary": biz.get("editorial_summary"),
            "address_line_1": biz.get("address_line_1", ""),
            "city": biz.get("city", ""),
            "state": biz.get("state", ""),
            "latitude": biz.get("latitude", 0),
            "longitude": biz.get("longitude", 0),
            "average_rating": biz.get("average_rating", 0),
            "review_count": biz.get("review_count", 0),
            "price_level": biz.get("price_level"),
            "primary_type": biz.get("primary_type"),
            "primary_type_display_name": biz.get("primary_type_display_name"),
            "category_name": biz.get("category_name", "Business"),
            "is_open_now": biz.get("is_open_now"),
            "independence_score": biz.get("independence_score"),
            "customer_facing_score": biz.get("customer_facing_score"),
            "local_badge": biz.get("local_badge"),
            "photo_url": biz.get("photo_url"),
            "source": biz.get("source", "google_places"),
            "distance_km": round(dist_km, 2),
            "composite_score": round(composite, 3),
        })

    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    return scored[:15]
