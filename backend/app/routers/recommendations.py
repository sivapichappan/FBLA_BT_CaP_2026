"""Personalized picks route. Thin layer (§5); requires auth (picks are personal)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from app.config import settings
from app.middleware.security import current_user
from app.services import recommendations

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("")
async def for_you(
    user: dict = Depends(current_user),
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> list[dict]:
    return recommendations.for_user(
        user["id"],
        lat if lat is not None else settings.demo_lat,
        lng if lng is not None else settings.demo_lng,
    )
