from fastapi import APIRouter, Depends, HTTPException
from app.config.database import query
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/business/{business_id}")
async def get_business_analytics(business_id: int, user: dict = Depends(get_current_user)):
    biz = query("SELECT owner_id, average_rating, review_count FROM businesses WHERE id = $1", [business_id])
    if not biz["rows"]:
        raise HTTPException(status_code=404, detail="Business not found")
    if biz["rows"][0]["owner_id"] != user["userId"] and not user["isAdmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    favs = query("SELECT COUNT(*)::int AS count FROM favorites WHERE business_id = $1", [business_id])
    claims = query(
        "SELECT COUNT(*)::int AS count FROM deal_claims dc JOIN deals d ON dc.deal_id = d.id WHERE d.business_id = $1",
        [business_id],
    )
    rating_dist = query(
        "SELECT rating, COUNT(*)::int AS count FROM reviews WHERE business_id = $1 AND is_hidden = false GROUP BY rating",
        [business_id],
    )
    trend = query(
        """SELECT DATE(created_at) AS date, COUNT(*)::int AS count
           FROM reviews WHERE business_id = $1 AND is_hidden = false
           GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30""",
        [business_id],
    )

    b = biz["rows"][0]
    return {
        "averageRating": float(b["average_rating"] or 0),
        "totalReviews": b["review_count"] or 0,
        "totalFavorites": favs["rows"][0]["count"],
        "dealsClaimed": claims["rows"][0]["count"],
        "ratingDistribution": rating_dist["rows"],
        "reviewsTrend": [{"date": str(r["date"]), "count": r["count"]} for r in trend["rows"]],
    }


@router.get("/business/{business_id}/deals")
async def get_deal_analytics(business_id: int, user: dict = Depends(get_current_user)):
    biz = query("SELECT owner_id FROM businesses WHERE id = $1", [business_id])
    if not biz["rows"]:
        raise HTTPException(status_code=404, detail="Business not found")
    if biz["rows"][0]["owner_id"] != user["userId"] and not user["isAdmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = query(
        """SELECT d.id, d.title, d.redemption_count, d.total_limit,
                  COUNT(dc.id)::int AS total_claims
           FROM deals d LEFT JOIN deal_claims dc ON d.id = dc.deal_id
           WHERE d.business_id = $1
           GROUP BY d.id ORDER BY d.created_at DESC""",
        [business_id],
    )
    return {"deals": result["rows"]}
