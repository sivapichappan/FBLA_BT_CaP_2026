"""Geofence math — pure, no DB. Covers the haversine distance and the
inside/outside + accuracy gates that decide a check-in."""

from app.config import settings
from app.services import geofence


def test_haversine_one_degree_of_latitude_is_about_111km():
    d = geofence.haversine_m(40.0, -74.0, 41.0, -74.0)
    assert 110_000 < d < 112_000


def test_zero_distance_for_same_point():
    assert geofence.haversine_m(40.0, -74.0, 40.0, -74.0) == 0.0


def test_point_at_the_center_is_inside():
    ev = geofence.evaluate_checkpoint(40.0, -74.0, 100, 40.0, -74.0, 10)
    assert ev["ok"] and ev["inside"] and ev["distance_m"] < 1


def test_point_far_outside_is_rejected():
    # ~1.1 km north of a 100 m fence.
    ev = geofence.evaluate_checkpoint(40.0, -74.0, 100, 40.01, -74.0, 10)
    assert not ev["ok"] and ev["reason"] == "OUTSIDE_GEOFENCE"


def test_accuracy_too_low_is_rejected_even_when_close():
    ev = geofence.evaluate_checkpoint(40.0, -74.0, 100, 40.0, -74.0, settings.max_gps_accuracy_m + 1)
    assert not ev["ok"] and ev["reason"] == "ACCURACY_TOO_LOW"


def test_grace_band_admits_a_hair_outside_but_not_far():
    # radius 100 + grace 15 = 115 m admitted. 108 m is inside; 130 m is not.
    inside = geofence.evaluate_checkpoint(40.0, -74.0, 100, 40.0 + 108 / 111_000, -74.0, 10)
    outside = geofence.evaluate_checkpoint(40.0, -74.0, 100, 40.0 + 130 / 111_000, -74.0, 10)
    assert inside["inside"] is True
    assert outside["inside"] is False
