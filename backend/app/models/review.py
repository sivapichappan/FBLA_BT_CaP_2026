"""Review request/response models (syntactic validation lives here, §12)."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Optional

from pydantic import BaseModel, Field

Rating = Annotated[int, Field(ge=1, le=5)]
Body = Annotated[str, Field(min_length=1, max_length=2000)]


class ReviewIn(BaseModel):
    rating: Rating
    body: Body


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
    reply: Optional[ReplyOut] = None
