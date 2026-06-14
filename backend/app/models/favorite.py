"""Favorite models. A favorite stores a denormalized snapshot of the business so
it keeps rendering even if the source (a local row or a Google place) disappears
(BUILD_SPEC §8.4)."""

from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field


class FavoriteSnapshot(BaseModel):
    """Denormalized copy of the business at favorite-time (enough to render a card)."""

    name: str
    source: Optional[str] = None
    address: Optional[str] = None
    average_rating: Optional[float] = None
    review_count: Optional[int] = None
    price_level: Optional[int] = None
    categories: list[str] = Field(default_factory=list)
    photo_url: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    local_badge: Optional[str] = None


class FavoriteIn(BaseModel):
    business_ref: str = Field(min_length=1, max_length=200)  # local id as text OR 'gp_<placeid>'
    snapshot: FavoriteSnapshot


class FavoriteOut(BaseModel):
    id: int
    business_ref: str
    snapshot: dict
    created_at: dt.datetime
