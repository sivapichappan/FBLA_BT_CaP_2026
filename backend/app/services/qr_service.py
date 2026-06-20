"""Owner-facing QR check-in: enable it for a business, and read the current
rotating code for the kiosk display. The secret is generated + stored server-side
and NEVER returned — only the short-lived current token is.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.config import settings
from app.repositories import businesses as biz_repo
from app.services import qr


def _require_owner(business_id: int, user: dict) -> dict:
    """The business must exist and the caller must own it (or be an admin)."""
    business = biz_repo.get_local(business_id)
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    if business.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only this business's owner can manage check-in codes.")
    return business


def enable(business_id: int, user: dict) -> dict:
    """Turn on code check-in for a business (generates a secret once)."""
    _require_owner(business_id, user)
    if biz_repo.get_qr_secret(business_id) is None:
        biz_repo.enable_qr(business_id, qr.generate_secret())
    return {"enabled": True}


def current_code(business_id: int, user: dict) -> dict:
    """The code to display on the kiosk right now (auto-enables on first read).
    Polled by the owner's kiosk screen each period to keep the code fresh."""
    business = _require_owner(business_id, user)
    secret = biz_repo.get_qr_secret(business_id)
    if secret is None:
        biz_repo.enable_qr(business_id, qr.generate_secret())
        secret = biz_repo.get_qr_secret(business_id)
    return {
        "business_id": business_id,
        "business_name": business["name"],
        "token": qr.current_token(secret),
        "period_seconds": settings.qr_token_period_seconds,
    }
