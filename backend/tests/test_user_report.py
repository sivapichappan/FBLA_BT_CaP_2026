"""User 'My Local Impact' report assembly. The service is pure Python over the
reports repo, so a fake repo drives every case — no database touched (mirrors
test_passport.py)."""

import datetime as dt

import pytest

from app.services import user_report

# Fixed window so the fake can distinguish the CURRENT call (start == S) from the
# service's PREVIOUS-window call (an earlier start) for comparison testing.
S = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
E = dt.datetime(2026, 1, 31, tzinfo=dt.timezone.utc)


class FakeReportsRepo:
    GRANULARITIES = {"day", "week", "month"}

    def user_summary(self, uid, start, end):
        if start == S:  # current window
            return {"verified_visits": 10, "distinct_businesses": 6, "money_local_cents": 12000,
                    "reviews_written": 4, "avg_rating_given": 4.5, "deals_redeemed": 3,
                    "favorites_added": 5}
        return {"verified_visits": 5, "distinct_businesses": 3, "money_local_cents": 8000,  # prior window
                "reviews_written": 2, "avg_rating_given": 4.0, "deals_redeemed": 1,
                "favorites_added": 2}

    def spend_by_category(self, uid, start, end):
        return [{"category": "Coffee", "visits": 5, "spend_cents": 7000},
                {"category": "Restaurant", "visits": 3, "spend_cents": 5000}]

    def spend_by_city(self, uid, start, end):
        return [{"city": "San Antonio", "visits": 7, "spend_cents": 9000},
                {"city": "New York", "visits": 3, "spend_cents": 3000}]

    def visits_trend(self, uid, start, end, trunc):
        return [{"period": dt.date(2026, 1, 5), "visits": 3, "spend_cents": 4000}]

    def reviews_trend(self, uid, start, end, trunc):
        return [{"period": dt.date(2026, 1, 5), "count": 2, "avg_rating": 4.5}]

    def top_businesses(self, uid, start, end, limit=5):
        return [{"business_id": 1, "name": "Caffè Reggio", "visits": 4, "spend_cents": 6000}]

    def trust_counts(self, uid):
        return {"reviews": 4, "verified_visits": 10, "redemptions": 3, "favorites": 5}


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setattr(user_report, "reports_repo", FakeReportsRepo())


def _build(sections, granularity="week"):
    return user_report.build_report(7, S, S, E, set(sections), granularity)


# ── Pure helpers (no repo needed) ────────────────────────────────────────────
def test_previous_window_is_equal_length_and_immediately_before():
    prev_start, prev_end = user_report._previous_window(S, E)
    assert prev_end == S                       # ends exactly where the current window starts
    assert (S - prev_start) == (E - S)         # same length


def test_change_pct_is_none_when_there_is_no_prior_base():
    c = user_report._change(5, 0)
    assert c["abs"] == 5 and c["pct"] is None   # "new", not a misleading +inf/%


def test_change_computes_percentage():
    assert user_report._change(12000, 8000) == {"abs": 4000, "pct": 50.0}


def test_tenure_days_counts_from_account_creation():
    created = dt.datetime(2025, 1, 1, tzinfo=dt.timezone.utc)
    assert user_report._tenure_days(created, E) == (E - created).days


# ── Section selection + comparison ───────────────────────────────────────────
def test_only_requested_sections_are_assembled(fake):
    r = _build({"summary"})
    assert "summary" in r
    for absent in ("spend_by_category", "spend_by_city", "visits_trend",
                   "reviews_trend", "top_businesses", "trust_breakdown"):
        assert absent not in r
    assert r["sections"] == ["summary"]
    assert "narrative" in r  # narrative is always present


def test_summary_includes_period_over_period_comparison(fake):
    r = _build({"summary"})
    s = r["summary"]
    assert s["change"]["money_local_cents"] == {"abs": 4000, "pct": 50.0}   # 12000 vs 8000
    assert s["change"]["verified_visits"] == {"abs": 5, "pct": 100.0}       # 10 vs 5
    assert s["previous"]["money_local_cents"] == 8000
    assert "tenure_days" in s


def test_trust_breakdown_uses_runtime_point_weights(fake):
    r = _build({"trust_breakdown"})
    tb = r["trust_breakdown"]
    # 4*10 + 10*5 + 3*5 + 5*2 = 40 + 50 + 15 + 10 = 115
    assert tb["total"] == 115
    pts = {c["source"]: c["points"] for c in tb["components"]}
    assert pts["Reviews written"] == 40
    assert pts["Verified visits"] == 50
    assert pts["Deals redeemed"] == 15
    assert pts["Favorites saved"] == 10


def test_narrative_is_derived_from_the_numbers(fake):
    r = _build(user_report.ALL_SECTIONS)
    text = " ".join(r["narrative"])
    assert "$120" in text                       # 12000 cents kept local
    assert "10 verified visits" in text
    assert "6 businesses" in text
    assert "up 50%" in text                      # vs prior period
    assert "Coffee" in text                      # top category
    assert "San Antonio" in text                 # led cities


def test_narrative_handles_an_empty_period(monkeypatch, fake):
    monkeypatch.setattr(
        FakeReportsRepo, "user_summary",
        lambda self, uid, start, end: {
            "verified_visits": 0, "distinct_businesses": 0, "money_local_cents": 0,
            "reviews_written": 0, "avg_rating_given": 0.0, "deals_redeemed": 0,
            "favorites_added": 0},
    )
    r = _build({"summary"})
    assert "No verified activity" in " ".join(r["narrative"])


def test_all_sections_present_when_requested(fake):
    r = _build(user_report.ALL_SECTIONS)
    for key in user_report.ALL_SECTIONS:
        assert key in r
    assert r["granularity"] == "week"
