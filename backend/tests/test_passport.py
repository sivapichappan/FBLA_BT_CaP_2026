"""Passport badges + streak. The streak is pure; build() is driven by a fake
visits repo so no DB is touched."""

import datetime as dt

import pytest

from app.services import passport


def test_streak_counts_the_longest_consecutive_run():
    d = dt.date(2026, 6, 1)
    dates = [d, d + dt.timedelta(days=1), d + dt.timedelta(days=2), d + dt.timedelta(days=5)]
    assert passport._longest_streak(dates) == 3


def test_streak_handles_empty_and_single():
    assert passport._longest_streak([]) == 0
    assert passport._longest_streak([dt.date(2026, 6, 1)]) == 1


class FakeVisitsRepo:
    def passport_stats(self, uid):
        return {"total_verified": 6, "distinct_businesses": 4, "total_spend_cents": 4200}

    def category_visit_counts(self, uid):
        return [{"category": "Coffee", "n": 3}]

    def verified_visit_dates(self, uid):
        d = dt.date(2026, 6, 1)
        return [d, d + dt.timedelta(days=1), d + dt.timedelta(days=2)]

    def list_for_user(self, uid):
        return [{"status": "VERIFIED", "business_name": "X", "id": 1}]


@pytest.fixture
def fake_repo(monkeypatch):
    monkeypatch.setattr(passport, "visits_repo", FakeVisitsRepo())


def _badge(p, key):
    return next(b for b in p["badges"] if b["key"] == key)


def test_build_reports_counters_and_impact(fake_repo):
    p = passport.build(7)
    assert p["total_verified"] == 6
    assert p["money_local_cents"] == 4200
    assert p["streak_days"] == 3


def test_build_marks_earned_and_unearned_badges(fake_repo):
    p = passport.build(7)
    assert _badge(p, "first")["earned"] is True          # 6 >= 1
    assert _badge(p, "legend")["earned"] is False         # 6 < 15
    assert _badge(p, "cat_coffee")["earned"] is True      # 3 >= 3
    assert _badge(p, "streak")["earned"] is True          # 3-day streak
