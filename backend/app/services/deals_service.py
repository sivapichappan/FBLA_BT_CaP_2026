"""Deal logic: owner authorization for posting, friendly redemption errors (§8.5)."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models.deal import DealIn
from app.repositories import businesses as biz_repo
from app.repositories import deals as deals_repo

# Map repository rejection reasons to clean HTTP responses (§12: helpful errors).
_REDEEM_ERRORS = {
    "not_found": (status.HTTP_404_NOT_FOUND, "Deal not found."),
    "not_active": (status.HTTP_409_CONFLICT, "This deal isn't active right now."),
    "sold_out": (status.HTTP_409_CONFLICT, "This deal has been fully redeemed."),
    "user_limit": (status.HTTP_409_CONFLICT, "You've already redeemed this deal."),
}


def create_deal(user: dict, data: DealIn) -> dict:
    business = biz_repo.get_local(data.business_id)
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    # Only the business's owner (or an admin) may post deals for it.
    if business.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the business owner can post deals.")
    return deals_repo.create(data.model_dump())


def verify_code(code: str, user: dict, *, mark_used: bool) -> dict:
    """Cashier mode (§plan B): an owner checks a customer's code at the counter.

    Returns {status, ...context}. Statuses: ``valid`` (genuine + unused),
    ``already_used`` (shows when), ``not_found``. Owners may only verify codes
    for businesses THEY own — someone else's code reads as not_found, so the
    endpoint can't be used to probe other shops' redemptions.
    """
    redemption = deals_repo.find_redemption_by_code(code.strip())
    if not redemption or (
        redemption["owner_id"] != user["id"] and user.get("role") != "admin"
    ):
        return {"status": "not_found"}

    context = {
        "code": redemption["code"],
        "deal_title": redemption["title"],
        "discount_pct": redemption["discount_pct"],
        "business_name": redemption["business_name"],
        "customer": redemption["customer"],
        "redeemed_at": redemption["redeemed_at"],
    }
    if redemption["verified_at"] is not None:
        return {**context, "status": "already_used", "verified_at": redemption["verified_at"]}

    if mark_used:
        # The UPDATE is guarded (verified_at IS NULL), so two cashiers racing
        # the same code can't both succeed.
        if not deals_repo.mark_redemption_used(redemption["id"]):
            return {**context, "status": "already_used"}
        return {**context, "status": "marked_used"}

    return {**context, "status": "valid"}


def redeem(deal_id: int, user: dict) -> dict:
    try:
        redemption = deals_repo.redeem(deal_id, user["id"])
    except ValueError as exc:
        code, message = _REDEEM_ERRORS.get(str(exc), (status.HTTP_400_BAD_REQUEST, "Could not redeem."))
        raise HTTPException(code, message)
    deal = deals_repo.get(deal_id)
    return {
        **redemption,
        "title": deal["title"],
        "discount_pct": deal["discount_pct"],
        "business_name": deal["business_name"],
    }
