"""Geofence math for Verified Visits — pure functions, no I/O.

Two jobs, both deliberately dependency-free so they unit-test trivially and a
student can defend every line in Q&A (the project's hand-rolled-and-explainable
ethos):

  * ``haversine_m`` — great-circle distance in metres between two lat/lng points.
  * ``evaluate_checkpoint`` — decide whether a single location sample counts as
    "inside" a business's geofence, handling GPS accuracy honestly.

This is the heart of "proof of physical presence": a review only becomes
*verified* once a server-validated checkpoint lands inside the fence.
"""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

from app.config import settings

# Mean Earth radius (metres). The haversine model treats Earth as a sphere —
# accurate to well within a few metres at city scale, which is all a ~100 m
# geofence needs.
EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (the standard haversine formula)."""
    phi1, phi2 = radians(lat1), radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lon2 - lon1)
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))


def evaluate_checkpoint(
    business_lat: float,
    business_lng: float,
    radius_m: float,
    lat: float,
    lng: float,
    accuracy_m: float | None,
) -> dict:
    """Is this location sample inside the business's geofence?

    Returns ``{ok, inside, distance_m, reason}``. Two gates, in order:

      1. **Accuracy gate** — reject a sample whose reported accuracy is worse than
         ``MAX_GPS_ACCURACY_M``. A fix that loose can't prove presence, and an
         absurd accuracy is a classic spoof tell.
      2. **Distance gate** — inside iff ``distance <= radius + ACCURACY_GRACE_M``.
         We add only a *small* grace for ordinary GPS jitter; we deliberately do
         NOT widen the fence by the full reported accuracy, which would let a
         wide-accuracy spoof claim it "might" be inside.

    ``ok`` is the single boolean the caller acts on; ``reason`` is a user-safe
    string when it fails.
    """
    distance = haversine_m(lat, lng, business_lat, business_lng)
    if accuracy_m is not None and accuracy_m > settings.max_gps_accuracy_m:
        return {"ok": False, "inside": False, "distance_m": distance, "reason": "ACCURACY_TOO_LOW"}
    inside = distance <= (radius_m + settings.accuracy_grace_m)
    return {
        "ok": inside,
        "inside": inside,
        "distance_m": distance,
        "reason": None if inside else "OUTSIDE_GEOFENCE",
    }
