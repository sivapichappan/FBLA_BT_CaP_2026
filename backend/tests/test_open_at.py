"""Unit tests for the reusable open-at-a-time helper (idea 3). Pure function,
no DB/network. Weekday convention is 0=Sun..6=Sat (the schema's day_of_week)."""

from app.services.search_service import open_at

_HOURS = [
    {"dow": 1, "open": "09:00:00", "close": "17:00:00", "closed": False},  # Mon 9–5
    {"dow": 2, "open": None, "close": None, "closed": True},               # Tue closed
    {"dow": 5, "open": "18:00:00", "close": "02:00:00", "closed": False},  # Fri 6pm–2am
]


def test_open_mid_window():
    assert open_at(_HOURS, 1, 12 * 60) is True       # Mon noon


def test_before_open_is_closed():
    assert open_at(_HOURS, 1, 8 * 60) is False        # Mon 8am


def test_after_close_is_closed():
    assert open_at(_HOURS, 1, 18 * 60) is False       # Mon 6pm


def test_flagged_closed_day():
    assert open_at(_HOURS, 2, 12 * 60) is False        # Tue marked closed


def test_missing_day_is_unknown():
    assert open_at(_HOURS, 3, 12 * 60) is None         # Wed: no row → unknown


def test_overnight_span_stays_open_past_midnight():
    assert open_at(_HOURS, 5, 23 * 60) is True          # Fri 11pm, within 6pm–2am
    assert open_at(_HOURS, 5, 19 * 60) is True          # Fri 7pm
    assert open_at(_HOURS, 5, 3 * 60) is False           # Fri 3am, after 2am close


def test_no_hours_is_unknown():
    assert open_at(None, 1, 12 * 60) is None
    assert open_at([], 1, 12 * 60) is None
