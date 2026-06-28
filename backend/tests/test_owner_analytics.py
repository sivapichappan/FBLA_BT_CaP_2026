"""Owner analytics report: the new period-over-period comparison, narrative, and
section assembly. Section functions are monkeypatched so no database is touched
(the SQL itself is exercised against the live DB in manual/integration checks)."""

import datetime as dt

from app.services import analytics

S = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
E = dt.datetime(2026, 1, 31, tzinfo=dt.timezone.utc)


def test_previous_window_is_equal_length_and_immediately_before():
    prev_start, prev_end = analytics._previous_window(S, E)
    assert prev_end == S
    assert (S - prev_start) == (E - S)


def test_change_pct_is_none_with_no_prior_base():
    assert analytics._change(5, 0)["pct"] is None


def test_change_computes_percentage():
    assert analytics._change(150, 100) == {"abs": 50, "pct": 50.0}


def test_narrative_reads_summary_and_busiest_bucket():
    report = {
        "summary": {
            "views": 100, "favorites": 10, "deal_redemptions": 5, "review_count": 4,
            "average_rating": 4.5, "local_spend_cents": 12000,
            "previous": {"views": 80}, "change": {"views": {"abs": 20, "pct": 25.0}},
        },
        "views_trend": [
            {"day": dt.date(2026, 1, 5), "count": 40},
            {"day": dt.date(2026, 1, 6), "count": 10},
        ],
    }
    text = " ".join(analytics._narrative(report))
    assert "100 views" in text
    assert "up 25%" in text
    assert "4.5★" in text
    assert "$120" in text                       # local spend
    assert "2026-01-05" in text                 # busiest bucket


def test_build_report_attaches_comparison_to_summary(monkeypatch):
    def fake_summary(bid, start, end):
        if start == S:  # current window
            return {"average_rating": 4.5, "review_count": 4, "favorites": 10,
                    "deal_redemptions": 5, "views": 100, "local_spend_cents": 12000}
        return {"average_rating": 4.0, "review_count": 2, "favorites": 6,       # prior
                "deal_redemptions": 2, "views": 80, "local_spend_cents": 8000}

    monkeypatch.setattr(analytics, "_summary", fake_summary)
    r = analytics.build_report(1, S, E, {"summary"})
    assert r["summary"]["change"]["views"] == {"abs": 20, "pct": 25.0}
    assert r["summary"]["change"]["local_spend_cents"] == {"abs": 4000, "pct": 50.0}
    assert r["summary"]["previous"]["views"] == 80
    assert "narrative" in r
    assert r["granularity"] == "day"


def test_narrative_pluralizes_singular_counts():
    report = {
        "summary": {
            "views": 1, "favorites": 0, "deal_redemptions": 1, "review_count": 1,
            "average_rating": 5.0, "local_spend_cents": 0, "previous": {"views": 0},
            "change": {},
        },
    }
    text = " ".join(analytics._narrative(report))
    assert "1 view," in text                     # not "1 views,"
    assert "1 deal redemption." in text          # not "1 deal redemptions."
    assert "across 1 review." in text            # not "1 reviews."


def test_avg_rating_comparison_dropped_when_no_prior_reviews(monkeypatch):
    def fake_summary(bid, start, end):
        if start == S:
            return {"average_rating": 4.5, "review_count": 3, "favorites": 1,
                    "deal_redemptions": 0, "views": 10, "local_spend_cents": 100}
        return {"average_rating": 0, "review_count": 0, "favorites": 0,
                "deal_redemptions": 0, "views": 0, "local_spend_cents": 0}

    monkeypatch.setattr(analytics, "_summary", fake_summary)
    r = analytics.build_report(1, S, E, {"summary"})
    assert "average_rating" not in r["summary"]["change"]  # no baseline → no badge
    assert "views" in r["summary"]["change"]               # counts still compared


def test_build_report_assembles_only_requested_metrics(monkeypatch):
    monkeypatch.setattr(analytics, "_summary", lambda bid, s, e: {
        "average_rating": 0, "review_count": 0, "favorites": 0,
        "deal_redemptions": 0, "views": 0, "local_spend_cents": 0})
    r = analytics.build_report(1, S, E, {"summary"}, granularity="month")
    for absent in ("rating_distribution", "reviews_trend", "deals", "funnel",
                   "redemptions_trend", "views_trend"):
        assert absent not in r
    assert r["granularity"] == "month"
