from fastapi import APIRouter, Depends, HTTPException, Request
from app.config.database import query
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


@router.post("")
async def add_favorite(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    user_id = user["userId"]
    business_id = body.get("businessId")
    google_place_id = body.get("googlePlaceId")

    if not business_id and not google_place_id:
        raise HTTPException(status_code=400, detail="Either businessId or googlePlaceId is required")

    if google_place_id:
        existing = query("SELECT id FROM favorites WHERE user_id = $1 AND google_place_id = $2",
                         [user_id, google_place_id])
    else:
        existing = query("SELECT id FROM favorites WHERE user_id = $1 AND business_id = $2",
                         [user_id, business_id])
    if existing["rows"]:
        raise HTTPException(status_code=400, detail="Already in favorites")

    result = query(
        """INSERT INTO favorites (
             user_id, business_id, google_place_id,
             place_name, place_address, place_rating, place_photo_url, place_type,
             collection_name, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Favorites'), $10)
           RETURNING *""",
        [
            user_id, business_id or None, google_place_id or None,
            body.get("placeName"), body.get("placeAddress"),
            body.get("placeRating"), body.get("placePhotoUrl"), body.get("placeType"),
            body.get("collectionName"), body.get("notes"),
        ],
    )
    return {"message": "Added to favorites", "favorite": result["rows"][0]}


@router.delete("/{raw_id}")
async def remove_favorite(raw_id: str, user: dict = Depends(get_current_user)):
    user_id = user["userId"]

    if raw_id.startswith("gp_"):
        gp_id = raw_id[3:]
        result = query("DELETE FROM favorites WHERE user_id = $1 AND google_place_id = $2 RETURNING *",
                       [user_id, gp_id])
    else:
        try:
            bid = int(raw_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid ID")
        result = query("DELETE FROM favorites WHERE user_id = $1 AND business_id = $2 RETURNING *",
                       [user_id, bid])

    if not result["rows"]:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"message": "Removed from favorites"}


@router.get("")
async def get_user_favorites(user: dict = Depends(get_current_user)):
    result = query(
        """SELECT f.id, f.user_id, f.business_id, f.google_place_id,
                  f.place_name, f.place_address, f.place_rating, f.place_photo_url, f.place_type,
                  f.collection_name, f.notes, f.created_at,
                  b.name AS local_name, b.address_line_1 AS local_address,
                  b.average_rating AS local_rating, b.slug AS local_slug
           FROM favorites f LEFT JOIN businesses b ON f.business_id = b.id
           WHERE f.user_id = $1 ORDER BY f.created_at DESC""",
        [user["userId"]],
    )

    favorites = [
        {
            "id": f"gp_{f['google_place_id']}" if f["google_place_id"] else f["business_id"],
            "name": f["place_name"] or f["local_name"] or "Unknown",
            "address_line_1": f["place_address"] or f["local_address"] or "",
            "average_rating": float(f["place_rating"] or f["local_rating"] or 0),
            "photo_url": f["place_photo_url"],
            "primary_type_display_name": f["place_type"],
            "source": "google_places" if f["google_place_id"] else "local",
            "favorited_at": str(f["created_at"]),
            "collection_name": f["collection_name"],
        }
        for f in result["rows"]
    ]
    return {"favorites": favorites}


@router.get("/check/{raw_id}")
async def check_favorite(raw_id: str, user: dict = Depends(get_current_user)):
    user_id = user["userId"]

    if raw_id.startswith("gp_"):
        gp_id = raw_id[3:]
        result = query("SELECT id FROM favorites WHERE user_id = $1 AND google_place_id = $2",
                       [user_id, gp_id])
    else:
        try:
            bid = int(raw_id)
        except ValueError:
            return {"isFavorite": False}
        result = query("SELECT id FROM favorites WHERE user_id = $1 AND business_id = $2",
                       [user_id, bid])

    return {"isFavorite": len(result["rows"]) > 0}
