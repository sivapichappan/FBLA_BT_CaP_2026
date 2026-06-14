from fastapi import APIRouter, Depends, HTTPException, Request, Query
import psycopg2.extras
from app.config.database import query, get_client
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


def _recompute_rating(business_id: int, cur):
    cur.execute(
        """UPDATE businesses
           SET review_count = (SELECT COUNT(*) FROM reviews WHERE business_id = %s AND is_hidden = false),
               average_rating = COALESCE(
                 (SELECT AVG(rating)::float FROM reviews WHERE business_id = %s AND is_hidden = false), 0
               )
           WHERE id = %s""",
        [business_id, business_id, business_id],
    )


@router.post("")
async def create_review(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    business_id = body.get("businessId")
    rating = body.get("rating")

    biz = query("SELECT id FROM businesses WHERE id = $1", [business_id])
    if not biz["rows"]:
        raise HTTPException(status_code=404, detail="Business not found")

    existing = query("SELECT id FROM reviews WHERE user_id = $1 AND business_id = $2",
                     [user["userId"], business_id])
    if existing["rows"]:
        raise HTTPException(status_code=400, detail="You have already reviewed this business")

    conn, pool = get_client()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "INSERT INTO reviews (user_id, business_id, rating, title, content) VALUES (%s,%s,%s,%s,%s) RETURNING *",
            [user["userId"], business_id, rating, body.get("title"), body.get("content")],
        )
        review = dict(cur.fetchone())
        _recompute_rating(business_id, cur)
        conn.commit()
        return {"message": "Review created successfully", "review": review}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        pool.putconn(conn)


@router.get("/business/{business_id}")
async def get_business_reviews(business_id: int, limit: int = Query(20), offset: int = Query(0),
                                sortBy: str = Query("recent")):
    order = "r.created_at DESC"
    if sortBy == "rating_high": order = "r.rating DESC, r.created_at DESC"
    elif sortBy == "rating_low": order = "r.rating ASC, r.created_at DESC"
    elif sortBy == "helpful": order = "r.helpful_count DESC, r.created_at DESC"

    result = query(
        f"""SELECT r.id, r.rating, r.title, r.content, r.helpful_count, r.not_helpful_count,
                   r.is_verified_purchase, r.created_at, r.updated_at,
                   u.id AS user_id, u.username, u.first_name, u.last_name, u.profile_image_url
            FROM reviews r JOIN users u ON r.user_id = u.id
            WHERE r.business_id = $1 AND r.is_hidden = false
            ORDER BY {order} LIMIT $2 OFFSET $3""",
        [business_id, limit, offset],
    )

    return {
        "reviews": [
            {
                "id": r["id"], "rating": r["rating"], "title": r["title"], "content": r["content"],
                "helpfulCount": r["helpful_count"], "notHelpfulCount": r["not_helpful_count"],
                "isVerifiedPurchase": r["is_verified_purchase"],
                "createdAt": str(r["created_at"]), "updatedAt": str(r["updated_at"]),
                "user": {
                    "id": r["user_id"], "username": r["username"],
                    "firstName": r["first_name"], "lastName": r["last_name"],
                    "profileImageUrl": r["profile_image_url"],
                },
            }
            for r in result["rows"]
        ]
    }


@router.put("/{review_id}")
async def update_review(review_id: int, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    check = query("SELECT user_id, business_id FROM reviews WHERE id = $1", [review_id])
    if not check["rows"]:
        raise HTTPException(status_code=404, detail="Review not found")
    if check["rows"][0]["user_id"] != user["userId"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this review")

    conn, pool = get_client()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """UPDATE reviews SET rating = COALESCE(%s, rating), title = COALESCE(%s, title),
               content = COALESCE(%s, content), updated_at = NOW() WHERE id = %s RETURNING *""",
            [body.get("rating"), body.get("title"), body.get("content"), review_id],
        )
        review = dict(cur.fetchone())
        _recompute_rating(check["rows"][0]["business_id"], cur)
        conn.commit()
        return {"message": "Review updated successfully", "review": review}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        pool.putconn(conn)


@router.delete("/{review_id}")
async def delete_review(review_id: int, user: dict = Depends(get_current_user)):
    check = query("SELECT user_id, business_id FROM reviews WHERE id = $1", [review_id])
    if not check["rows"]:
        raise HTTPException(status_code=404, detail="Review not found")
    if check["rows"][0]["user_id"] != user["userId"] and not user["isAdmin"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this review")

    biz_id = check["rows"][0]["business_id"]
    conn, pool = get_client()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM reviews WHERE id = %s", [review_id])
        _recompute_rating(biz_id, cur)
        conn.commit()
        return {"message": "Review deleted successfully"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        pool.putconn(conn)
