"""Verified-Visit lifecycle logic — the state machine that turns location
checkpoints into a VERIFIED (or FAILED / REJECTED / EXPIRED) visit.

Layering: this service owns the decisions; ``visits_repo`` owns the SQL,
``geofence``/``antiabuse`` own the pure math, ``events`` decouples the §17
reactions. The flow mirrors the spec's submit-checkpoint routine:

    anti-abuse gates (→ REJECTED)  →  geofence eval (→ FAILED)  →
    dwell handling  →  finalize (→ VERIFIED).

REJECTED returns a deliberately generic message; the real rule is stored on the
visit for our own audit, never sent to the client (don't teach evasion).
"""

from __future__ import annotations

import datetime as dt
import logging

from fastapi import HTTPException, status

from app.config import settings
from app.models.business import BusinessSnapshot
from app.models.visit import CheckpointIn, QrSubmitIn
from app.repositories import businesses as biz_repo
from app.repositories import visits as visits_repo
from app.services import antiabuse, events, geofence, qr

log = logging.getLogger("locallens")


def _now() -> dt.datetime:
    """Single source of 'now' (timezone-aware, UTC) — the authoritative clock."""
    return dt.datetime.now(dt.timezone.utc)


def _resolve_business_id(ref, snapshot: dict | None) -> int:
    """Map a business ref → a local businesses.id, materializing a Google
    business (``gp_<placeid>``) on first check-in so you can verify a visit
    anywhere, not just at the seeded businesses."""
    ref = str(ref)
    if ref.isdigit():
        if not biz_repo.get_local(int(ref)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
        return int(ref)
    if ref.startswith("gp_"):
        place_id = ref[3:]
        existing = biz_repo.get_by_place_id(place_id)
        if existing:
            return existing["id"]
        if not snapshot:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "We need this business's details to record your visit.")
        return biz_repo.create_from_google(place_id, snapshot)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")


# ─────────────────────────────── public API ─────────────────────────────────
def initiate(
    user: dict, business_ref, method: str, snapshot: BusinessSnapshot | None = None
) -> dict:
    """Begin a check-in (at any business — Google ones are materialized on
    first check-in). Idempotent: an existing active visit is returned rather
    than spawning a duplicate."""
    snap = snapshot.model_dump() if snapshot else None
    business_id = _resolve_business_id(business_ref, snap)
    business = biz_repo.get_local(business_id)
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")

    active = visits_repo.get_active(user["id"], business_id)
    if active:
        return _to_out(active, business)

    expires = _now() + dt.timedelta(minutes=settings.visit_initiate_ttl_minutes)
    visit = visits_repo.create(user["id"], business_id, method, expires)
    return _to_out(visit, business)


def submit_checkpoint(user: dict, visit_id: int, data: CheckpointIn) -> dict:
    """Drive the state machine with one location sample."""
    visit = visits_repo.get(visit_id)
    if not visit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check-in not found.")
    if visit["user_id"] != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This check-in isn't yours.")
    if visit["status"] not in ("PENDING", "AWAITING_DWELL"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This check-in is already finished.")

    now = _now()
    if now > visit["expires_at"]:
        visit = visits_repo.update_visit(visit_id, status="EXPIRED")
        return _to_out(visit, None, reason="EXPIRED",
                       message="This check-in window closed. Start a new one.")

    business = biz_repo.get_local(visit["business_id"])
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")

    # ── anti-abuse gates → REJECTED (generic message; real reason logged) ──
    last = visits_repo.last_accepted_checkpoint(user["id"])
    if last and antiabuse.is_impossible_travel(
        last["latitude"], last["longitude"], last["server_ts"],
        data.latitude, data.longitude, now,
    ):
        return _reject(visit_id, business, "IMPOSSIBLE_TRAVEL")
    if settings.strict_mock and data.mock_location:
        return _reject(visit_id, business, "MOCK_LOCATION")
    if visits_repo.count_verified_recent(user["id"], visit["business_id"]) >= \
            settings.max_verified_visits_per_business_per_day:
        return _reject(visit_id, business, "RATE_LIMIT")

    # ── geofence evaluation → FAILED if outside or too imprecise ──
    radius = business.get("geofence_radius_m") or settings.geofence_radius_default_m
    ev = geofence.evaluate_checkpoint(
        business["lat"], business["lng"], radius,
        data.latitude, data.longitude, data.accuracy_m,
    )
    visits_repo.record_checkpoint(
        visit_id, data.latitude, data.longitude, data.accuracy_m,
        ev["distance_m"], ev["inside"], data.mock_location, data.client_ts,
    )
    if not ev["ok"]:
        visit = visits_repo.update_visit(
            visit_id, status="FAILED",
            latitude=data.latitude, longitude=data.longitude,
            gps_accuracy_m=data.accuracy_m, distance_m=ev["distance_m"],
            mock_location_flag=data.mock_location, rejection_reason=ev["reason"],
        )
        if ev["reason"] == "ACCURACY_TOO_LOW":
            msg = "We couldn't pin your location precisely enough — try again with a clear view of the sky."
        else:
            msg = (f"You're about {round(ev['distance_m'])} m away — get a little closer "
                   f"to {business['name']} to verify your visit.")
        return _to_out(visit, business, reason=ev["reason"], message=msg)

    # ── inside the fence: dwell handling, then finalize ──
    if visit["method"] == "GPS_GEOFENCE_DWELL":
        if visit["status"] == "PENDING":
            # First valid checkpoint — start the dwell clock and ask for a second.
            visit = visits_repo.update_visit(
                visit_id, status="AWAITING_DWELL", first_checkpoint_at=now,
                latitude=data.latitude, longitude=data.longitude,
                gps_accuracy_m=data.accuracy_m, distance_m=ev["distance_m"],
                mock_location_flag=data.mock_location,
            )
            return _to_out(
                visit, business, needs_another=True,
                message=f"You're here. Stay put — we'll confirm your visit in about "
                        f"{settings.dwell_minutes} min.",
            )
        elapsed_min = (now - visit["first_checkpoint_at"]).total_seconds() / 60.0
        if elapsed_min < settings.dwell_minutes:
            remaining = max(1, round(settings.dwell_minutes - elapsed_min))
            return _to_out(
                visit, business, needs_another=True,
                message=f"Almost there — about {remaining} more min and your visit is confirmed.",
            )
        # Stayed long enough → fall through to finalize.

    return _finalize(visit, business, data, ev["distance_m"])


def get_visit(user: dict, visit_id: int) -> dict:
    """Poll a visit (clients poll while a dwell window elapses). Lazily expires a
    stale PENDING/AWAITING_DWELL visit on read."""
    visit = visits_repo.get(visit_id)
    if not visit or visit["user_id"] != user["id"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check-in not found.")
    if visit["status"] in ("PENDING", "AWAITING_DWELL") and _now() > visit["expires_at"]:
        visit = visits_repo.update_visit(visit_id, status="EXPIRED")
    business = biz_repo.get_local(visit["business_id"])
    return _to_out(visit, business)


def list_my_visits(user: dict) -> list[dict]:
    """The signed-in user's visits, newest first (history / passport seed)."""
    return visits_repo.list_for_user(user["id"])


def set_spend(user: dict, visit_id: int, spend_cents: int) -> dict:
    """Record an optional self-reported spend on the user's verified visit."""
    if not visits_repo.set_spend(visit_id, user["id"], spend_cents):
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Verified check-in not found.")
    return {"ok": True}


def submit_qr(user: dict, visit_id: int, data: QrSubmitIn) -> dict:
    """Verify a visit with the counter code (QR_GEOFENCE). The code alone is never
    enough — an in-geofence checkpoint is still required (so a code texted to a
    remote friend fails), and the code is single-use within its time window."""
    visit = visits_repo.get(visit_id)
    if not visit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check-in not found.")
    if visit["user_id"] != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This check-in isn't yours.")
    if visit["status"] not in ("PENDING", "AWAITING_DWELL"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This check-in is already finished.")

    now = _now()
    if now > visit["expires_at"]:
        expired = visits_repo.update_visit(visit_id, status="EXPIRED")
        return _to_out(expired, None, reason="EXPIRED",
                       message="This check-in window closed. Start a new one.")

    business = biz_repo.get_local(visit["business_id"])
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found.")
    secret = biz_repo.get_qr_secret(visit["business_id"])
    if secret is None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This business hasn't turned on code check-in.")

    # Same anti-abuse + geofence gates as a GPS checkpoint — QR still needs presence.
    last = visits_repo.last_accepted_checkpoint(user["id"])
    if last and antiabuse.is_impossible_travel(
        last["latitude"], last["longitude"], last["server_ts"],
        data.latitude, data.longitude, now,
    ):
        return _reject(visit_id, business, "IMPOSSIBLE_TRAVEL")
    if settings.strict_mock and data.mock_location:
        return _reject(visit_id, business, "MOCK_LOCATION")
    if visits_repo.count_verified_recent(user["id"], visit["business_id"]) >= \
            settings.max_verified_visits_per_business_per_day:
        return _reject(visit_id, business, "RATE_LIMIT")

    radius = business.get("geofence_radius_m") or settings.geofence_radius_default_m
    ev = geofence.evaluate_checkpoint(
        business["lat"], business["lng"], radius,
        data.latitude, data.longitude, data.accuracy_m,
    )
    visits_repo.record_checkpoint(
        visit_id, data.latitude, data.longitude, data.accuracy_m,
        ev["distance_m"], ev["inside"], data.mock_location, data.client_ts,
    )
    if not ev["ok"]:
        failed = visits_repo.update_visit(
            visit_id, status="FAILED", latitude=data.latitude, longitude=data.longitude,
            gps_accuracy_m=data.accuracy_m, distance_m=ev["distance_m"],
            mock_location_flag=data.mock_location, rejection_reason=ev["reason"],
        )
        msg = ("You're a bit too far to verify — get closer to the counter."
               if ev["reason"] == "OUTSIDE_GEOFENCE"
               else "We couldn't pin your location precisely enough. Try again.")
        return _to_out(failed, business, reason=ev["reason"], message=msg)

    # Verify the rotating code (valid within its time window ± a small skew).
    counter = qr.verify_token(secret, data.token)
    if counter is None:
        failed = visits_repo.update_visit(
            visit_id, status="FAILED", latitude=data.latitude, longitude=data.longitude,
            gps_accuracy_m=data.accuracy_m, distance_m=ev["distance_m"],
            mock_location_flag=data.mock_location, rejection_reason="BAD_CODE",
        )
        return _to_out(failed, business, reason="BAD_CODE",
                       message="That code didn't match the one at the counter — check it's the current one.")

    # Single-use: the same code can't be replayed within its window.
    if not visits_repo.redeem_qr(visit["business_id"], user["id"], counter, data.token, visit_id):
        return _reject(visit_id, business, "CODE_REUSED")

    return _finalize(visit, business, data, ev["distance_m"], method="QR_GEOFENCE")


# ─────────────────────────────── internals ──────────────────────────────────
def _finalize(visit: dict, business: dict, data: CheckpointIn, distance_m: float,
              *, method: str | None = None) -> dict:
    """Promote a visit to VERIFIED, score its strength, award trust, announce it.
    ``method`` overrides the strength basis (the QR path scores as QR_GEOFENCE)."""
    prior = visits_repo.prior_verified_count(visit["user_id"])
    strength = antiabuse.compute_strength(
        method or visit["method"], data.accuracy_m, data.mock_location,
        prior_verified_count=prior, is_cold_account=(prior == 0),
    )
    verified = visits_repo.finalize_verified(
        visit["id"], visit["user_id"],
        lat=data.latitude, lng=data.longitude, accuracy_m=data.accuracy_m,
        distance_m=distance_m, mock=data.mock_location,
        strength=strength, spend_cents=data.spend_cents,
    )
    # Announce to §17 reactions (passport, money-kept-local, …). A failing
    # listener is swallowed by the bus, so it can't undo a real verification.
    events.emit("visit.verified", verified)
    return _to_out(verified, business,
                   message="You're verified — you were here. Leave a verified review!")


def _reject(visit_id: int, business: dict, reason: str) -> dict:
    """Terminal REJECTED on an anti-abuse trip. The client gets a generic message;
    the specific rule is stored on the row AND logged server-side for our audit
    (never disclosed to the client — don't teach evasion)."""
    visit = visits_repo.update_visit(visit_id, status="REJECTED", rejection_reason=reason)
    log.warning("visit %s REJECTED for business %s: %s",
                visit_id, business.get("id") if business else "?", reason)
    return _to_out(visit, business, reason="REJECTED",
                   message="We couldn't verify this check-in right now.")


def _to_out(
    visit: dict,
    business: dict | None,
    *,
    needs_another: bool = False,
    reason: str | None = None,
    message: str = "",
) -> dict:
    """Shape a visit row into the VisitOut contract (drops rejection_reason etc.)."""
    return {
        "visit_id": visit["id"],
        "business_id": visit["business_id"],
        "business_name": business["name"] if business else None,
        "status": visit["status"],
        "method": visit["method"],
        "distance_m": round(visit["distance_m"], 1) if visit.get("distance_m") is not None else None,
        "verification_strength": visit.get("verification_strength"),
        "needs_another_checkpoint": needs_another,
        "expires_at": visit["expires_at"],
        "verified_at": visit.get("verified_at"),
        "reason": reason,
        "message": message,
    }
