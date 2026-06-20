"""Anti-abuse checks — pure, no DB. Impossible-travel detection and the
verification-strength scoring."""

import datetime as dt

from app.services import antiabuse

UTC = dt.timezone.utc


def test_teleport_between_cities_is_impossible():
    t0 = dt.datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    t1 = t0 + dt.timedelta(seconds=30)
    # NYC -> LA in 30 seconds.
    assert antiabuse.is_impossible_travel(40.0, -74.0, t0, 34.0, -118.0, t1) is True


def test_a_short_walk_in_an_hour_is_fine():
    t0 = dt.datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    t1 = t0 + dt.timedelta(hours=1)
    assert antiabuse.is_impossible_travel(40.0, -74.0, t0, 40.001, -74.0, t1) is False


def test_same_instant_different_place_is_impossible():
    t0 = dt.datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    assert antiabuse.is_impossible_travel(40.0, -74.0, t0, 41.0, -74.0, t0) is True


def test_strength_increases_up_the_method_ladder():
    geo = antiabuse.compute_strength("GPS_GEOFENCE", 10, False, 0, True)
    dwell = antiabuse.compute_strength("GPS_GEOFENCE_DWELL", 10, False, 0, True)
    qr = antiabuse.compute_strength("QR_GEOFENCE", 10, False, 0, True)
    assert geo < dwell < qr


def test_strength_is_clamped_to_0_100():
    high = antiabuse.compute_strength("QR_GEOFENCE", 5, False, 10, False)   # all bonuses
    low = antiabuse.compute_strength("MANUAL_CODE", 200, True, 0, True)     # all penalties
    assert 0 <= low and high <= 100


def test_mock_and_cold_account_lower_strength():
    clean = antiabuse.compute_strength("GPS_GEOFENCE", 50, False, 5, False)
    flagged = antiabuse.compute_strength("GPS_GEOFENCE", 50, True, 5, False)
    assert flagged < clean
