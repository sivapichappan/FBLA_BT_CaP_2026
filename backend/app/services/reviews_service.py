"""Review logic: existence, ownership, and one-review-per-user rules (§8.2)."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status

from app.models.review import ReplyIn, ReviewIn, ReviewUpdateIn
from app.repositories import businesses as biz_repo
from app.repositories import reviews as reviews_repo
from app.services import llm, places_cache

# A summary needs enough material to be honest about "what people love".
MIN_REVIEWS_FOR_SUMMARY = 3


async def get_summary(business_id: int) -> Optional[str]:
    """LLM digest of this business's reviews, cached until the count changes.

    The cache key embeds review_count, so a new review naturally invalidates
    the stored summary. Returns None (UI hides the block) when there are too
    few reviews or the LLM is unreachable — never an error.
    """
    reviews = reviews_repo.list_for_business(business_id, limit=20)
    if len(reviews) < MIN_REVIEWS_FOR_SUMMARY:
        return None

    business = biz_repo.get_local(business_id)
    if not business:
        return None

    cache_key = f"revsum:{business_id}:{business['review_count']}"
    cached = places_cache.get(cache_key)
    if cached:
        return cached

    summary = await llm.summarize_reviews(business["name"], [r["body"] for r in reviews])
    if summary:
        places_cache.set(cache_key, summary)
    return summary


def _require_business_owner(review_id: int, user: dict) -> dict:
    """The review must exist AND the caller must own the reviewed business
    (or be an admin). Returns the review row. Shared by the reply endpoints."""
    review = reviews_repo.get(review_id)
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    business = biz_repo.get_local(review["business_id"])
    if not business or (business.get("owner_id") != user["id"] and user.get("role") != "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only this business's owner can respond to its reviews.")
    return review


def reply_to_review(review_id: int, user: dict, data: ReplyIn) -> dict:
    _require_business_owner(review_id, user)
    saved = reviews_repo.upsert_reply(review_id, user["id"], data.body)
    return {"body": saved["body"], "owner_username": user["username"], "created_at": saved["created_at"]}


def delete_reply(review_id: int, user: dict) -> None:
    _require_business_owner(review_id, user)
    if not reviews_repo.delete_reply(review_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No reply to delete.")


def create_review(business_id: int, user: dict, data: ReviewIn) -> dict:
    if not biz_repo.get_local(business_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    if reviews_repo.user_has_reviewed(business_id, user["id"]):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already reviewed this business.")
    return reviews_repo.create(business_id, user["id"], data.rating, data.body)


def update_review(review_id: int, user: dict, data: ReviewUpdateIn) -> dict:
    row = reviews_repo.get(review_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    if row["user_id"] != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own review.")
    return reviews_repo.update(review_id, row["business_id"], rating=data.rating, body=data.body)


def delete_review(review_id: int, user: dict) -> None:
    row = reviews_repo.get(review_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    # Author or an admin may delete.
    if row["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own review.")
    reviews_repo.delete(review_id, row["business_id"], row["user_id"])


def mark_helpful(review_id: int) -> int:
    count = reviews_repo.mark_helpful(review_id)
    if count is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    return count
