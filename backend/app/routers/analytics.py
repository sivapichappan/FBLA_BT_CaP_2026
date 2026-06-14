"""Analytics routes — the customizable report (§11). Owner/admin only.

Query params are the report's knobs:
  ?from=2026-05-01&to=2026-06-09&metrics=summary,reviews_trend
(``from`` is a Python keyword, so the parameter is aliased.) Invalid metric
names and reversed date ranges get friendly 422s (semantic validation, §12).
"""

from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.middleware.security import current_user
from app.repositories import businesses as biz_repo
from app.services import analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _authorize(business_id: int, user: dict) -> None:
    """Only the owning user (or an admin) may read a business's analytics."""
    business = biz_repo.get_local(business_id)
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    if business.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view analytics for your own business.")


def _parse_date(raw: Optional[str], fallback: dt.datetime) -> dt.datetime:
    if not raw:
        return fallback
    try:
        return dt.datetime.fromisoformat(raw).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"'{raw}' isn't a valid date — use YYYY-MM-DD.")


@router.get("/business/{business_id}")
async def business_report(
    business_id: int,
    user: dict = Depends(current_user),
    metrics: Optional[str] = None,                              # comma-separated; default = all
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
) -> dict:
    _authorize(business_id, user)

    now = dt.datetime.now(dt.timezone.utc)
    start = _parse_date(date_from, now - dt.timedelta(days=30))
    # 'to' is inclusive: extend to end-of-day so today's rows are counted.
    end = _parse_date(date_to, now) + dt.timedelta(days=1) - dt.timedelta(seconds=1)
    if end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "The end date must be on or after the start date.")

    selected = (
        {m.strip() for m in metrics.split(",") if m.strip()} if metrics else set(analytics.ALL_METRICS)
    )
    unknown = selected - analytics.ALL_METRICS
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unknown metric(s): {', '.join(sorted(unknown))}. "
            f"Valid: {', '.join(sorted(analytics.ALL_METRICS))}.",
        )

    return analytics.build_report(business_id, start, end, selected)
