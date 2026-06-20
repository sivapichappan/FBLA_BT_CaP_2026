"""Verified-review link validation (§7.4), driven by fakes — no DB.

The invariant: a review may link a visit ONLY if it's VERIFIED, belongs to the
same user, is for the same business, and was verified within the link window.
Under the default strict_review_link=True an invalid link is a 422.
"""

import datetime as dt

import pytest
from fastapi import HTTPException

from app.config import settings
from app.services import reviews_service as rs

UTC = dt.timezone.utc


def _now():
    return dt.datetime.now(UTC)


class FakeReviewsRepo:
    def __init__(self):
        self.linked_visit_id = "unset"

    def user_has_reviewed(self, business_id, user_id):
        return False

    def create(self, business_id, user_id, rating, body, visit_id=None):
        self.linked_visit_id = visit_id
        return {"id": 1, "business_id": business_id, "user_id": user_id, "rating": rating,
                "body": body, "username": "u", "helpful_count": 0,
                "created_at": _now(), "is_verified": visit_id is not None}


class FakeBiz:
    def get_local(self, business_id):
        return {"id": business_id, "name": "X"} if business_id == 1 else None


class FakeVisitsRepo:
    def __init__(self, visit):
        self.visit = visit

    def get(self, visit_id):
        if self.visit and self.visit["id"] == visit_id:
            return dict(self.visit)
        return None


def _visit(**over):
    v = {"id": 50, "user_id": 7, "business_id": 1, "status": "VERIFIED", "verified_at": _now()}
    v.update(over)
    return v


USER = {"id": 7, "username": "u", "role": "user"}


class ReviewData:
    def __init__(self, visit_id=None):
        self.rating = 4
        self.body = "good"
        self.visit_id = visit_id
        self.snapshot = None  # local (digit) ref in these tests → never materialized


@pytest.fixture
def fake_reviews(monkeypatch):
    fr = FakeReviewsRepo()
    monkeypatch.setattr(rs, "reviews_repo", fr)
    monkeypatch.setattr(rs, "biz_repo", FakeBiz())
    return fr


def _wire_visit(monkeypatch, visit):
    monkeypatch.setattr(rs, "visits_repo", FakeVisitsRepo(visit))


def test_valid_link_marks_review_verified(monkeypatch, fake_reviews):
    _wire_visit(monkeypatch, _visit())
    out = rs.create_review(1, USER, ReviewData(visit_id=50))
    assert out["is_verified"] is True
    assert fake_reviews.linked_visit_id == 50


def test_no_visit_id_posts_unverified(monkeypatch, fake_reviews):
    _wire_visit(monkeypatch, None)
    out = rs.create_review(1, USER, ReviewData(visit_id=None))
    assert out["is_verified"] is False
    assert fake_reviews.linked_visit_id is None


def test_someone_elses_visit_is_rejected(monkeypatch, fake_reviews):
    _wire_visit(monkeypatch, _visit(user_id=999))
    with pytest.raises(HTTPException) as e:
        rs.create_review(1, USER, ReviewData(visit_id=50))
    assert e.value.status_code == 422


def test_unverified_visit_is_rejected(monkeypatch, fake_reviews):
    _wire_visit(monkeypatch, _visit(status="PENDING"))
    with pytest.raises(HTTPException):
        rs.create_review(1, USER, ReviewData(visit_id=50))


def test_wrong_business_is_rejected(monkeypatch, fake_reviews):
    _wire_visit(monkeypatch, _visit(business_id=2))
    with pytest.raises(HTTPException):
        rs.create_review(1, USER, ReviewData(visit_id=50))


def test_stale_visit_is_rejected(monkeypatch, fake_reviews):
    old = _now() - dt.timedelta(hours=settings.review_link_window_hours + 1)
    _wire_visit(monkeypatch, _visit(verified_at=old))
    with pytest.raises(HTTPException):
        rs.create_review(1, USER, ReviewData(visit_id=50))


# ── reviewing ANY business: Google businesses are materialized on first write ──
class FakeBizGoogle:
    """A businesses repo where the Google place has no local row yet."""

    def __init__(self):
        self.created: list[tuple[str, dict]] = []

    def get_local(self, business_id):
        return {"id": business_id, "name": "G"}

    def get_by_place_id(self, place_id):
        return None  # not materialized yet

    def create_from_google(self, place_id, snapshot):
        self.created.append((place_id, snapshot))
        return 77


class FakeSnapshot:
    def model_dump(self):
        return {"name": "Joe's Pizza", "lat": 41.0, "lng": -73.0}


def test_google_business_is_materialized_on_first_review(monkeypatch):
    fr = FakeReviewsRepo()
    fb = FakeBizGoogle()
    monkeypatch.setattr(rs, "reviews_repo", fr)
    monkeypatch.setattr(rs, "biz_repo", fb)
    data = ReviewData()
    data.snapshot = FakeSnapshot()
    out = rs.create_review("gp_abc123", USER, data)
    assert fb.created and fb.created[0][0] == "abc123"  # place id (gp_ stripped)
    assert out["business_id"] == 77  # the new materialized row


def test_unmaterialized_google_lists_no_reviews(monkeypatch):
    monkeypatch.setattr(rs, "biz_repo", FakeBizGoogle())
    out = rs.list_reviews("gp_xyz", sort="recent", limit=10, offset=0, verified_only=False)
    assert out == []
