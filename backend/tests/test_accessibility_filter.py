"""The wheelchair-accessible filter mirrors the price filter's "keep unknowns"
rule: it hides ONLY businesses whose entrance is KNOWN-inaccessible (False);
`entrance` True (accessible) and None (not reported) are both kept — most small
independents have no Google accessibility data, and hiding unknowns would imply
"no data = inaccessible" and surface only the chains that report it.

Also pins the Google `accessibilityOptions` → canonical {entrance,parking,
restroom,seating} mapping (a missing flag stays None, never False)."""

import pytest
from pydantic import ValidationError

from app.models.business import Accessibility, BusinessIn, SearchParams
from app.services import places
from app.services.search_service import _passes_filters


def _biz(accessibility):
    return {
        "accessibility": accessibility, "distance_km": 0.5, "source": "local",
        "average_rating": 4.5,
    }


def test_filter_hides_only_known_inaccessible():
    p = SearchParams(lat=40.0, lng=-74.0, radius_m=5000, wheelchair_accessible=True)
    assert _passes_filters(_biz({"entrance": True}), p, 5000) is True    # accessible → kept
    assert _passes_filters(_biz({"entrance": None}), p, 5000) is True    # unknown    → kept
    assert _passes_filters(_biz(None), p, 5000) is True                  # no data    → kept
    assert _passes_filters(_biz({"entrance": False}), p, 5000) is False  # known-no   → hidden


def test_no_filter_keeps_everything():
    p = SearchParams(lat=40.0, lng=-74.0, radius_m=5000)  # filter off
    assert _passes_filters(_biz({"entrance": False}), p, 5000) is True
    assert _passes_filters(_biz(None), p, 5000) is True


def test_format_place_maps_accessibility_options():
    p = places.format_place({
        "id": "x", "displayName": {"text": "X"},
        "location": {"latitude": 40.0, "longitude": -74.0},
        "accessibilityOptions": {
            "wheelchairAccessibleEntrance": True,
            "wheelchairAccessibleParking": False,
        },
    })
    # present → mapped; absent flags → None (never False)
    assert p["accessibility"] == {
        "entrance": True, "parking": False, "restroom": None, "seating": None}


def test_format_place_accessibility_absent_is_all_none():
    p = places.format_place({
        "id": "x", "displayName": {"text": "X"},
        "location": {"latitude": 40.0, "longitude": -74.0},
    })
    assert p["accessibility"] == {
        "entrance": None, "parking": None, "restroom": None, "seating": None}


def test_owner_accessibility_model_rejects_unknown_keys():
    """The owner self-report payload validates: the 4 facets are accepted; an
    unknown key is a clean 422 (extra='forbid')."""
    Accessibility(entrance=True, parking=False, restroom=None, seating=True)
    with pytest.raises(ValidationError):
        Accessibility(ramp=True)  # not a facet → rejected


def test_business_in_accepts_accessibility():
    b = BusinessIn(name="Cafe X", address="123 Main St", lat=40.0, lng=-74.0,
                   accessibility={"entrance": True})
    assert b.accessibility.entrance is True
    assert b.accessibility.parking is None  # unset facet → not reported
