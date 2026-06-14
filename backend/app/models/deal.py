"""Deal models. Syntactic checks live here (§12): discount 1–100, sane limits,
valid timestamps. The cross-field semantic rule (ends_at AFTER starts_at) is a
model validator, mirrored by a CHECK constraint at the database."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Optional

from pydantic import BaseModel, Field, model_validator

DiscountPct = Annotated[int, Field(ge=1, le=100)]


class DealIn(BaseModel):
    business_id: int
    title: str = Field(min_length=3, max_length=120)
    discount_pct: DiscountPct
    per_user_limit: Annotated[int, Field(ge=1)] = 1
    total_limit: Optional[Annotated[int, Field(ge=1)]] = None
    starts_at: dt.datetime
    ends_at: dt.datetime

    @model_validator(mode="after")
    def _ends_after_starts(self) -> "DealIn":
        """Semantic rule (§12): a deal can't end before it begins."""
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class DealOut(BaseModel):
    id: int
    business_id: int
    business_name: Optional[str] = None
    title: str
    discount_pct: int
    per_user_limit: int
    total_limit: Optional[int] = None
    redemption_count: int
    starts_at: dt.datetime
    ends_at: dt.datetime


class RedemptionOut(BaseModel):
    """What the user gets back after redeeming: the show-at-the-counter code."""

    deal_id: int
    code: str
    redeemed_at: dt.datetime
    title: str
    discount_pct: int
    business_name: Optional[str] = None
