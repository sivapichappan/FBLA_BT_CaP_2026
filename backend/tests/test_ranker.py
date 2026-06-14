"""Ranker math tests (§16): smoothing behavior, decay shape, intent re-weighting."""

from __future__ import annotations

from app.services.ranker import (
    DISTANCE_SIGMA_KM,
    bayesian_rating,
    haversine_km,
    rank_businesses,
    sort_results,
)


def test_bayesian_smoothing_demotes_low_sample_outliers():
    """§8.3 acceptance: 4.9★/5 reviews must score BELOW 4.6★/400 reviews."""
    assert bayesian_rating(4.9, 5) < bayesian_rating(4.6, 400)
    # And a zero-review place sits exactly at the prior.
    assert bayesian_rating(0, 0) == 3.7


def test_sort_by_rating_uses_smoothed_not_raw():
    few = {"name": "New 5★", "average_rating": 5.0, "review_count": 2}
    many = {"name": "Proven 4.6★", "average_rating": 4.6, "review_count": 400}
    ranked = sort_results([few, many], "rating")
    assert ranked[0]["name"] == "Proven 4.6★"


def test_haversine_known_distance():
    # Washington Square Park → Times Square ≈ 3.1 km.
    d = haversine_km(40.7308, -73.9973, 40.7580, -73.9855)
    assert 2.8 < d < 3.4


def test_gaussian_decay_is_monotonic():
    import math
    def decay(km: float) -> float:
        return math.exp(-(km**2) / (2 * DISTANCE_SIGMA_KM**2))
    assert decay(0) == 1.0
    assert decay(1) > decay(2) > decay(4) > decay(8)


def _candidates() -> list[dict]:
    return [
        {   # close, cheap, mediocre chain
            "name": "ChainBurger", "distance_km": 0.2, "average_rating": 3.8,
            "review_count": 2000, "price_level": 1, "local_confidence": 0.05,
            "is_open_now": True, "categories": ["Restaurant"],
        },
        {   # slightly farther, pricier, excellent independent
            "name": "Indie Bistro", "distance_km": 0.8, "average_rating": 4.7,
            "review_count": 300, "price_level": 3, "local_confidence": 0.95,
            "is_open_now": False, "categories": ["Restaurant"],
        },
    ]


def test_intent_reweighting_changes_the_winner():
    """The same candidates, different intents → different #1 (§9.3)."""
    cheap = rank_businesses(_candidates(), {"intent": "CHEAP_BUDGET", "price_direction": "cheap"})
    local = rank_businesses(_candidates(), {"intent": "SUPPORT_LOCAL"})
    assert cheap[0]["name"] == "ChainBurger"   # price ×4 → cheap chain wins
    assert local[0]["name"] == "Indie Bistro"  # independence ×4 → indie wins


def test_open_now_intent_prefers_open_places():
    ranked = rank_businesses(_candidates(), {"intent": "OPEN_NOW"})
    assert ranked[0]["name"] == "ChainBurger"  # it's the open one (×5 open weight)


def test_composite_score_attached_and_bounded():
    for b in rank_businesses(_candidates(), {"intent": "EXPLORATORY"}):
        assert 0.0 <= b["composite_score"] <= 1.0
