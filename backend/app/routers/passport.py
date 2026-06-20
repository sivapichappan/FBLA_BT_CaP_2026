"""The check-in passport (§17): badges, streak, and money-kept-local for the
signed-in user. Thin layer — the derivation lives in services/passport.py."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.middleware.security import current_user
from app.services import passport as passport_service

router = APIRouter(prefix="/passport", tags=["passport"])


@router.get("/me")
async def my_passport(user: dict = Depends(current_user)) -> dict:
    """Everything the passport screen needs: counters, badges, streak, impact."""
    return passport_service.build(user["id"])
