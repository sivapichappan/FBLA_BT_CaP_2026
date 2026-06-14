"""Review routes (CRUD + helpful). Thin layer (§5).

These POST/PATCH/DELETE routes are NOT rate-limited, so they use the normal
``body: Model`` style (no slowapi wrapper interfering). Writes require auth;
listing is public.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.middleware.security import current_user
from app.models.review import ReplyIn, ReplyOut, ReviewIn, ReviewOut, ReviewUpdateIn
from app.repositories import reviews as reviews_repo
from app.services import reviews_service

router = APIRouter(tags=["reviews"])


@router.get("/reviews/mine")
async def my_reviews(user: dict = Depends(current_user)) -> list[dict]:
    """The signed-in user's reviews, newest first (profile page)."""
    return reviews_repo.list_for_user(user["id"])


@router.get("/businesses/{business_id}/reviews", response_model=list[ReviewOut])
async def list_reviews(business_id: int, sort: str = "recent", limit: int = 50, offset: int = 0) -> list[ReviewOut]:
    return reviews_repo.list_for_business(business_id, sort=sort, limit=min(limit, 100), offset=offset)


@router.post("/businesses/{business_id}/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(business_id: int, body: ReviewIn, user: dict = Depends(current_user)) -> ReviewOut:
    return reviews_service.create_review(business_id, user, body)


@router.patch("/reviews/{review_id}", response_model=ReviewOut)
async def update_review(review_id: int, body: ReviewUpdateIn, user: dict = Depends(current_user)) -> ReviewOut:
    return reviews_service.update_review(review_id, user, body)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_200_OK)
async def delete_review(review_id: int, user: dict = Depends(current_user)) -> dict:
    reviews_service.delete_review(review_id, user)
    return {"status": "deleted"}


@router.post("/reviews/{review_id}/helpful")
async def mark_helpful(review_id: int, user: dict = Depends(current_user)) -> dict:
    return {"helpful_count": reviews_service.mark_helpful(review_id)}


@router.post("/reviews/{review_id}/reply", response_model=ReplyOut)
async def reply_to_review(review_id: int, body: ReplyIn, user: dict = Depends(current_user)) -> ReplyOut:
    """Create or update the owner's response to a review (one per review)."""
    return reviews_service.reply_to_review(review_id, user, body)


@router.delete("/reviews/{review_id}/reply", status_code=status.HTTP_200_OK)
async def delete_reply(review_id: int, user: dict = Depends(current_user)) -> dict:
    reviews_service.delete_reply(review_id, user)
    return {"status": "deleted"}
