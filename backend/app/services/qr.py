"""Rotating counter-codes for Verified Visits (TOTP-style HMAC) — hand-rolled.

A business displays a short code that changes every ``QR_TOKEN_PERIOD_SECONDS``.
A customer who presents it WHILE standing in the geofence proves they're at the
counter *right now*: a screenshot posted online expires within the period, and a
code texted to a remote friend still fails the geofence. The per-business secret
never leaves the server — only the short-lived token does.

The mechanism is the standard TOTP idea: HMAC-SHA256 over a time counter
(``floor(epoch / period)``), truncated to a few bytes and base32-encoded into a
human-typable 8-char code. Verification compares (in constant time) across a
small skew window so a code presented a few seconds late still works.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from typing import Optional

from app.config import settings


def generate_secret() -> bytes:
    """A fresh 32-byte per-business HMAC key (stored in businesses.qr_secret)."""
    return secrets.token_bytes(32)


def _token_for_counter(secret: bytes, counter: int) -> str:
    digest = hmac.new(secret, counter.to_bytes(8, "big"), hashlib.sha256).digest()
    # 5 bytes → exactly 8 base32 chars (A–Z, 2–7): short and easy to read/type.
    return base64.b32encode(digest[:5]).decode("ascii").rstrip("=")


def _counter(period: int, now: Optional[float]) -> int:
    return int((time.time() if now is None else now) // period)


def current_token(secret: bytes, *, now: Optional[float] = None, period: Optional[int] = None) -> str:
    """The code valid for the current period (what the kiosk shows)."""
    p = period or settings.qr_token_period_seconds
    return _token_for_counter(secret, _counter(p, now))


def verify_token(
    secret: bytes,
    token: str,
    *,
    now: Optional[float] = None,
    period: Optional[int] = None,
    skew: int = 1,
) -> Optional[int]:
    """Return the matching period counter if ``token`` is valid within ±``skew``
    windows, else None. Returning the counter lets the caller enforce single-use
    (one redemption per business+user+period). Comparison is constant-time."""
    p = period or settings.qr_token_period_seconds
    current = _counter(p, now)
    candidate = (token or "").strip().upper()
    for c in range(current - skew, current + skew + 1):
        if hmac.compare_digest(_token_for_counter(secret, c), candidate):
            return c
    return None
