import os
import re
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
import httpx
import psycopg2.extras

from app.config.database import query, get_client
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import limiter, SEARCH_LIMIT
from app.services import google_places

router = APIRouter(prefix="/api/businesses", tags=["businesses"])

API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower().strip())
    slug = re.sub(r"^-+|-+$", "", slug)
    return slug[:80]


def _ensure_unique_slug(base: str) -> str:
    slug = base or "business"
    attempt = 0
    while True:
        candidate = slug if attempt == 0 else f"{slug}-{attempt}"
        r = query("SELECT id FROM businesses WHERE slug = $1", [candidate])
        if not r["rows"]:
            return candidate
        attempt += 1


# --- Routes ---

@router.post("")
async def create_business(request: Request, user: dict = Depends(get_current_user)):
    try:
        body = await request.json()
        owner_id = user["userId"]
        slug = _ensure_unique_slug(_slugify(body.get("name", "")))

        conn, pool = get_client()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """INSERT INTO businesses (
                     owner_id, name, slug, description, phone, email, website,
                     address_line_1, address_line_2, city, state, zip_code, country,
                     latitude, longitude, price_level,
                     is_local, is_chain, chain_name,
                     is_verified, is_active, is_claimed, average_rating, review_count
                   ) VALUES (
                     %s, %s, %s, %s, %s, %s, %s,
                     %s, %s, %s, %s, %s, COALESCE(%s, 'USA'),
                     %s, %s, %s,
                     COALESCE(%s, true), COALESCE(%s, false), %s,
                     false, true, true, 0, 0
                   ) RETURNING *""",
                [
                    owner_id, body.get("name"), slug,
                    body.get("description"), body.get("phone"), body.get("email"), body.get("website"),
                    body.get("addressLine1"), body.get("addressLine2"),
                    body.get("city"), body.get("state"), body.get("zipCode"), body.get("country"),
                    body.get("latitude"), body.get("longitude"), body.get("priceLevel"),
                    body.get("isLocal"), body.get("isChain"), body.get("chainName"),
                ],
            )
            business = dict(cur.fetchone())

            category_ids = body.get("categoryIds") or []
            for cid in category_ids:
                cur.execute(
                    "INSERT INTO business_categories (business_id, category_id) VALUES (%s, %s)",
                    [business["id"], cid],
                )

            hours = body.get("hoursOfOperation") or {}
            for day_str, h in hours.items():
                day_num = int(day_str)
                if day_num < 0 or day_num > 6:
                    continue
                cur.execute(
                    "INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed) VALUES (%s, %s, %s, %s, %s)",
                    [business["id"], day_num, (h or {}).get("open"), (h or {}).get("close"), bool((h or {}).get("closed"))],
                )

            photo_urls = body.get("photoUrls") or []
            for i, url in enumerate(photo_urls):
                cur.execute(
                    "INSERT INTO business_photos (business_id, url, is_primary, upload_order) VALUES (%s, %s, %s, %s)",
                    [business["id"], url, i == 0, i],
                )

            conn.commit()
            return JSONResponse(status_code=201, content={"message": "Business created successfully", "business": business})
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            pool.putconn(conn)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Create business error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import radians, sin, cos, asin, sqrt
    dLat = radians(lat2 - lat1)
    dLng = radians(lng2 - lng1)
    a = sin(dLat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLng / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def _bayesian_rating(rating: float, count: int, m: int = 15, prior: float = 3.7) -> float:
    """Smooth rating 
    toward a prior so 5.0 (1 review) doesn't beat 4.6 (200)."""
    if not rating:
        return prior
    return (rating * count + prior * m) / (count + m)


def _apply_filters_and_sort(businesses: list[dict], *,
                            latitude: float, longitude: float,
                            min_rating: float, price_levels: set[int] | None,
                            independent_only: bool, sort: str,
                            open_now: bool = False) -> list[dict]:
    """Annotate distance, then apply UI filters + chosen sort. Pure-Python,
    runs over the (typically <50) results returned by the scorer."""
    annotated = []
    for b in businesses:
        bl, bn = b.get("latitude"), b.get("longitude")
        b["distance_km"] = _haversine_km(latitude, longitude, bl, bn) if bl and bn else None
        annotated.append(b)

    def passes(b: dict) -> bool:
        if open_now and b.get("is_open_now") is not True:
            return False
        if min_rating and (b.get("average_rating") or 0) < min_rating:
            return False
        if price_levels:
            pl = b.get("price_level")
            # If the business has no price_level info, only include it when "any"
            # was requested (price_levels is None / empty above). When the user
            # actively picked tiers, exclude unknowns to keep the filter honest.
            if pl is None or pl not in price_levels:
                return False
        if independent_only and b.get("local_badge") not in ("verified_local", "likely_local"):
            return False
        return True

    filtered = [b for b in annotated if passes(b)]

    if sort == "distance":
        filtered.sort(key=lambda b: b.get("distance_km") if b.get("distance_km") is not None else 1e9)
    elif sort == "rating":
        filtered.sort(
            key=lambda b: _bayesian_rating(b.get("average_rating") or 0, b.get("review_count") or 0),
            reverse=True,
        )
    elif sort == "most_reviewed":
        filtered.sort(key=lambda b: b.get("review_count") or 0, reverse=True)
    # best_match: keep existing order from scorer (independence_score DESC)

    return filtered


@router.get("/search")
@limiter.limit(SEARCH_LIMIT)
async def search_businesses(request: Request,
                            query_param: str = Query(None, alias="query"),
                            latitude: float = Query(None),
                            longitude: float = Query(None),
                            radius: int = Query(1000),
                            type: str = Query(None),
                            min_rating: float = Query(0.0),
                            price_levels: str = Query(""),
                            independent_only: bool = Query(True),
                            open_now: bool = Query(False),
                            sort: str = Query("best_match")):
    try:
        if not latitude or not longitude:
            return {"businesses": [], "total": 0}

        radius_meters = min(radius, 50000)

        if query_param:
            places = await google_places.search_text(query_param, latitude, longitude, radius_meters)
        elif type:
            places = await google_places.search_nearby(latitude, longitude, radius_meters, [type], 20)
        else:
            places = await google_places.search_nearby_diverse(latitude, longitude, radius_meters)

        formatted = [google_places.format_place(p) for p in places]

        from app.utils.local_business_scorer import filter_and_score_businesses
        scored = filter_and_score_businesses(formatted)
        unfiltered_total = len(scored)

        # Parse price tier set ("1,2,3" → {1, 2, 3})
        price_set: set[int] | None = None
        if price_levels:
            try:
                price_set = {int(x) for x in price_levels.split(",") if x.strip()}
            except ValueError:
                price_set = None

        businesses = _apply_filters_and_sort(
            scored,
            latitude=latitude, longitude=longitude,
            min_rating=min_rating, price_levels=price_set,
            independent_only=independent_only, sort=sort,
            open_now=open_now,
        )

        response: dict = {
            "businesses": businesses,
            "total": len(businesses),
            "unfiltered_total": unfiltered_total,
        }

        # Graceful zero-results: surface the 5 closest pre-filter survivors
        # so the UI can offer "here are the closest matches anyway".
        if not businesses and scored:
            scored_with_dist = sorted(
                scored,
                key=lambda b: _haversine_km(latitude, longitude, b.get("latitude") or 0, b.get("longitude") or 0),
            )[:5]
            response["nearest_fallback"] = scored_with_dist

        return response
    except Exception as e:
        print(f"Search businesses error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/autocomplete")
async def autocomplete_location(input: str = Query(None)):
    if not input or len(input) < 2:
        return {"predictions": []}
    if not API_KEY:
        return {"predictions": []}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://places.googleapis.com/v1/places:autocomplete",
                json={
                    "input": input,
                    "includedPrimaryTypes": [
                        "locality", "sublocality", "postal_code",
                        "administrative_area_level_1", "street_address",
                    ],
                },
                headers={
                    "X-Goog-Api-Key": API_KEY,
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
            data = resp.json()

        suggestions = data.get("suggestions") or []
        predictions = []
        for s in suggestions:
            pp = s.get("placePrediction")
            if not pp:
                continue
            predictions.append({
                "place_id": pp.get("placeId", ""),
                "description": (pp.get("text") or {}).get("text", ""),
                "main_text": ((pp.get("structuredFormat") or {}).get("mainText") or {}).get("text", ""),
                "secondary_text": ((pp.get("structuredFormat") or {}).get("secondaryText") or {}).get("text", ""),
            })
            if len(predictions) >= 5:
                break

        return {"predictions": predictions}
    except Exception as e:
        print(f"Autocomplete error: {e}")
        return {"predictions": []}


@router.get("/geocode")
async def geocode_location(address: str = Query(None)):
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": address, "key": API_KEY},
                timeout=10,
            )
            data = resp.json()

        if data.get("status") != "OK" or not data.get("results"):
            raise HTTPException(status_code=404, detail="Location not found")

        result = data["results"][0]
        loc = result["geometry"]["location"]
        return {
            "latitude": loc["lat"],
            "longitude": loc["lng"],
            "formatted_address": result.get("formatted_address", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Geocode error: {e}")
        raise HTTPException(status_code=500, detail="Failed to geocode location")


@router.get("/categories")
async def get_categories():
    try:
        result = query("SELECT id, name, slug, icon, parent_id FROM categories ORDER BY name")
        return {"categories": result["rows"]}
    except Exception as e:
        print(f"Get categories error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{raw_id}")
async def get_business_by_id(raw_id: str):
    try:
        if raw_id.startswith("gp_"):
            place_id = raw_id[3:]
            detail = await google_places.get_place_details(place_id)
            if not detail:
                raise HTTPException(status_code=404, detail="Business not found")
            return {"business": google_places.format_place_detail(detail)}

        try:
            bid = int(raw_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid business ID")

        result = query("SELECT * FROM businesses WHERE id = $1", [bid])
        if not result["rows"]:
            raise HTTPException(status_code=404, detail="Business not found")

        categories = query(
            """SELECT c.id, c.name, c.slug, c.icon
               FROM business_categories bc JOIN categories c ON bc.category_id = c.id
               WHERE bc.business_id = $1""",
            [bid],
        )
        hours = query(
            "SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE business_id = $1 ORDER BY day_of_week",
            [bid],
        )
        photos = query(
            "SELECT id, url, caption, alt_text, is_primary, upload_order FROM business_photos WHERE business_id = $1 ORDER BY upload_order",
            [bid],
        )

        biz = result["rows"][0]
        biz["categories"] = categories["rows"]
        biz["hours"] = hours["rows"]
        biz["photos"] = photos["rows"]
        biz["source"] = "local"

        return {"business": biz}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get business error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{raw_id}")
async def update_business(raw_id: str, request: Request, user: dict = Depends(get_current_user)):
    try:
        bid = int(raw_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid business ID")

    try:
        check = query("SELECT owner_id FROM businesses WHERE id = $1", [bid])
        if not check["rows"]:
            raise HTTPException(status_code=404, detail="Business not found")
        if check["rows"][0]["owner_id"] != user["userId"] and not user["isAdmin"]:
            raise HTTPException(status_code=403, detail="Not authorized to update this business")

        body = await request.json()
        result = query(
            """UPDATE businesses
               SET name = COALESCE($1, name), description = COALESCE($2, description),
                   address_line_1 = COALESCE($3, address_line_1), address_line_2 = COALESCE($4, address_line_2),
                   city = COALESCE($5, city), state = COALESCE($6, state), zip_code = COALESCE($7, zip_code),
                   phone = COALESCE($8, phone), website = COALESCE($9, website),
                   email = COALESCE($10, email), price_level = COALESCE($11, price_level),
                   updated_at = NOW()
               WHERE id = $12 RETURNING *""",
            [
                body.get("name"), body.get("description"), body.get("addressLine1"),
                body.get("addressLine2"), body.get("city"), body.get("state"),
                body.get("zipCode"), body.get("phone"), body.get("website"),
                body.get("email"), body.get("priceLevel"), bid,
            ],
        )
        return {"message": "Business updated successfully", "business": result["rows"][0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update business error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
