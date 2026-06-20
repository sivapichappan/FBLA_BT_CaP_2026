"""Visit state-machine tests (the §18 acceptance matrix), driven by a fake
in-memory repo so no database is touched — same offline style as the other
service tests. Exercises: verify, outside-fence FAILED, low-accuracy FAILED,
dwell two-checkpoint VERIFIED, impossible-travel REJECTED, rate-limit REJECTED,
idempotent initiate, and expiry.
"""

import datetime as dt

import pytest

from app.config import settings
from app.services import visits_service as svc

UTC = dt.timezone.utc


def _now():
    return dt.datetime.now(UTC)


class FakeBiz:
    """Stand-in for the businesses repo: one business at (40, -74), 100 m fence."""

    def get_local(self, business_id):
        if business_id != 1:
            return None
        return {"id": 1, "name": "Test Cafe", "lat": 40.0, "lng": -74.0, "geofence_radius_m": 100}


class FakeVisits:
    """In-memory stand-in for the visits repo."""

    def __init__(self):
        self.visits = {}
        self._id = 0
        self.checkpoints = []
        self.verified_recent = 0   # what count_verified_recent returns
        self.prior_verified = 0
        self.last_cp = None        # what last_accepted_checkpoint returns

    def create(self, user_id, business_id, method, expires_at):
        self._id += 1
        v = {
            "id": self._id, "user_id": user_id, "business_id": business_id,
            "method": method, "status": "PENDING", "latitude": None, "longitude": None,
            "gps_accuracy_m": None, "distance_m": None, "mock_location_flag": False,
            "initiated_at": _now(), "first_checkpoint_at": None, "verified_at": None,
            "expires_at": expires_at, "verification_strength": None, "spend_cents": None,
            "rejection_reason": None,
        }
        self.visits[self._id] = v
        return dict(v)

    def get(self, visit_id):
        v = self.visits.get(visit_id)
        return dict(v) if v else None

    def get_active(self, user_id, business_id):
        for v in self.visits.values():
            if (v["user_id"] == user_id and v["business_id"] == business_id
                    and v["status"] in ("PENDING", "AWAITING_DWELL")
                    and v["expires_at"] > _now()):
                return dict(v)
        return None

    def record_checkpoint(self, *args, **kwargs):
        self.checkpoints.append((args, kwargs))

    def last_accepted_checkpoint(self, user_id):
        return self.last_cp

    def count_verified_recent(self, user_id, business_id, within_hours=24):
        return self.verified_recent

    def prior_verified_count(self, user_id):
        return self.prior_verified

    def update_visit(self, visit_id, **fields):
        self.visits[visit_id].update(fields)
        return dict(self.visits[visit_id])

    def finalize_verified(self, visit_id, user_id, **k):
        v = self.visits[visit_id]
        v.update(status="VERIFIED", verified_at=_now(), latitude=k["lat"], longitude=k["lng"],
                 gps_accuracy_m=k["accuracy_m"], distance_m=k["distance_m"],
                 mock_location_flag=k["mock"], verification_strength=k["strength"],
                 spend_cents=k["spend_cents"])
        return dict(v)


class Data:
    """Stand-in for CheckpointIn (only the attributes the service reads)."""

    def __init__(self, lat, lng, accuracy_m=10.0, mock=False, spend=None):
        self.latitude = lat
        self.longitude = lng
        self.accuracy_m = accuracy_m
        self.mock_location = mock
        self.client_ts = None
        self.spend_cents = spend


USER = {"id": 7}


@pytest.fixture
def repo(monkeypatch):
    fv = FakeVisits()
    monkeypatch.setattr(svc, "visits_repo", fv)
    monkeypatch.setattr(svc, "biz_repo", FakeBiz())
    return fv


def test_inside_geofence_verifies_without_dwell(repo):
    out = svc.initiate(USER, 1, "GPS_GEOFENCE")
    res = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    assert res["status"] == "VERIFIED"
    assert res["verification_strength"] is not None


def test_outside_geofence_fails(repo):
    out = svc.initiate(USER, 1, "GPS_GEOFENCE")
    res = svc.submit_checkpoint(USER, out["visit_id"], Data(40.05, -74.0))  # ~5.5 km away
    assert res["status"] == "FAILED"
    assert res["reason"] == "OUTSIDE_GEOFENCE"


def test_low_accuracy_fails(repo):
    out = svc.initiate(USER, 1, "GPS_GEOFENCE")
    res = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0, accuracy_m=500))
    assert res["status"] == "FAILED"
    assert res["reason"] == "ACCURACY_TOO_LOW"


def test_dwell_needs_two_checkpoints(repo):
    out = svc.initiate(USER, 1, "GPS_GEOFENCE_DWELL")
    r1 = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    assert r1["status"] == "AWAITING_DWELL" and r1["needs_another_checkpoint"]
    # Rewind the dwell clock past the window, then submit the second checkpoint.
    repo.visits[out["visit_id"]]["first_checkpoint_at"] = _now() - dt.timedelta(minutes=settings.dwell_minutes + 1)
    r2 = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    assert r2["status"] == "VERIFIED"


def test_dwell_too_soon_stays_awaiting(repo):
    out = svc.initiate(USER, 1, "GPS_GEOFENCE_DWELL")
    svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    r2 = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))  # immediately
    assert r2["status"] == "AWAITING_DWELL" and r2["needs_another_checkpoint"]


def test_impossible_travel_is_rejected_generically(repo):
    repo.last_cp = {"latitude": 0.0, "longitude": 0.0, "server_ts": _now()}  # equator, moments ago
    out = svc.initiate(USER, 1, "GPS_GEOFENCE")
    res = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    assert res["status"] == "REJECTED" and res["reason"] == "REJECTED"


def test_daily_cap_rejects(repo):
    repo.verified_recent = settings.max_verified_visits_per_business_per_day
    out = svc.initiate(USER, 1, "GPS_GEOFENCE")
    res = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    assert res["status"] == "REJECTED"


def test_initiate_is_idempotent(repo):
    a = svc.initiate(USER, 1, "GPS_GEOFENCE")
    b = svc.initiate(USER, 1, "GPS_GEOFENCE")
    assert a["visit_id"] == b["visit_id"]


def test_expired_visit_cannot_checkpoint(repo):
    out = svc.initiate(USER, 1, "GPS_GEOFENCE")
    repo.visits[out["visit_id"]]["expires_at"] = _now() - dt.timedelta(minutes=1)
    res = svc.submit_checkpoint(USER, out["visit_id"], Data(40.0, -74.0))
    assert res["status"] == "EXPIRED"
