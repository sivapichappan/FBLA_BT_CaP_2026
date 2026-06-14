"""Deal routes. Thin layer (§5): list is public; posting + redeeming need auth."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.middleware.security import current_user
from app.models.deal import DealIn, DealOut, RedemptionOut
from app.repositories import deals as deals_repo
from app.services import deals_service

router = APIRouter(prefix="/deals", tags=["deals"])


class VerifyCodeIn(BaseModel):
    """Cashier-mode lookup: the code a customer shows at the counter."""

    code: Annotated[str, Field(min_length=4, max_length=16)]
    # False = just check it; True = check AND stamp it used in one step.
    mark_used: bool = False


@router.get("", response_model=list[DealOut])
async def list_active_deals() -> list[DealOut]:
    return deals_repo.list_active()


@router.get("/business/{business_id}", response_model=list[DealOut])
async def deals_for_business(business_id: int) -> list[DealOut]:
    return deals_repo.list_for_business(business_id)


@router.get("/redemptions", response_model=list[RedemptionOut])
async def my_redemptions(user: dict = Depends(current_user)) -> list[RedemptionOut]:
    return deals_repo.list_redemptions_for_user(user["id"])


@router.post("", response_model=DealOut, status_code=status.HTTP_201_CREATED)
async def create_deal(body: DealIn, user: dict = Depends(current_user)) -> DealOut:
    return deals_service.create_deal(user, body)


@router.post("/verify-code")
async def verify_code(body: VerifyCodeIn, user: dict = Depends(current_user)) -> dict:
    """Cashier mode: validate (and optionally consume) a redemption code."""
    return deals_service.verify_code(body.code, user, mark_used=body.mark_used)


@router.post("/{deal_id}/redeem", response_model=RedemptionOut)
async def redeem_deal(deal_id: int, user: dict = Depends(current_user)) -> RedemptionOut:
    return deals_service.redeem(deal_id, user)
