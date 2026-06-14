"""Google Places API (New) client + normalization to our canonical shape.

Every call is wrapped so a failure (no key, quota, network) returns an empty
list / None and logs — it never raises into a request (BUILD_SPEC §13). Results
are cached (``places_cache``) for speed and as an offline fallback.

We use the **New** Places API (``places.googleapis.com/v1``) with a field mask
so we only pay for the fields we use.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.config import settings
from app.services import places_cache

log = logging.getLogger("locallens.places")

_BASE = "https://places.googleapis.com/v1"
_TIMEOUT = 12.0
_CACHE_TTL = 60 * 60 * 6  # 6 hours

# Fields requested for list/search results (cheap mask).
_SEARCH_MASK = ",".join(
    f"places.{f}" for f in [
        "id", "displayName", "formattedAddress", "location", "rating",
        "userRatingCount", "priceLevel", "primaryType", "types",
        "currentOpeningHours.openNow", "photos", "nationalPhoneNumber",
        "websiteUri", "editorialSummary", "businessStatus",
    ]
)
# Detail mask adds reviews + human-readable opening hours.
_DETAIL_MASK = ",".join([
    "id", "displayName", "formattedAddress", "location", "rating",
    "userRatingCount", "priceLevel", "primaryType", "types",
    "currentOpeningHours.openNow", "regularOpeningHours.weekdayDescriptions",
    "photos", "nationalPhoneNumber", "websiteUri", "editorialSummary",
    "businessStatus", "reviews",
])

# Google's New-API price enum → our 1–4 scale.
_PRICE_MAP = {
    "PRICE_LEVEL_FREE": 1, "PRICE_LEVEL_INEXPENSIVE": 1,
    "PRICE_LEVEL_MODERATE": 2, "PRICE_LEVEL_EXPENSIVE": 3,
    "PRICE_LEVEL_VERY_EXPENSIVE": 4,
}

# Google emits one specific machine type per place ("mexican_restaurant",
# "coffee_shop", "book_store"). Our FilterBar chips are broad categories
# ("Restaurant", "Coffee", "Bookstore"). Without this bridge, ticking the
# "Restaurant" chip would drop every cuisine-specific result, because the
# filter compares against the chip vocabulary. We map each Google type to the
# chip(s) it belongs to so Google results carry the same category language the
# local DB rows already do. Exact-type hits first; the substring rules below
# catch the long tail (Google has 30+ "*_restaurant" subtypes alone).
_TYPE_TO_CHIPS: dict[str, list[str]] = {
    "coffee_shop": ["Coffee", "Cafe"], "cafe": ["Coffee", "Cafe"],
    "cafeteria": ["Cafe", "Food"], "tea_house": ["Coffee", "Cafe"],
    "bar": ["Bar"], "pub": ["Bar"], "wine_bar": ["Bar"], "bar_and_grill": ["Bar", "Restaurant"],
    "bakery": ["Bakery", "Food"], "dessert_shop": ["Dessert"], "dessert_restaurant": ["Dessert"],
    "ice_cream_shop": ["Dessert"], "donut_shop": ["Dessert", "Bakery"],
    "chocolate_shop": ["Dessert"], "candy_store": ["Dessert"], "juice_shop": ["Cafe"],
    "book_store": ["Bookstore"], "library": ["Bookstore"],
    "grocery_store": ["Grocery"], "supermarket": ["Grocery"], "market": ["Grocery"],
    "food_store": ["Grocery"], "butcher_shop": ["Grocery"], "deli": ["Grocery", "Food"],
    "pharmacy": ["Pharmacy"], "drugstore": ["Pharmacy"],
    "hair_care": ["Salon"], "hair_salon": ["Salon"], "beauty_salon": ["Salon"],
    "nail_salon": ["Salon"], "spa": ["Salon"], "barber_shop": ["Barber"],
    "gym": ["Fitness"], "fitness_center": ["Fitness"], "yoga_studio": ["Fitness"],
    "florist": ["Florist"], "flower_shop": ["Florist"],
    "clothing_store": ["Retail"], "gift_shop": ["Retail"], "shoe_store": ["Retail"],
    "jewelry_store": ["Retail"], "store": ["Retail"], "shopping_mall": ["Retail"],
    "home_goods_store": ["Retail"], "furniture_store": ["Retail"],
    "meal_takeaway": ["Restaurant", "Food"], "meal_delivery": ["Restaurant", "Food"],
    "food_court": ["Food"], "diner": ["Restaurant", "Food"],
}


def _chip_categories(primary: Optional[str], types: list[str]) -> list[str]:
    """Translate Google machine types into our chip vocabulary (order-stable,
    deduped). A specific cuisine like "mexican_restaurant" maps to
    "Restaurant" + "Food" via the substring rule so category filters match."""
    chips: list[str] = []
    for t in [primary, *types]:
        if not t:
            continue
        mapped = _TYPE_TO_CHIPS.get(t)
        if mapped is None:
            # Substring fallback for the long tail of Google subtypes.
            if t.endswith("_restaurant") or t == "restaurant":
                mapped = ["Restaurant", "Food"]
            elif "store" in t or "shop" in t:
                mapped = ["Retail"]
            else:
                mapped = []
        for chip in mapped:
            if chip not in chips:
                chips.append(chip)
    return chips


# The reverse of _TYPE_TO_CHIPS: a FilterBar chip → the Google text query that
# fetches it (+ the machine types it corresponds to). Browsing a category goes
# through search_text (paginated to 60) rather than search_nearby (capped at
# 20), so clicking "Pharmacy" actually searches for pharmacies instead of
# hoping one survives a 20-slot mixed sweep. _passes_filters still post-filters
# by chip, so a fuzzy text match is trimmed back to the exact category. Keys
# MUST match the seed.sql categories vocabulary exactly.
_CHIP_TO_QUERY: dict[str, tuple[str, list[str]]] = {
    "Coffee": ("coffee", ["coffee_shop", "cafe"]),
    "Cafe": ("cafe", ["cafe", "coffee_shop"]),
    "Bakery": ("bakery", ["bakery"]),
    "Restaurant": ("restaurant", ["restaurant"]),
    "Bar": ("bar", ["bar", "pub", "wine_bar"]),
    "Food": ("restaurant", ["restaurant", "meal_takeaway"]),
    "Bookstore": ("bookstore", ["book_store"]),
    "Grocery": ("grocery store", ["grocery_store", "supermarket"]),
    "Pharmacy": ("pharmacy", ["pharmacy", "drugstore"]),
    "Retail": ("shop", ["clothing_store", "gift_shop", "store"]),
    "Dessert": ("dessert", ["dessert_shop", "ice_cream_shop", "donut_shop"]),
    "Barber": ("barber shop", ["barber_shop"]),
    "Salon": ("hair salon", ["hair_salon", "beauty_salon", "nail_salon"]),
    "Fitness": ("gym", ["gym", "fitness_center"]),
    "Florist": ("florist", ["florist", "flower_shop"]),
    "Services": ("services", []),
}


def chip_query(chip: str) -> Optional[str]:
    """The Google text query that best fetches a category chip, or None for an
    unknown/legacy chip (caller skips it). Case-insensitive."""
    for name, (query, _types) in _CHIP_TO_QUERY.items():
        if name.lower() == (chip or "").lower():
            return query
    return None


def _headers(field_mask: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": field_mask,
    }


def _photo_proxy_url(photos: Optional[list[dict]], max_width: int = 480) -> Optional[str]:
    """Return a backend proxy URL for the first photo (keeps the key server-side)."""
    if not photos:
        return None
    name = photos[0].get("name")
    return f"/businesses/photo?name={name}&maxwidth={max_width}" if name else None


def format_place(place: dict[str, Any]) -> dict[str, Any]:
    """Normalize a Google place object into our canonical business dict."""
    loc = place.get("location") or {}
    types = place.get("types") or []
    primary = place.get("primaryType")
    # Chip-aligned categories first (so filters + the "Restaurant" chip match),
    # then the humanized specific type (e.g. "Mexican Restaurant") so the card
    # still shows the recognizable cuisine. Deduped, order preserved.
    categories = _chip_categories(primary, types)
    specific = primary.replace("_", " ").title() if primary else (
        types[0].replace("_", " ").title() if types else None
    )
    if specific and specific not in categories:
        categories.append(specific)
    return {
        "ref": f"gp_{place.get('id')}",
        "source": "google",
        "place_id": place.get("id"),
        # Raw machine type (e.g. "coffee_shop") — evidence for the Gemini
        # small-business audit and the vibe POI exclusions; don't drop it.
        "primary_type": primary,
        "name": (place.get("displayName") or {}).get("text", "Unknown"),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "address": place.get("formattedAddress"),
        "phone": place.get("nationalPhoneNumber"),
        "website": place.get("websiteUri"),
        "price_level": _PRICE_MAP.get(place.get("priceLevel")),
        "categories": categories,
        "average_rating": float(place.get("rating") or 0.0),
        "review_count": int(place.get("userRatingCount") or 0),
        # Independence is unknown until the small-business classifier runs.
        "is_independent": None,
        "local_confidence": None,
        "local_badge": None,
        "is_open_now": (place.get("currentOpeningHours") or {}).get("openNow"),
        "photo_url": _photo_proxy_url(place.get("photos")),
        "editorial_summary": (place.get("editorialSummary") or {}).get("text"),
        "business_status": place.get("businessStatus"),
        "weekday_text": (place.get("regularOpeningHours") or {}).get("weekdayDescriptions"),
        "google_reviews": place.get("reviews") or [],
    }


async def search_text(
    query: str, lat: float, lng: float, radius_m: int = 5000,
    *, page: int = 0, page_token: Optional[str] = None,
) -> tuple[list[dict], Optional[str]]:
    """ONE page of a location-biased text search.

    Returns ``(results, next_page_token)``. Google caps a page at 20 results
    but returns a token for the next page (up to 60 total); the caller decides
    whether to deepen by passing the token back as ``page_token``. We cache by
    page NUMBER (``…:p{page}``), not by token: the token is ephemeral and can't
    be replayed offline, but a page-numbered cache can — so the rehearsed/
    offline demo serves the same pages it warmed.
    """
    cache_key = f"text:{query}:{round(lat,3)}:{round(lng,3)}:{radius_m}:p{page}"
    # Offline mode (§19) is the deterministic/CACHED path: never call Google,
    # but do serve warmed cache entries (page 0 falls back to the legacy,
    # pre-pagination key so older caches still work). No token offline.
    if not settings.online or not settings.google_maps_api_key:
        cached = places_cache.get(cache_key, allow_stale=True)
        if cached is None and page == 0:
            cached = places_cache.get(
                f"text:{query}:{round(lat,3)}:{round(lng,3)}:{radius_m}",
                allow_stale=True,
            )
        return ([format_place(p) for p in cached] if cached else []), None
    body: dict[str, Any] = {
        "textQuery": query,
        "pageSize": 20,  # maxResultCount is deprecated in favor of pageSize
        "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius_m)}},
    }
    if page_token:
        body["pageToken"] = page_token
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_BASE}/places:searchText",
                headers=_headers(_SEARCH_MASK + ",nextPageToken"),
                json=body,
            )
        if resp.status_code != 200:
            log.warning("Places text search %s: %s", resp.status_code, resp.text[:300])
            cached = places_cache.get(cache_key, allow_stale=True)
            return ([format_place(p) for p in cached] if cached else []), None
        data = resp.json()
        places = data.get("places", [])
        places_cache.set(cache_key, places)
        return [format_place(p) for p in places], data.get("nextPageToken")
    except Exception as exc:  # network/timeout — fall back to any cached copy
        log.warning("Places text search failed: %s", exc)
        cached = places_cache.get(cache_key, allow_stale=True)
        return ([format_place(p) for p in cached] if cached else []), None


async def search_nearby(lat: float, lng: float, radius_m: int = 2000,
                        included_types: Optional[list[str]] = None) -> list[dict]:
    """Nearby search within a circle, ranked by DISTANCE. Returns canonical
    dicts (empty on failure).

    Distance ranking (not Google's default popularity) is deliberate for the
    browse landing page: popularity surfaces the big prominent CHAINS first, so
    after the chain filter only a handful of independents survive the 20-result
    cap. Nearest-first instead returns the 20 closest businesses — far more of
    which are the small independents this app exists to show.
    """
    cache_key = f"near:{round(lat,3)}:{round(lng,3)}:{radius_m}:dist:{','.join(included_types or [])}"
    if not settings.online or not settings.google_maps_api_key:
        cached = places_cache.get(cache_key, allow_stale=True)
        return [format_place(p) for p in cached] if cached else []
    body: dict[str, Any] = {
        "maxResultCount": 20,
        "rankPreference": "DISTANCE",
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius_m)}},
    }
    if included_types:
        body["includedTypes"] = included_types
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(f"{_BASE}/places:searchNearby", headers=_headers(_SEARCH_MASK), json=body)
        if resp.status_code != 200:
            log.warning("Places nearby %s: %s", resp.status_code, resp.text[:300])
            cached = places_cache.get(cache_key, allow_stale=True)
            return [format_place(p) for p in cached] if cached else []
        places = resp.json().get("places", [])
        places_cache.set(cache_key, places)
        return [format_place(p) for p in places]
    except Exception as exc:
        log.warning("Places nearby failed: %s", exc)
        cached = places_cache.get(cache_key, allow_stale=True)
        return [format_place(p) for p in cached] if cached else []


async def get_details(place_id: str) -> Optional[dict]:
    """Full detail for one place (incl. reviews + weekday hours), or None."""
    cache_key = f"detail:{place_id}"
    if not settings.online or not settings.google_maps_api_key:
        cached = places_cache.get(cache_key, allow_stale=True)
        return format_place(cached) if cached else None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{_BASE}/places/{place_id}", headers=_headers(_DETAIL_MASK))
        if resp.status_code != 200:
            log.warning("Places detail %s: %s", resp.status_code, resp.text[:300])
            cached = places_cache.get(cache_key, allow_stale=True)
            return format_place(cached) if cached else None
        place = resp.json()
        places_cache.set(cache_key, place)
        return format_place(place)
    except Exception as exc:
        log.warning("Places detail failed: %s", exc)
        cached = places_cache.get(cache_key, allow_stale=True)
        return format_place(cached) if cached else None


async def geocode(address: str) -> Optional[dict]:
    """Address → {lat, lng, formatted_address} via Google Geocoding (cached).

    Used by the owner add-business form so nobody types coordinates by hand.
    Returns None on any failure (caller falls back to manual entry, §13).
    """
    cache_key = f"geocode:{address.strip().lower()}"
    if not settings.online or not settings.google_maps_api_key:
        return places_cache.get(cache_key, allow_stale=True)
    cached = places_cache.get(cache_key, max_age_s=86400 * 30)
    if cached:
        return cached
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": address, "key": settings.google_maps_api_key},
            )
        data = resp.json()
        if data.get("status") != "OK" or not data.get("results"):
            log.warning("Geocode '%s' → %s", address, data.get("status"))
            return None
        top = data["results"][0]
        result = {
            "lat": top["geometry"]["location"]["lat"],
            "lng": top["geometry"]["location"]["lng"],
            "formatted_address": top["formatted_address"],
        }
        places_cache.set(cache_key, result)
        return result
    except Exception as exc:
        log.warning("Geocode failed: %s", exc)
        return None


async def fetch_photo_uri(photo_name: str, max_width: int = 480) -> Optional[str]:
    """Resolve a Places photo resource name to a temporary image URL (for the proxy)."""
    if not settings.google_maps_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{_BASE}/{photo_name}/media",
                params={"maxWidthPx": max_width, "key": settings.google_maps_api_key, "skipHttpRedirect": "true"},
            )
        if resp.status_code == 200:
            return resp.json().get("photoUri")
    except Exception as exc:
        log.warning("Photo resolve failed: %s", exc)
    return None
