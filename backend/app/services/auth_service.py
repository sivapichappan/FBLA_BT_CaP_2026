"""Auth business logic: registration and login (with lockout).

This is where **semantic** auth rules live (BUILD_SPEC §12): unique email,
username derivation, and the 5-attempt / 15-minute account lockout that is part
of the anti-bot requirement (§8.6). No SQL here (that's the repository) and no
HTTP objects (that's the router) — just logic, raising ``HTTPException`` for
flow control with friendly messages.
"""

from __future__ import annotations

import datetime as dt
import re
import secrets

from fastapi import HTTPException, status

from app.middleware.security import create_access_token, hash_password, verify_password
from app.models.auth import LoginIn, RegisterIn
from app.repositories import users as users_repo

# Anti-bot lockout policy (§8.6).
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _derive_username(email: str) -> str:
    """Make a unique, handle-safe username from an email local-part."""
    base = re.sub(r"[^A-Za-z0-9_.-]", "", email.split("@", 1)[0]) or "user"
    base = base[:24]
    candidate = base
    # Append a short random suffix until unique (collisions are rare).
    while len(candidate) < 3 or users_repo.username_exists(candidate):
        candidate = f"{base}_{secrets.token_hex(3)}"
    return candidate


def register(data: RegisterIn) -> dict:
    """Create an account and return ``{access_token, token_type, user}``."""
    if users_repo.email_exists(data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered.")

    username = data.username or _derive_username(data.email)
    if data.username and users_repo.username_exists(username):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken.")

    user = users_repo.create_user(
        email=data.email,
        password_hash=hash_password(data.password),
        username=username,
        role=data.role,
        default_lat=data.default_lat,
        default_lng=data.default_lng,
    )
    return {"access_token": create_access_token(user["id"]), "token_type": "bearer", "user": user}


def login(data: LoginIn) -> dict:
    """Authenticate, enforcing the lockout, and return a token + user."""
    # Generic message for unknown email AND wrong password so we never reveal
    # which emails exist (account-enumeration defense).
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    row = users_repo.get_by_email(data.email)
    if row is None:
        raise invalid

    now = dt.datetime.now(dt.timezone.utc)
    locked_until = row.get("locked_until")
    if locked_until is not None and locked_until > now:
        mins = max(1, round((locked_until - now).total_seconds() / 60))
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts. Try again in about {mins} minute(s).",
        )

    if not verify_password(data.password, row["password_hash"]):
        # Count this failure; lock the account once the threshold is reached.
        attempts = (row.get("failed_logins") or 0) + 1
        lock_time = now + dt.timedelta(minutes=LOCKOUT_MINUTES) if attempts >= MAX_FAILED_ATTEMPTS else None
        users_repo.record_failed_login(row["id"], lock_time)
        if lock_time is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes.",
            )
        raise invalid

    # Success → clear the failure counter and issue a token.
    users_repo.reset_login_state(row["id"])
    user = users_repo.get_by_id(row["id"])
    return {"access_token": create_access_token(user["id"]), "token_type": "bearer", "user": user}
