import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Query
import psycopg2.extras
from app.config.database import query, get_client
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/deals", tags=["deals"])


@router.post("")
async def create_deal(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    business_id = body.get("businessId")

    check = query("SELECT owner_id FROM businesses WHERE id = $1", [business_id])
    if not check["rows"]:
        raise HTTPException(status_code=404, detail="Business not found")
    if check["rows"][0]["owner_id"] != user["userId"] and not user["isAdmin"]:
        raise HTTPException(status_code=403, detail="Not authorized to create deals for this business")

    result = query(
        """INSERT INTO deals (
             business_id, title, description, code,
             discount_type, discount_value, minimum_purchase,
             start_date, end_date,
             is_active, total_limit, per_user_limit, redemption_count,
             points_bonus, terms_conditions, image_url
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             COALESCE($8, NOW()), $9,
             true, $10, COALESCE($11, 1), 0,
             COALESCE($12, 0), $13, $14
           ) RETURNING *""",
        [
            business_id, body.get("title"), body.get("description"), body.get("code"),
            body.get("discountType"), body.get("discountValue"), body.get("minimumPurchase"),
            body.get("startDate"), body.get("endDate"),
            body.get("totalLimit"), body.get("perUserLimit"),
            body.get("pointsBonus"), body.get("termsConditions"), body.get("imageUrl"),
        ],
    )
    return {"message": "Deal created successfully", "deal": result["rows"][0]}


@router.get("/business/{business_id}")
async def get_business_deals(business_id: int):
    result = query(
        """SELECT * FROM deals
           WHERE business_id = $1 AND is_active = true
             AND (end_date IS NULL OR end_date > NOW())
             AND (total_limit IS NULL OR redemption_count < total_limit)
           ORDER BY created_at DESC""",
        [business_id],
    )
    return {"deals": result["rows"]}


@router.get("/active")
async def get_all_active_deals(
    latitude: float = Query(None), longitude: float = Query(None),
    radius: int = Query(10), limit: int = Query(20),
):
    params = []
    idx = 1
    sql = """SELECT d.*, b.name AS business_name, b.slug AS business_slug, b.latitude, b.longitude
             FROM deals d JOIN businesses b ON d.business_id = b.id
             WHERE d.is_active = true AND (d.end_date IS NULL OR d.end_date > NOW())
               AND (d.total_limit IS NULL OR d.redemption_count < d.total_limit)"""

    if latitude and longitude:
        sql += f""" AND (6371 * acos(
            cos(radians(${idx})) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians(${idx+1})) +
            sin(radians(${idx})) * sin(radians(b.latitude))
          )) <= ${idx+2}"""
        params.extend([latitude, longitude, radius])
        idx += 3

    sql += f" ORDER BY d.created_at DESC LIMIT ${idx}"
    params.append(limit)

    result = query(sql, params)
    return {"deals": result["rows"]}


@router.post("/{deal_id}/redeem")
async def redeem_deal(deal_id: int, user: dict = Depends(get_current_user)):
    deal_res = query("SELECT * FROM deals WHERE id = $1", [deal_id])
    if not deal_res["rows"]:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal = deal_res["rows"][0]
    if not deal["is_active"]:
        raise HTTPException(status_code=400, detail="Deal is no longer active")
    if deal["end_date"] and deal["end_date"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Deal has expired")
    if deal["total_limit"] and deal["redemption_count"] >= deal["total_limit"]:
        raise HTTPException(status_code=400, detail="Deal redemption limit reached")

    user_claims = query(
        "SELECT COUNT(*)::int AS count FROM deal_claims WHERE deal_id = $1 AND user_id = $2",
        [deal_id, user["userId"]],
    )
    if user_claims["rows"][0]["count"] >= (deal["per_user_limit"] or 1):
        raise HTTPException(status_code=400, detail="You have already claimed this deal")

    code = secrets.token_hex(6).upper()

    conn, pool = get_client()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "INSERT INTO deal_claims (deal_id, user_id, status, redemption_code) VALUES (%s, %s, 'claimed', %s) RETURNING *",
            [deal_id, user["userId"], code],
        )
        claim = dict(cur.fetchone())
        cur.execute("UPDATE deals SET redemption_count = redemption_count + 1 WHERE id = %s", [deal_id])
        conn.commit()
        return {"message": "Deal claimed successfully", "claim": claim}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        pool.putconn(conn)


@router.put("/{deal_id}")
async def update_deal(deal_id: int, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    check = query(
        "SELECT d.*, b.owner_id FROM deals d JOIN businesses b ON d.business_id = b.id WHERE d.id = $1",
        [deal_id],
    )
    if not check["rows"]:
        raise HTTPException(status_code=404, detail="Deal not found")
    if check["rows"][0]["owner_id"] != user["userId"] and not user["isAdmin"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this deal")

    result = query(
        """UPDATE deals SET title = COALESCE($1, title), description = COALESCE($2, description),
           discount_type = COALESCE($3, discount_type), discount_value = COALESCE($4, discount_value),
           terms_conditions = COALESCE($5, terms_conditions), end_date = COALESCE($6, end_date),
           is_active = COALESCE($7, is_active), updated_at = NOW()
           WHERE id = $8 RETURNING *""",
        [body.get("title"), body.get("description"), body.get("discountType"),
         body.get("discountValue"), body.get("termsConditions"), body.get("endDate"),
         body.get("isActive"), deal_id],
    )
    return {"message": "Deal updated successfully", "deal": result["rows"][0]}
