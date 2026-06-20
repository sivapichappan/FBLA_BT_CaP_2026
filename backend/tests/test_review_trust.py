"""Glass-box trust weighting — the per-review weight rules and the adjusted
rating that down-weights unverified reviews. reviews_repo is monkeypatched."""

from app.services import review_trust


def _row(**over):
    base = {
        "id": 1, "rating": 5, "is_verified": False, "helpful_count": 0,
        "verification_strength": None, "user_created_at": None, "created_at": None,
    }
    base.update(over)
    return base


def test_verified_outweighs_unverified():
    v, _ = review_trust._weight(_row(is_verified=True, verification_strength=60))
    u, _ = review_trust._weight(_row(is_verified=False))
    assert v > u


def test_strong_verification_adds_weight():
    strong, _ = review_trust._weight(_row(is_verified=True, verification_strength=90))
    weak, _ = review_trust._weight(_row(is_verified=True, verification_strength=60))
    assert strong > weak


def test_helpful_votes_nudge_weight_up():
    helpful, _ = review_trust._weight(_row(helpful_count=5))
    plain, _ = review_trust._weight(_row(helpful_count=0))
    assert helpful > plain


def test_adjusted_rating_down_weights_unverified_inflation(monkeypatch):
    # one honest verified 3★ vs four anonymous 5★ → adjusted sits below the raw mean.
    rows = [_row(id=1, rating=3, is_verified=True, verification_strength=80)] + [
        _row(id=i, rating=5) for i in range(2, 6)
    ]
    monkeypatch.setattr(review_trust.reviews_repo, "rows_for_trust", lambda bid: rows)
    out = review_trust.trust_weighted_rating(1)
    assert out["raw_rating"] == 4.6
    assert out["adjusted_rating"] < out["raw_rating"]
    assert out["verified_share"] == 0.2


def test_no_reviews_returns_none(monkeypatch):
    monkeypatch.setattr(review_trust.reviews_repo, "rows_for_trust", lambda bid: [])
    assert review_trust.trust_weighted_rating(1)["adjusted_rating"] is None
