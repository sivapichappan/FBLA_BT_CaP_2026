"""Trip-planner routes. Planning is open to all; saving requires auth (§5)."""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.security import current_user
from app.repositories import trips as trips_repo
from app.services import trip_planner

router = APIRouter(prefix="/trips", tags=["trips"])


class PlanIn(BaseModel):
    lat: Optional[Annotated[float, Field(ge=-90, le=90)]] = None
    lng: Optional[Annotated[float, Field(ge=-180, le=180)]] = None
    duration: Literal["quick", "half", "full"] = "half"
    interests: list[str] = Field(default_factory=list, max_length=6)
    start_time: str = Field(default="10:00", pattern=r"^\d{2}:\d{2}$")
    # Free-text "describe your day" — Gemini interprets it into planning inputs.
    goals: Optional[Annotated[str, Field(max_length=500)]] = None


class SaveTripIn(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    params: dict
    stops: list[dict] = Field(min_length=1, max_length=8)


@router.post("/plan")
async def plan_trip(body: PlanIn) -> dict:
    """Build an all-independent walking itinerary (no save)."""
    return await trip_planner.plan(
        lat=body.lat, lng=body.lng, duration=body.duration,
        interests=body.interests, start_time=body.start_time, goals=body.goals,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def save_trip(body: SaveTripIn, user: dict = Depends(current_user)) -> dict:
    return trips_repo.create(user["id"], body.title, body.params, body.stops)


@router.get("")
async def my_trips(user: dict = Depends(current_user)) -> list[dict]:
    return trips_repo.list_for_user(user["id"])


@router.delete("/{trip_id}", status_code=status.HTTP_200_OK)
async def delete_trip(trip_id: int, user: dict = Depends(current_user)) -> dict:
    if not trips_repo.delete(trip_id, user["id"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found.")
    return {"status": "deleted"}
