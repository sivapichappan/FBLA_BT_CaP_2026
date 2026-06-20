"""Review request/response models (syntactic validation lives here, §12)."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Optional

from pydantic import BaseModel, Field

from app.models.business import BusinessSnapshot

Rating = Annotated[int, Field(ge=1, le=5)]
Body = Annotated[str, Field(min_length=1, max_length=2000)]


class ReviewIn(BaseModel):
    rating: Rating
    body: Body
    # Optionally tie this review to a VERIFIED visit (proof the reviewer was
    # there). The service validates the link (ownership, same business, verified,
    # within the link window); an invalid/absent link just yields an unverified
    # review — verification is a badge, never a gate.
    visit_id: Optional[int] = None
    # Present only when reviewing a live Google business that has no local row
    # yet — lets the server materialize one so any business is reviewable.
    snapshot: Optional[BusinessSnapshot] = None


class ReviewUpdateIn(BaseModel):
    rating: Optional[Rating] = None
    body: Optional[Body] = None


class ReplyIn(BaseModel):
    """An owner's response to a review (one per review)."""

    body: Annotated[str, Field(min_length=1, max_length=1000)]


class ReplyOut(BaseModel):
    body: str
    owner_username: str
    created_at: dt.datetime


class ReviewOut(BaseModel):
    id: int
    business_id: int
    user_id: int
    username: str
    rating: int
    body: str
    helpful_count: int
    created_at: dt.datetime
    # True when this review is backed by a verified visit (drives the badge +
    # the verified-only rating). Derived as ``visit_id IS NOT NULL`` in the repo.
    is_verified: bool = False
    reply: Optional[ReplyOut] = None
