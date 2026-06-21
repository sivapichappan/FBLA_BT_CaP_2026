"""Calendar (.ics) export for a saved trip (idea 10c).

Hand-rolled VCALENDAR — the format is simple text, so rolling it keeps zero
dependencies and is fully explainable in Q&A (one VEVENT per stop, from its
arrival time for its dwell). RFC 5545 essentials only: CRLF line endings,
escaped text values, a TZID matching the app's Eastern-Time assumption, and a
DTSTAMP/UID per event.
"""

from __future__ import annotations

import datetime as dt
from typing import Optional


def _esc(s: Optional[str]) -> str:
    """Escape a text value per RFC 5545 (backslash, comma, semicolon, newline)."""
    return (
        (s or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _arrive_minutes(stop: dict) -> int:
    """Minutes-from-midnight for a stop — prefer the raw int, fall back to parsing
    the '%-I:%M %p' label so older saved trips still export."""
    am = stop.get("arrive_min")
    if isinstance(am, int):
        return am
    try:
        t = dt.datetime.strptime(str(stop.get("arrive", "")).strip(), "%I:%M %p")
        return t.hour * 60 + t.minute
    except ValueError:
        return 10 * 60


def to_ics(trip: dict, *, date: Optional[str] = None) -> str:
    """Build a VCALENDAR string for a trip. ``date`` (YYYY-MM-DD) is the day the
    outing happens; defaults to today."""
    title = trip.get("title") or "My local day"
    stops = trip.get("stops") or []
    try:
        day = dt.date.fromisoformat(date) if date else dt.date.today()
    except ValueError:
        day = dt.date.today()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LocalLens//Trip Planner//EN",
        "CALSCALE:GREGORIAN",
    ]
    for i, s in enumerate(stops):
        arr = _arrive_minutes(s)
        dwell = int(s.get("dwell_min") or 30)
        start_dt = dt.datetime.combine(day, dt.time(arr // 60 % 24, arr % 60))
        end_dt = start_dt + dt.timedelta(minutes=dwell)
        lines += [
            "BEGIN:VEVENT",
            f"UID:trip-{trip.get('id', 'x')}-{i}@locallens",
            f"DTSTAMP:{stamp}",
            f"DTSTART;TZID=America/New_York:{start_dt.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND;TZID=America/New_York:{end_dt.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{_esc(s.get('name'))}",
            f"LOCATION:{_esc(s.get('address'))}",
            f"DESCRIPTION:{_esc((s.get('slot') or '') + ' · ' + title + ' (LocalLens)')}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
