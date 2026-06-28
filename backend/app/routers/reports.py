"""Report routes — the consumer's customizable "My Local Impact" report (§11/§17).

Mirrors the owner analytics endpoint's knobs, but scoped to the signed-in user's
own activity (no business id, no ownership check — you can only ever see your own
data because the user id comes from the auth token):

    GET /reports/me?from=2025-06-01&to=2026-06-01&granularity=month
                    &sections=summary,spend_by_category

``from`` is a Python keyword so the query param is aliased. Bad dates, reversed
ranges, unknown sections, and bad granularity all return friendly 422s (§12).
"""

from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.middleware.security import current_user
from app.services import user_report

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_date(raw: Optional[str], fallback: dt.datetime) -> dt.datetime:
    if not raw:
        return fallback
    try:
        return dt.datetime.fromisoformat(raw).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"'{raw}' isn't a valid date — use YYYY-MM-DD.")


@router.get("/me")
async def my_report(
    user: dict = Depends(current_user),
    sections: Optional[str] = None,                       # comma-separated; default = all
    granularity: str = "week",                            # day | week | month
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
) -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    # Default window is the trailing year — the report doubles as a "year in review".
    start = _parse_date(date_from, now - dt.timedelta(days=365))
    # 'to' is inclusive: extend to end-of-day so today's activity is counted.
    end = _parse_date(date_to, now) + dt.timedelta(days=1) - dt.timedelta(seconds=1)
    if end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "The end date must be on or after the start date.")

    if granularity not in user_report.reports_repo.GRANULARITIES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unknown granularity '{granularity}'. "
            f"Valid: {', '.join(sorted(user_report.reports_repo.GRANULARITIES))}.",
        )

    selected = (
        {s.strip() for s in sections.split(",") if s.strip()} if sections
        else set(user_report.ALL_SECTIONS)
    )
    unknown = selected - user_report.ALL_SECTIONS
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unknown section(s): {', '.join(sorted(unknown))}. "
            f"Valid: {', '.join(sorted(user_report.ALL_SECTIONS))}.",
        )

    return user_report.build_report(
        user["id"], user.get("created_at"), start, end, selected, granularity
    )
