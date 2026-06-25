"""Business + search models — the canonical shape returned by discovery.

Local DB businesses and Google Places results are normalized into the SAME
``BusinessOut`` shape (BUILD_SPEC §4) so the frontend renders one card type and
the ranker scores one structure regardless of source.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SortMode = Literal["best_match", "distance", "rating", "reviews"]


class Accessibility(BaseModel):
    """Wheelchair accessibility, tri-state per facet: True = accessible,
    False = known not accessible, None = not reported. Matches Google Places'
    accessibilityOptions and the owner self-report form. `extra="forbid"` makes
    an owner payload with an unknown key a clean 422."""

    model_config = ConfigDict(extra="forbid")
    entrance: Optional[bool] = None
    parking: Optional[bool] = None
    restroom: Optional[bool] = None
    seating: Optional[bool] = None


class BusinessOut(BaseModel):
    ref: str                      # "gp_<placeid>" (Google) or the local id as a string
    source: Literal["local", "google"]
    name: str
    lat: float
    lng: float
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    price_level: Optional[int] = None        # 1–4
    categories: list[str] = Field(default_factory=list)
    average_rating: float = 0.0
    review_count: int = 0
    is_independent: Optional[bool] = None     # set by the small-business classifier
    local_confidence: Optional[float] = None
    local_badge: Optional[str] = None         # 'verified_local' | 'likely_local' | None
    # Classification provenance: 'local-owner' | 'gemini' | 'unverified-offline'
    # (registry-matched chains never reach a response, so no value for them).
    verdict_source: Optional[str] = None
    verdict_reason: Optional[str] = None
    is_open_now: Optional[bool] = None
    # Estimated DRIVING distance (straight-line × a road-circuity factor), not
    # as-the-crow-flies — what you'd actually travel by road. See ranker.driving_km.
    distance_km: Optional[float] = None
    photo_url: Optional[str] = None
    # Smart-crop focal point as % of the frame (Phase F); None = center crop.
    photo_focus_x: Optional[int] = None
    photo_focus_y: Optional[int] = None
    editorial_summary: Optional[str] = None
    # Wheelchair accessibility (Google Places + owner self-report); None when
    # the business has no reported data at all.
    accessibility: Optional[Accessibility] = None


class BusinessSnapshot(BaseModel):
    """Enough of a live Google business to materialize a local row on first
    review/check-in — so ANY business nationwide is reviewable, not just the
    seeded NYC set. It's the data already on the user's screen, so no extra
    Places call is needed. Ignored for businesses that already exist locally."""

    name: str = Field(min_length=1, max_length=200)
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]
    address: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    website: Optional[str] = Field(default=None, max_length=400)
    price_level: Optional[Annotated[int, Field(ge=1, le=4)]] = None


class SearchParams(BaseModel):
    """Normalized, validated search inputs (built from query params in the router)."""

    q: Optional[str] = None
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]
    radius_m: Annotated[int, Field(ge=100, le=50000)] = 5000
    categories: list[str] = Field(default_factory=list)
    min_rating: Annotated[float, Field(ge=0, le=5)] = 0.0
    price_levels: list[int] = Field(default_factory=list)   # subset of 1..4
    open_now: bool = False
    # Keep-unknowns filter (mirrors price): hides only KNOWN-inaccessible spots.
    wheelchair_accessible: bool = False
    sort: SortMode = "best_match"


class SearchResponse(BaseModel):
    results: list[BusinessOut]
    total: int
    # True when live Google results were unavailable and we served local-only
    # data (the demo stays populated — BUILD_SPEC §13).
    used_local_fallback: bool = False
    # The min-results ladder may widen the search circle beyond what was asked
    # for; the UI uses these to say so honestly ("Widened to 20 km …").
    radius_used_km: float = 5.0
    radius_expanded: bool = False


class CategoryOut(BaseModel):
    id: int
    name: str


class HoursIn(BaseModel):
    """One weekday's hours (0 = Sunday … 6 = Saturday)."""

    dow: Annotated[int, Field(ge=0, le=6)]
    open: Optional[str] = None    # "08:00"
    close: Optional[str] = None   # "20:00"
    closed: bool = False


class BusinessIn(BaseModel):
    """Owner add-business payload — syntactic checks here (§12); the
    cross-field rules (closed days need no times; open needs both) and the
    one-transaction write live in the service/repo."""

    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=5, max_length=200)
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]
    phone: Optional[str] = Field(default=None, max_length=25)
    website: Optional[str] = Field(default=None, max_length=200)
    price_level: Optional[Annotated[int, Field(ge=1, le=4)]] = None
    photo_url: Optional[str] = Field(default=None, max_length=400)
    category_ids: list[int] = Field(default_factory=list, max_length=5)
    hours: list[HoursIn] = Field(default_factory=list, max_length=7)
    accessibility: Optional[Accessibility] = None


class BusinessUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    address: Optional[str] = Field(default=None, min_length=5, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=25)
    website: Optional[str] = Field(default=None, max_length=200)
    price_level: Optional[Annotated[int, Field(ge=1, le=4)]] = None
    photo_url: Optional[str] = Field(default=None, max_length=400)
    accessibility: Optional[Accessibility] = None
