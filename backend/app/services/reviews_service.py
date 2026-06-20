"""Review logic: existence, ownership, and one-review-per-user rules (§8.2)."""

from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import HTTPException, status

from app.config import settings
from app.models.review import ReplyIn, ReviewIn, ReviewUpdateIn
from app.repositories import businesses as biz_repo
from app.repositories import reviews as reviews_repo
from app.repositories import visits as visits_repo
from app.services import llm, places_cache


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)

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


def _resolve_business_id(ref, snapshot: Optional[dict], *, materialize: bool) -> Optional[int]:
    """Map a business ref → a local businesses.id. A Google business
    (``gp_<placeid>``) is materialized into a local row on first write so any
    business nationwide is reviewable. Returns None only on a READ path
    (materialize=False) when the Google business has no row yet → empty result."""
    ref = str(ref)
    if ref.isdigit():
        if not biz_repo.get_local(int(ref)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
        return int(ref)
    if ref.startswith("gp_"):
        place_id = ref[3:]
        existing = biz_repo.get_by_place_id(place_id)
        if existing:
            return existing["id"]
        if not materialize:
            return None
        if not snapshot:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "We need this business's details to save your review.")
        return biz_repo.create_from_google(place_id, snapshot)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")


def list_reviews(ref: str, *, sort: str, limit: int, offset: int, verified_only: bool) -> list[dict]:
    """Reviews for a business by ref. A not-yet-materialized Google business
    simply has no reviews yet (returns [] without creating a row)."""
    business_id = _resolve_business_id(ref, None, materialize=False)
    if business_id is None:
        return []
    return reviews_repo.list_for_business(
        business_id, sort=sort, limit=limit, offset=offset, verified_only=verified_only
    )


def _validate_visit_link(business_id: int, user: dict, visit_id: Optional[int]) -> Optional[int]:
    """Enforce the verified-review invariant: a review may link a visit ONLY if
    that visit is VERIFIED, belongs to this user, is for this business, and was
    verified within the link window. A good link is returned (→ verified review);
    a bad one either raises (strict mode, the default) or is dropped to None so
    the review still posts as unverified."""
    if visit_id is None:
        return None
    visit = visits_repo.get(visit_id)
    valid = (
        visit is not None
        and visit["user_id"] == user["id"]
        and visit["business_id"] == business_id
        and visit["status"] == "VERIFIED"
        and visit["verified_at"] is not None
        and visit["verified_at"] >= _now() - dt.timedelta(hours=settings.review_link_window_hours)
    )
    if valid:
        return visit_id
    if settings.strict_review_link:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "That check-in can't be linked to this review.")
    return None


def create_review(ref: str, user: dict, data: ReviewIn) -> dict:
    # Resolve the ref (materializing a Google business on first review) so any
    # business is reviewable, then apply the same one-per-user + verified-link rules.
    snapshot = data.snapshot.model_dump() if data.snapshot else None
    business_id = _resolve_business_id(ref, snapshot, materialize=True)
    if reviews_repo.user_has_reviewed(business_id, user["id"]):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already reviewed this business.")
    visit_id = _validate_visit_link(business_id, user, data.visit_id)
    return reviews_repo.create(business_id, user["id"], data.rating, data.body, visit_id)


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
