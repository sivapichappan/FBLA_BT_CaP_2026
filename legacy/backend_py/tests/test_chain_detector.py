"""
Tests for ``app.utils.chain_detector``.

Two layers:
- TestSignals — each individual signal function on hand-crafted inputs.
- TestEndToEnd — realistic fixtures for known chains, *unknown* chains
  (the hard test — must be caught by composite signals because they're
  not in the brand list), and true locals (must NOT be flagged).

Run with: pytest backend_py/tests/test_chain_detector.py -v
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

# Add backend_py to sys.path so `from app.…` imports resolve when pytest is
# invoked from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.utils.chain_detector import (  # noqa: E402
    detect_chain,
    _signal_known_brand,
    _signal_website,
    _signal_phone,
    _signal_name_pattern,
    _signal_personal_name,
    _signal_editorial_summary,
    _signal_type_prior,
    _signal_review_volume,
    _signal_rating_distribution,
    _signal_city_in_name,
)


# ─── Per-signal tests ────────────────────────────────────────────────────────

class TestSignals:
    # known_brand
    def test_known_brand_hits(self):
        s = _signal_known_brand("Starbucks")
        assert s is not None and s.score == 1.0 and s.weight == 1.0

    def test_known_brand_misses_local(self):
        assert _signal_known_brand("Sarah's Bakery") is None

    def test_known_brand_handles_normalization(self):
        # match_chain normalises trademarks, store numbers, suffixes
        s = _signal_known_brand("Starbucks #4271 - Downtown")
        assert s is not None and s.score == 1.0

    # website
    def test_website_locator_subdomain(self):
        s = _signal_website("Burger King", "https://locations.burgerking.com")
        assert s is not None and s.score >= 0.7

    def test_website_local_business_with_own_domain_does_not_fire(self):
        # Critical: every local business with its own domain (e.g.
        # "bellavitanj.com" for Bella Vita Ristorante) was being flagged
        # by the old "domain mirrors brand" logic. The new code must NOT
        # fire on these — it would trigger a false-positive cascade.
        for name, url in [
            ("Bella Vita Ristorante", "https://bellavitanj.com"),
            ("Heavenly Hair Salon", "https://heavenlyhairsalon.com"),
            ("Smile Dental Care", "https://smiledentalnj.com"),
            ("Hot Topic", "https://hottopic.com"),  # name in domain
            ("Maplewood Cafe", "https://maplewoodcafe-cambridge.com"),
        ]:
            assert _signal_website(name, url) is None, (
                f"website signal should NOT fire for {name} on {url} — "
                "this is normal small-business behaviour"
            )

    def test_website_unrelated_domain(self):
        # yum.com hosts Taco Bell — corporate parent. Weak signal.
        s = _signal_website("Taco Bell", "https://yum.com")
        assert s is not None and s.score > 0
        assert s.weight <= 0.4, "unrelated-domain signal should be low-weight"

    def test_website_none_when_missing(self):
        assert _signal_website("Whatever", None) is None
        assert _signal_website("Whatever", "") is None

    # phone
    def test_phone_toll_free_800(self):
        assert _signal_phone("+1 800 555 1212").score == 0.8

    def test_phone_toll_free_888(self):
        assert _signal_phone("(888) 555-9999").score == 0.8

    def test_phone_normal_area_code(self):
        assert _signal_phone("+1 617 555 1234") is None

    def test_phone_missing(self):
        assert _signal_phone(None) is None

    # name_pattern
    def test_name_pattern_store_number(self):
        s = _signal_name_pattern("Walgreens #4271")
        assert s is not None and s.score > 0.5

    def test_name_pattern_trademark(self):
        s = _signal_name_pattern("Coffee Bean ®")
        assert s is not None and s.score > 0.3

    def test_name_pattern_acronym(self):
        s = _signal_name_pattern("AAA")
        assert s is not None and s.score > 0.3

    def test_name_pattern_location_suffix(self):
        s = _signal_name_pattern("Hertz - Airport")
        assert s is not None and s.score > 0.4

    def test_name_pattern_clean_name(self):
        assert _signal_name_pattern("Maplewood Cafe") is None

    # personal_name
    def test_personal_name_possessive(self):
        s = _signal_personal_name("Sarah's Bakery")
        assert s is not None and s.score < 0  # local lean

    def test_personal_name_the_x_y_z(self):
        s = _signal_personal_name("The Painted Door Gallery")
        assert s is not None and s.score < 0

    def test_personal_name_long_possessive_skipped(self):
        # Too many words → not a personal name pattern
        assert _signal_personal_name("Sarah's Big Beautiful Family Restaurant") is None

    # editorial_summary
    def test_editorial_chain_language(self):
        s = _signal_editorial_summary("This nationwide chain serves fast food across 5,000 locations.")
        assert s is not None and s.score > 0  # chain

    def test_editorial_local_language(self):
        s = _signal_editorial_summary("Family-owned bakery serving the neighborhood since 1972.")
        assert s is not None and s.score < 0  # local

    def test_editorial_neutral(self):
        assert _signal_editorial_summary("A coffee shop in town.") is None

    def test_editorial_missing(self):
        assert _signal_editorial_summary(None) is None

    # type_prior
    def test_type_prior_chain_heavy(self):
        assert _signal_type_prior("gas_station").score > 0.5

    def test_type_prior_local_heavy(self):
        assert _signal_type_prior("art_gallery").score < -0.5

    def test_type_prior_chain_lean(self):
        s = _signal_type_prior("coffee_shop")
        assert s is not None and 0 < s.score < 0.5

    def test_type_prior_local_lean(self):
        s = _signal_type_prior("bakery")
        assert s is not None and -0.5 < s.score < 0

    def test_type_prior_unknown(self):
        # Unknown type → no signal
        assert _signal_type_prior("imaginary_type_42") is None
        assert _signal_type_prior(None) is None

    # review_volume
    def test_review_volume_huge_chain_signal(self):
        # 5000 reviews on a coffee_shop (baseline 600) → 8x = chain
        s = _signal_review_volume(5000, "coffee_shop")
        assert s is not None and s.score > 0.5

    def test_review_volume_tiny_local_signal(self):
        s = _signal_review_volume(20, "restaurant")  # 20/400 = 0.05 ≪ 0.1
        assert s is not None and s.score < 0

    def test_review_volume_normal_range(self):
        # Neutral band for "restaurant" (baseline 400) is 160 ≤ count < 800.
        assert _signal_review_volume(300, "restaurant") is None
        assert _signal_review_volume(600, "restaurant") is None

    def test_review_volume_missing(self):
        assert _signal_review_volume(None, "cafe") is None
        assert _signal_review_volume(0, "cafe") is None

    # rating_distribution
    def test_rating_distribution_chain_pattern(self):
        s = _signal_rating_distribution(3.8, 800)
        assert s is not None and s.score > 0

    def test_rating_distribution_local_pattern(self):
        s = _signal_rating_distribution(4.7, 80)
        assert s is not None and s.score < 0

    def test_rating_distribution_too_few_reviews(self):
        assert _signal_rating_distribution(4.8, 5) is None

    def test_rating_distribution_neutral(self):
        # Mid range, mid count → no signal
        assert _signal_rating_distribution(4.2, 200) is None

    # city_in_name
    def test_city_in_name_hit_via_address(self):
        s = _signal_city_in_name("Cambridge Bicycle", "100 Mass Ave, Cambridge, MA")
        assert s is not None and s.score < 0

    def test_city_in_name_hit_via_city_field(self):
        s = _signal_city_in_name("Brooklyn Roasting Company", None, city="Brooklyn")
        assert s is not None and s.score < 0

    def test_city_in_name_no_match(self):
        assert _signal_city_in_name("Pizza Place", "1 Main St, Boston, MA") is None


# ─── End-to-end fixtures ─────────────────────────────────────────────────────

# Realistic business dicts shaped like google_places.format_place output.

KNOWN_CHAINS = [
    {
        "name": "Starbucks",
        "primary_type": "coffee_shop",
        "address_line_1": "123 Main St, Cambridge, MA 02139",
        "city": "Cambridge",
        "average_rating": 3.9,
        "review_count": 1200,
        "business_status": "OPERATIONAL",
        "website": "https://www.starbucks.com/store-locator/store/12345",
        "phone": "+1 800 782 7282",
    },
    {
        "name": "Subway",
        "primary_type": "sandwich_shop",
        "address_line_1": "456 Oak Ave, Boston, MA",
        "average_rating": 3.5,
        "review_count": 800,
        "website": "https://restaurants.subway.com/united-states/ma/boston",
        "phone": "+1 800 888 4848",
    },
    {
        "name": "CVS Pharmacy",
        "primary_type": "pharmacy",
        "address_line_1": "789 Beacon St, Brookline, MA",
        "average_rating": 3.2,
        "review_count": 400,
        "website": "https://www.cvs.com/store-locator/cvs-pharmacy-address/...",
    },
    {
        "name": "Bank of America",
        "primary_type": "bank",
        "address_line_1": "1 Federal St, Boston, MA",
        "average_rating": 3.0,
        "review_count": 250,
    },
]

# Chains that are NOT in the brand list — must be caught by composite signals.
UNKNOWN_CHAINS = [
    {
        "name": "Quick Lube Express - Airport",
        "primary_type": "car_repair",
        "address_line_1": "Logan Airport, Boston, MA",
        "average_rating": 3.7,
        "review_count": 450,
        "website": "https://locations.quicklube.com/boston-airport",
        "phone": "+1 877 555 0100",
    },
    {
        "name": "ABC Insurance Agency #312",
        "primary_type": "insurance_agency",
        "address_line_1": "200 State St, Suite 800, Boston, MA",
        "average_rating": 3.4,
        "review_count": 600,
        "website": "https://abcinsurance.com",
    },
    {
        # Realistic chain-shaped: trademark, location suffix, multi-location
        # locator URL, high review count for a small-footprint type.
        "name": "Premier Mattress Outlet ® - Saugus",
        "primary_type": "mattress_store",
        "address_line_1": "Patriot Plaza Mall, Saugus, MA",
        "average_rating": 3.6,
        "review_count": 320,
        "website": "https://locations.premiermattress.com/saugus",
    },
]

TRUE_LOCALS = [
    {
        "name": "Sarah's Bakery",
        "primary_type": "bakery",
        "address_line_1": "12 Brattle St, Cambridge, MA",
        "city": "Cambridge",
        "average_rating": 4.7,
        "review_count": 84,
        "editorial_summary": "Family-owned neighborhood bakery serving fresh bread since 2008.",
    },
    {
        "name": "Maplewood Café",
        "primary_type": "cafe",
        "address_line_1": "55 Mass Ave, Cambridge, MA",
        "average_rating": 4.6,
        "review_count": 210,
    },
    {
        "name": "The Painted Door Gallery",
        "primary_type": "art_gallery",
        "address_line_1": "78 Newbury St, Boston, MA",
        "average_rating": 4.8,
        "review_count": 42,
        "editorial_summary": "Independent gallery showcasing local artists.",
    },
    {
        "name": "Cambridge Bicycle",
        "primary_type": "bicycle_store",
        "address_line_1": "259 Mass Ave, Cambridge, MA",
        "city": "Cambridge",
        "average_rating": 4.5,
        "review_count": 320,
    },
]


class TestEndToEnd:
    @pytest.mark.parametrize("biz", KNOWN_CHAINS)
    def test_known_chains_flagged(self, biz):
        result = detect_chain(biz)
        assert result["is_chain"] is True, (
            f"{biz['name']} should be flagged as chain "
            f"(prob={result['chain_probability']}, signals={result['signals']})"
        )
        assert result["chain_probability"] >= 0.55

    @pytest.mark.parametrize("biz", UNKNOWN_CHAINS)
    def test_unknown_chains_flagged(self, biz):
        result = detect_chain(biz)
        assert result["is_chain"] is True, (
            f"{biz['name']} (not in brand list) should be flagged as chain "
            f"via composite signals (prob={result['chain_probability']}, "
            f"signals={[s['name'] for s in result['signals']]})"
        )

    @pytest.mark.parametrize("biz", TRUE_LOCALS)
    def test_true_locals_pass(self, biz):
        result = detect_chain(biz)
        assert result["is_chain"] is False, (
            f"{biz['name']} should NOT be flagged as chain "
            f"(prob={result['chain_probability']}, "
            f"primary_reason={result.get('primary_reason')})"
        )

    def test_output_shape(self):
        result = detect_chain(TRUE_LOCALS[0])
        assert set(result.keys()) == {
            "chain_probability", "is_chain", "confidence",
            "primary_reason", "signals",
        }
        assert isinstance(result["signals"], list)
        for sig in result["signals"]:
            assert set(sig.keys()) == {"name", "score", "weight", "reason"}

    def test_empty_business(self):
        # Robustness: detector shouldn't crash on a near-empty dict
        result = detect_chain({"name": ""})
        assert "chain_probability" in result
        assert result["confidence"] == 0.0
