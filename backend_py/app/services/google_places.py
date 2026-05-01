import os
import asyncio
from urllib.parse import quote
import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
BASE_URL = "https://places.googleapis.com/v1"

# --- Field masks ---

SEARCH_FIELDS = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.location",
    "places.rating", "places.userRatingCount", "places.priceLevel",
    "places.primaryType", "places.primaryTypeDisplayName",
    "places.regularOpeningHours.openNow", "places.photos", "places.businessStatus",
    # Used by chain_detector signals (website domain match, toll-free phone)
    "places.websiteUri", "places.internationalPhoneNumber",
    # Used by editorial signal — Google's natural-language summary, when present
    "places.editorialSummary",
])

DETAIL_FIELDS = ",".join([
    "id", "displayName", "formattedAddress", "location", "rating", "userRatingCount",
    "priceLevel", "primaryType", "primaryTypeDisplayName", "regularOpeningHours",
    "photos", "businessStatus", "internationalPhoneNumber", "websiteUri",
    "googleMapsUri", "reviews", "editorialSummary", "addressComponents",
])

# --- Category groups ---

CATEGORY_GROUPS = {
    "eatDrink": ["restaurant", "cafe", "bar", "bakery", "coffee_shop", "fast_food_restaurant"],
    "shopServices": ["shopping_mall", "clothing_store", "grocery_store", "hair_salon", "bank",
                     "book_store", "convenience_store", "electronics_store", "pet_store", "pharmacy"],
    "personalServices": ["gym", "spa", "beauty_salon", "car_repair", "car_wash", "laundry",
                         "veterinary_care", "dentist", "doctor"],
}

PRICE_LEVEL_MAP = {
    "PRICE_LEVEL_FREE": 0,
    "PRICE_LEVEL_INEXPENSIVE": 1,
    "PRICE_LEVEL_MODERATE": 2,
    "PRICE_LEVEL_EXPENSIVE": 3,
    "PRICE_LEVEL_VERY_EXPENSIVE": 4,
}


# --- Core API functions ---

async def search_nearby(latitude: float, longitude: float, radius: int = 1000,
                        included_types: list[str] | None = None, max_result_count: int = 10) -> list:
    if not API_KEY:
        return []
    try:
        body: dict = {
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": latitude, "longitude": longitude},
                    "radius": min(radius, 50000),
                }
            },
            "maxResultCount": max_result_count,
        }
        if included_types:
            body["includedTypes"] = included_types

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BASE_URL}/places:searchNearby",
                json=body,
                headers={
                    "X-Goog-Api-Key": API_KEY,
                    "X-Goog-FieldMask": SEARCH_FIELDS,
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get("places", [])
    except Exception as e:
        print(f"Places API nearby search error: {e}")
        return []


async def search_nearby_diverse(latitude: float, longitude: float, radius: int = 1000) -> list:
    eat, shop, personal = await asyncio.gather(
        search_nearby(latitude, longitude, radius, CATEGORY_GROUPS["eatDrink"], 10),
        search_nearby(latitude, longitude, radius, CATEGORY_GROUPS["shopServices"], 10),
        search_nearby(latitude, longitude, radius, CATEGORY_GROUPS["personalServices"], 10),
    )

    groups = [eat, shop, personal]
    merged = []
    seen = set()
    max_len = max(len(g) for g in groups) if groups else 0

    for i in range(max_len):
        for group in groups:
            if i < len(group):
                place = group[i]
                pid = place.get("id")
                if pid and pid not in seen:
                    seen.add(pid)
                    merged.append(place)

    return merged[:20]


async def search_text(text_query: str, latitude: float, longitude: float, radius: int = 5000) -> list:
    if not API_KEY:
        return []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BASE_URL}/places:searchText",
                json={
                    "textQuery": text_query,
                    "locationBias": {
                        "circle": {
                            "center": {"latitude": latitude, "longitude": longitude},
                            "radius": min(radius, 50000),
                        }
                    },
                    "maxResultCount": 20,
                },
                headers={
                    "X-Goog-Api-Key": API_KEY,
                    "X-Goog-FieldMask": SEARCH_FIELDS,
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get("places", [])
    except Exception as e:
        print(f"Places API text search error: {e}")
        return []


async def get_place_details(place_id: str):
    if not API_KEY:
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{BASE_URL}/places/{place_id}",
                headers={
                    "X-Goog-Api-Key": API_KEY,
                    "X-Goog-FieldMask": DETAIL_FIELDS,
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"Places API detail error: {e}")
        return None


def get_photo_url(photo_name: str, max_width: int = 400) -> str:
    return f"/api/photos?name={quote(photo_name)}&maxWidth={max_width}"


# --- Formatters ---

def format_place(place: dict) -> dict:
    price_str = place.get("priceLevel")
    price_level = PRICE_LEVEL_MAP.get(price_str) if price_str else None
    photos_raw = place.get("photos") or []
    photo_name = photos_raw[0].get("name") if photos_raw else None
    primary_type = place.get("primaryType")
    display_name_obj = place.get("primaryTypeDisplayName") or {}
    display_name = display_name_obj.get("text")

    return {
        "id": f"gp_{place.get('id', '')}",
        "place_id": place.get("id"),
        "name": (place.get("displayName") or {}).get("text", "Unknown"),
        "description": (place.get("editorialSummary") or {}).get("text"),
        "editorial_summary": (place.get("editorialSummary") or {}).get("text"),
        "address_line_1": place.get("formattedAddress", ""),
        "city": "",
        "state": "",
        "zip_code": "",
        "latitude": (place.get("location") or {}).get("latitude", 0),
        "longitude": (place.get("location") or {}).get("longitude", 0),
        "average_rating": place.get("rating", 0),
        "review_count": place.get("userRatingCount", 0),
        "price_level": price_level,
        "primary_type": primary_type,
        "primary_type_display_name": display_name,
        "category_name": display_name or (primary_type or "").replace("_", " ") or "Business",
        "types": [primary_type] if primary_type else [],
        "categories": [{"id": 0, "name": display_name, "slug": primary_type or "", "icon": None}] if display_name else [],
        "is_open_now": (place.get("regularOpeningHours") or {}).get("openNow"),
        "business_status": place.get("businessStatus"),
        # Surfaced from search results so chain_detector signals (website,
        # phone, editorial) can fire without a separate detail call.
        "website": place.get("websiteUri"),
        "phone": place.get("internationalPhoneNumber"),
        "photo_url": get_photo_url(photo_name, 800) if photo_name else None,
        "photos": [{"url": get_photo_url(p["name"], 800)} for p in photos_raw[:5] if "name" in p],
        "independence_score": None,
        "customer_facing_score": None,
        "local_badge": None,
        "source": "google_places",
    }


def format_place_detail(place: dict) -> dict:
    base = format_place(place)

    city = state = zip_code = ""
    for comp in place.get("addressComponents") or []:
        types = comp.get("types") or []
        if "locality" in types:
            city = comp.get("longText") or comp.get("shortText") or ""
        if "administrative_area_level_1" in types:
            state = comp.get("shortText") or ""
        if "postal_code" in types:
            zip_code = comp.get("longText") or ""

    weekday_descs = (place.get("regularOpeningHours") or {}).get("weekdayDescriptions") or []

    reviews_raw = place.get("reviews") or []
    reviews = []
    for r in reviews_raw:
        author = r.get("authorAttribution") or {}
        name_parts = (author.get("displayName") or "").split(" ", 1)
        reviews.append({
            "id": f"gpr_{r.get('publishTime', '')}",
            "rating": r.get("rating", 0),
            "title": None,
            "content": (r.get("text") or r.get("originalText") or {}).get("text", ""),
            "createdAt": r.get("publishTime", ""),
            "user": {
                "id": 0,
                "username": author.get("displayName", "Google User"),
                "firstName": name_parts[0] if name_parts else "",
                "lastName": name_parts[1] if len(name_parts) > 1 else "",
                "profileImageUrl": author.get("photoUri"),
            },
        })

    return {
        **base,
        "city": city,
        "state": state,
        "zip_code": zip_code,
        "phone": place.get("internationalPhoneNumber"),
        "website": place.get("websiteUri"),
        "google_maps_uri": place.get("googleMapsUri"),
        "weekday_descriptions": weekday_descs,
        "hours": [
            {"day_of_week": (i + 1) % 7, "text": text, "is_closed": "closed" in text.lower()}
            for i, text in enumerate(weekday_descs)
        ],
        "reviews": reviews,
    }
