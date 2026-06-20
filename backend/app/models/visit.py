"""Verified-Visit request/response models (syntactic validation lives here).

The check-in flow is: ``initiate`` a visit, then submit one or more
``checkpoint`` location samples until it reaches a terminal status. ``VisitOut``
is the single shape every visit endpoint returns.
"""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field

from app.models.business import BusinessSnapshot

# The verification ladder. The frontend's check-in flow defaults to the dwell
# method (our demo hero); the others exist for the full defense-in-depth ladder.
VisitMethod = Literal[
    "GPS_GEOFENCE", "GPS_GEOFENCE_DWELL", "QR_GEOFENCE", "RECEIPT", "MANUAL_CODE"
]


class VisitInitiateIn(BaseModel):
    # A business REF ("12" local, or "gp_<placeid>" Google) — so you can check in
    # anywhere, not just at seeded businesses.
    business_ref: str
    method: VisitMethod = "GPS_GEOFENCE_DWELL"
    # Present only for a Google business with no local row yet (materialize it).
    snapshot: Optional[BusinessSnapshot] = None


class CheckpointIn(BaseModel):
    """One location sample submitted during an active visit. Coordinates are
    range-checked; the client clock (``client_ts``) is accepted only as advisory
    metadata — the server clock decides everything that matters."""

    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    accuracy_m: Optional[Annotated[float, Field(ge=0)]] = None
    mock_location: bool = False
    client_ts: Optional[dt.datetime] = None
    # Optional self-reported spend, in cents, that powers the "money kept local"
    # counter (§17). Capped so a typo can't claim an absurd amount.
    spend_cents: Optional[Annotated[int, Field(ge=0, le=100_000)]] = None


class QrSubmitIn(CheckpointIn):
    """A checkpoint plus the counter code shown at the business (QR_GEOFENCE).
    The geofence is still required — the code alone never verifies a visit."""

    token: Annotated[str, Field(min_length=1, max_length=64)]


class SpendIn(BaseModel):
    """Optional self-reported spend on a verified visit (money-kept-local, §17)."""

    spend_cents: Annotated[int, Field(ge=0, le=100_000)]


class VisitOut(BaseModel):
    visit_id: int
    business_id: int
    business_name: Optional[str] = None
    status: str                 # PENDING | AWAITING_DWELL | VERIFIED | FAILED | REJECTED | EXPIRED
    method: str
    distance_m: Optional[float] = None
    verification_strength: Optional[int] = None   # present once VERIFIED
    needs_another_checkpoint: bool = False        # True while a dwell window elapses
    expires_at: dt.datetime
    verified_at: Optional[dt.datetime] = None
    # A user-safe reason on a non-success terminal state (OUTSIDE_GEOFENCE /
    # ACCURACY_TOO_LOW / EXPIRED / REJECTED). REJECTED is intentionally generic —
    # we never disclose which anti-abuse rule fired.
    reason: Optional[str] = None
    message: str = ""
