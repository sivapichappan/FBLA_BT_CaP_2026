"""Verified-Visit routes (thin layer, §5). All require an authenticated user.

Route order matters: the literal ``/mine`` is declared before the parametric
``/{visit_id}`` so it isn't swallowed by it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.middleware.security import current_user
from app.models.visit import (
    CheckpointIn,
    QrSubmitIn,
    SpendIn,
    VisitInitiateIn,
    VisitOut,
)
from app.services import visits_service

router = APIRouter(prefix="/visits", tags=["visits"])


@router.post("/initiate", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
async def initiate(body: VisitInitiateIn, user: dict = Depends(current_user)) -> VisitOut:
    """Start a check-in at a business (idempotent if one is already active)."""
    return visits_service.initiate(user, body.business_ref, body.method, body.snapshot)


@router.post("/{visit_id}/checkpoint", response_model=VisitOut)
async def checkpoint(visit_id: int, body: CheckpointIn, user: dict = Depends(current_user)) -> VisitOut:
    """Submit a location sample; advances the visit toward a terminal status."""
    return visits_service.submit_checkpoint(user, visit_id, body)


@router.post("/{visit_id}/qr", response_model=VisitOut)
async def submit_qr(visit_id: int, body: QrSubmitIn, user: dict = Depends(current_user)) -> VisitOut:
    """Verify with the counter code (QR_GEOFENCE) — geofence still required."""
    return visits_service.submit_qr(user, visit_id, body)


@router.post("/{visit_id}/spend")
async def set_spend(visit_id: int, body: SpendIn, user: dict = Depends(current_user)) -> dict:
    """Record an optional self-reported spend on a verified visit (money kept local)."""
    return visits_service.set_spend(user, visit_id, body.spend_cents)


@router.get("/mine")
async def my_visits(user: dict = Depends(current_user)) -> list[dict]:
    """The signed-in user's visits, newest first."""
    return visits_service.list_my_visits(user)


@router.get("/{visit_id}", response_model=VisitOut)
async def get_visit(visit_id: int, user: dict = Depends(current_user)) -> VisitOut:
    """Poll a single visit's status (used while a dwell window elapses)."""
    return visits_service.get_visit(user, visit_id)
