"""Business discovery routes (search, categories, detail, photo proxy).

Thin layer (§5): parse query params → ``SearchParams`` → call the search
service. Search is a GET with no body, so the slowapi decorator works directly
(unlike the auth POSTs). The photo proxy keeps the Maps key server-side (§15).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse

from app.config import settings
from app.middleware.rate_limit import SEARCH_LIMIT, limiter
from app.middleware.security import current_user, optional_user
from app.models.business import (
    BusinessIn,
    BusinessUpdateIn,
    CategoryOut,
    SearchParams,
    SearchResponse,
)
from app.repositories import businesses as biz_repo
from app.services import places, search_service

router = APIRouter(prefix="/businesses", tags=["businesses"])


def _csv_ints(raw: Optional[str]) -> list[int]:
    """Parse '1,2,3' → [1,2,3], ignoring blanks/garbage."""
    out: list[int] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


def _csv_strs(raw: Optional[str]) -> list[str]:
    return [p.strip() for p in (raw or "").split(",") if p.strip()]


@router.get("/search", response_model=SearchResponse)
@limiter.limit(SEARCH_LIMIT)
async def search(
    request: Request,
    q: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_m: int = 5000,
    categories: Optional[str] = None,       # comma-separated category names
    min_rating: float = 0.0,
    price_levels: Optional[str] = None,     # comma-separated 1..4
    open_now: bool = False,
    sort: str = "best_match",
) -> SearchResponse:
    # Default to the demo city center when the client hasn't shared a location.
    # Note: there is no "independent only" parameter — hiding chains is the
    # product, applied by the classifier pipeline to every search.
    params = SearchParams(
        q=q or None,
        lat=lat if lat is not None else settings.demo_lat,
        lng=lng if lng is not None else settings.demo_lng,
        radius_m=radius_m,
        categories=_csv_strs(categories),
        min_rating=min_rating,
        price_levels=_csv_ints(price_levels),
        open_now=open_now,
        sort=sort if sort in ("best_match", "distance", "rating", "reviews") else "best_match",
    )
    return await search_service.search(params)


@router.get("/categories", response_model=list[CategoryOut])
async def categories() -> list[CategoryOut]:
    return biz_repo.list_categories()


@router.get("/vibe")
@limiter.limit(SEARCH_LIMIT)
async def vibe(
    request: Request,
    q: str = Query(min_length=3, max_length=200),
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    categories: Optional[str] = None,       # same FilterBar params as /search
    min_rating: float = 0.0,
    price_levels: Optional[str] = None,
    open_now: bool = False,
) -> dict:
    """Semantic search by feel: 'cozy rainy-day reading spot' → bookstores.

    Similarity ranks; the FilterBar filters gate eligibility — the same rules
    as classic search, so switching modes never silently drops your filters.
    """
    user_lat = lat if lat is not None else settings.demo_lat
    user_lng = lng if lng is not None else settings.demo_lng
    # radius_m is maxed out: vibe has its own metro-range rule (40 km for the
    # curated index), so the generic radius check must never cut candidates.
    filters = SearchParams(
        lat=user_lat, lng=user_lng, radius_m=50000,
        categories=_csv_strs(categories),
        min_rating=min_rating,
        price_levels=_csv_ints(price_levels),
        open_now=open_now,
    )
    return await search_service.vibe_search(q, user_lat, user_lng, filters=filters)


@router.get("/photo")
async def photo(name: str = Query(...), maxwidth: int = 480):
    """Resolve a Google Places photo to a temporary image URL and redirect to it.

    Proxying keeps the API key off the client and lets us cache at the CDN.
    """
    uri = await places.fetch_photo_uri(name, maxwidth)
    if not uri:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo unavailable.")
    resp = RedirectResponse(uri, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@router.get("/mine")
async def my_businesses(user: dict = Depends(current_user)) -> list[dict]:
    """The signed-in owner's businesses (drives the dashboard selector)."""
    return biz_repo.list_by_owner(user["id"])


@router.get("/geocode")
async def geocode(address: str = Query(min_length=5, max_length=200)) -> dict:
    """Address → coordinates for the add-business form. 404 (not 500) when
    the address can't be resolved, so the form can fall back to manual entry."""
    result = await places.geocode(address)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Couldn't find that address — check it or enter coordinates manually.")
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_business(body: BusinessIn, user: dict = Depends(current_user)) -> dict:
    """Create a listing (owner/admin). Business + categories + hours commit in
    ONE transaction (§11). Semantic check (§12): open days need both times."""
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only business-owner accounts can add a listing.")
    for h in body.hours:
        if not h.closed and (not h.open or not h.close):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                f"Day {h.dow}: an open day needs both an open and a close time.")
        if not h.closed and h.open and h.close and h.close <= h.open:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                f"Day {h.dow}: closing time must be after opening time.")
    business_id = biz_repo.create(user["id"], body.model_dump())
    return biz_repo.get_local(business_id)


@router.patch("/{business_id}")
async def update_business(business_id: int, body: BusinessUpdateIn,
                          user: dict = Depends(current_user)) -> dict:
    """Edit a listing — only its owner (or an admin)."""
    business = biz_repo.get_local(business_id)
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    if business.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own business.")
    biz_repo.update(business_id, body.model_dump())
    return biz_repo.get_local(business_id)


@router.get("/{business_id}/summary")
async def review_summary(business_id: int) -> dict:
    """“What people love here” — cached LLM digest of real reviews (or null)."""
    from app.services import reviews_service  # local import avoids a cycle
    return {"summary": await reviews_service.get_summary(business_id)}


@router.get("/{ref}/signals")
async def signals(ref: str):
    """Glass-box endpoint (§9.4): the classification provenance for one
    business — which pipeline gate decided (owner record / chain registry /
    Gemini audit) and why."""
    result = await search_service.get_signals(ref)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    return result


# NOTE: keep this LAST — a path param would otherwise swallow /search, /categories.
@router.get("/{ref}")
async def detail(
    ref: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    viewer: Optional[dict] = Depends(optional_user),
):
    """Single business by ref: a local id (e.g. '12') or a Google id ('gp_...')."""
    result = await search_service.get_detail(ref, lat, lng)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    # View tracking (local listings only): best-effort — never break the page.
    if ref.isdigit():
        try:
            biz_repo.log_view(int(ref), viewer["id"] if viewer else None)
        except Exception:
            pass
    return result
