"""Favorites routes (all require auth). Thin layer (§5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.middleware.security import current_user
from app.models.favorite import FavoriteIn, FavoriteOut
from app.repositories import favorites as fav_repo

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=list[FavoriteOut])
async def list_favorites(user: dict = Depends(current_user)) -> list[FavoriteOut]:
    return fav_repo.list_for_user(user["id"])


@router.post("", response_model=FavoriteOut, status_code=status.HTTP_201_CREATED)
async def add_favorite(body: FavoriteIn, user: dict = Depends(current_user)) -> FavoriteOut:
    # model_dump so the JSONB column stores plain JSON, not a Pydantic object.
    return fav_repo.add(user["id"], body.business_ref, body.snapshot.model_dump())


@router.delete("/{business_ref}", status_code=status.HTTP_200_OK)
async def remove_favorite(business_ref: str, user: dict = Depends(current_user)) -> dict:
    fav_repo.remove(user["id"], business_ref)
    return {"status": "removed"}


@router.get("/check/{business_ref}")
async def check_favorite(business_ref: str, user: dict = Depends(current_user)) -> dict:
    return {"is_favorite": fav_repo.is_favorited(user["id"], business_ref)}
