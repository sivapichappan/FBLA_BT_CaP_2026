"""A price/budget filter must KEEP price-unknown businesses — most small
independents carry no price data, and hiding them left only the chains that had
explicit prices (the reported budget→2-stops / chains bug)."""

from app.models.business import SearchParams
from app.services.search_service import _passes_filters


def _biz(price_level):
    return {
        "price_level": price_level, "distance_km": 0.5, "source": "local",
        "average_rating": 4.5,
    }


def test_price_filter_keeps_unknown_price():
    p = SearchParams(lat=40.0, lng=-74.0, radius_m=5000, price_levels=[1, 2])
    assert _passes_filters(_biz(None), p, 5000) is True   # unknown price → kept
    assert _passes_filters(_biz(1), p, 5000) is True       # in range → kept
    assert _passes_filters(_biz(4), p, 5000) is False      # known too pricey → out


def test_no_price_filter_keeps_everything():
    p = SearchParams(lat=40.0, lng=-74.0, radius_m=5000)  # no price filter
    assert _passes_filters(_biz(4), p, 5000) is True
    assert _passes_filters(_biz(None), p, 5000) is True
