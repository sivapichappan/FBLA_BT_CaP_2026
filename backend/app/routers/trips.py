"""Trip-planner routes. Planning is open to all; saving requires auth (§5)."""

from __future__ import annotations

import datetime as dt
import secrets
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator

from app.middleware.security import current_user, optional_user
from app.repositories import trips as trips_repo
from app.services import trip_export, trip_planner

router = APIRouter(prefix="/trips", tags=["trips"])


class PlanIn(BaseModel):
    lat: Optional[Annotated[float, Field(ge=-90, le=90)]] = None
    lng: Optional[Annotated[float, Field(ge=-180, le=180)]] = None
    interests: list[str] = Field(default_factory=list, max_length=6)
    # The day is bounded by an explicit window + a target number of stops, asked
    # for separately so the user controls each (replacing the old "duration"
    # preset that bundled time and count together).
    start_time: str = Field(default="10:00", pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(default="16:00", pattern=r"^\d{2}:\d{2}$")
    num_stops: int = Field(default=4, ge=1, le=8)
    # Free-text "describe your day" — Gemini interprets it into planning inputs.
    goals: Optional[Annotated[str, Field(max_length=500)]] = None
    # Optional personalisation knobs (idea 4/6/8). All None = the neutral default
    # plan, so anonymous callers + the cache warmer are unaffected.
    audience: Optional[Literal["solo", "couple", "family", "group"]] = None
    occasion: Optional[Literal["casual", "date", "celebrate"]] = None
    pace: Optional[Literal["relaxed", "normal", "packed"]] = None
    budget: Optional[Annotated[int, Field(ge=1, le=3)]] = None  # $ / $$ / $$$
    weekday: Optional[Annotated[int, Field(ge=0, le=6)]] = None  # 0=Sun..6=Sat (open-on-arrival)
    # Build the day only from wheelchair-accessible stops (keep-unknowns, like search).
    accessible_only: bool = False
    # Stops the user locked, kept exactly when re-planning around them (idea 1).
    locked_refs: list[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def _window_is_valid(self) -> "PlanIn":
        """End must be a real time AFTER the start — a backwards or zero-length
        window can't hold a day, so reject it with a clear 422 here rather than
        silently producing an empty plan."""
        try:
            start = dt.time.fromisoformat(self.start_time)
            end = dt.time.fromisoformat(self.end_time)
        except ValueError:
            raise ValueError("start_time and end_time must be valid HH:MM times")
        if end <= start:
            raise ValueError("end_time must be later than start_time")
        return self


class StartIn(BaseModel):
    lat: float
    lng: float
    time: str = Field(pattern=r"^\d{2}:\d{2}$")


class RetimeIn(BaseModel):
    """Re-time an edited itinerary (idea 1). The server owns the clock math so the
    frontend never duplicates (and drifts from) the walk/dwell/window rules."""
    start: StartIn
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    stops: list[dict] = Field(default_factory=list, max_length=8)
    dwell_overrides: dict[str, int] = Field(default_factory=dict)


class SaveTripIn(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    params: dict
    stops: list[dict] = Field(min_length=1, max_length=8)


@router.post("/plan")
async def plan_trip(body: PlanIn, user: Optional[dict] = Depends(optional_user)) -> dict:
    """Build an all-independent walking itinerary (no save). Personalises for a
    signed-in user (favourites boost) but stays fully usable anonymously."""
    return await trip_planner.plan(
        lat=body.lat, lng=body.lng, interests=body.interests,
        start_time=body.start_time, end_time=body.end_time,
        num_stops=body.num_stops, goals=body.goals,
        audience=body.audience, occasion=body.occasion,
        pace=body.pace, budget=body.budget, weekday=body.weekday,
        accessible_only=body.accessible_only,
        locked_refs=body.locked_refs,
        user_id=user["id"] if user else None,
    )


@router.post("/retime")
async def retime_trip(body: RetimeIn) -> dict:
    """Recompute clocks/walks for an edited itinerary (no save, no auth)."""
    return trip_planner.retime(
        body.stops, body.start.lat, body.start.lng, body.start.time,
        body.end_time, dwell_overrides=body.dwell_overrides,
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


# ── Share + calendar export (idea 10c) ──────────────────────────────────────


@router.post("/{trip_id}/share")
async def share_trip(trip_id: int, user: dict = Depends(current_user)) -> dict:
    """Mint (or return) a public read-only share token for a saved trip."""
    trip = trips_repo.get(trip_id, user["id"])
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found.")
    token = trip.get("share_token")
    if not token:
        token = secrets.token_urlsafe(12)
        trips_repo.set_share_token(trip_id, user["id"], token)
    return {"share_token": token}


# `.ics` route is declared BEFORE the plain one so a token like "abc" doesn't
# swallow the ".ics" suffix.
@router.get("/share/{token}.ics")
async def shared_trip_ics(token: str) -> Response:
    """Public .ics calendar export of a shared trip (no auth)."""
    trip = trips_repo.get_by_share_token(token)
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shared trip not found.")
    return Response(
        content=trip_export.to_ics(trip),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="locallens-day.ics"'},
    )


@router.get("/share/{token}")
async def shared_trip(token: str) -> dict:
    """Public read-only view of a shared trip (no auth; user_id never returned)."""
    trip = trips_repo.get_by_share_token(token)
    if not trip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shared trip not found.")
    return trip
