"""Authentication primitives: password hashing, JWT, and the auth dependencies.

Kept in one place so every route gets identical, correct behavior:
* **bcrypt** for password hashing — slow + salted, the standard defense for the
  competition's "verification step to prevent bot activity" (BUILD_SPEC §8.6).
* **JWT (HS256)** bearer tokens — stateless auth that scales without a session
  store; the secret comes from the environment (§15).
* FastAPI dependencies ``current_user`` (required) and ``optional_user`` that
  decode the token and load the user, raising a clean 401 when invalid.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import bcrypt
import jwt
from fastapi import Header, HTTPException, status

from app.config import settings
from app.repositories import users as users_repo

_ALGORITHM = "HS256"
# bcrypt only hashes the first 72 bytes of a password; encode + clamp so longer
# inputs don't raise and behave consistently.
_BCRYPT_MAX = 72


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (cost 12) for a plaintext password."""
    digest = bcrypt.hashpw(plain.encode("utf-8")[:_BCRYPT_MAX], bcrypt.gensalt(rounds=12))
    return digest.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time check of a plaintext password against a stored hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:_BCRYPT_MAX], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int) -> str:
    """Sign a JWT whose subject is the user id, expiring per config."""
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + dt.timedelta(hours=settings.jwt_expires_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def _user_id_from_token(token: str) -> int:
    """Decode + validate a token, returning the user id (raises on any problem)."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
    return int(payload["sub"])


def _bearer_token(authorization: str) -> str | None:
    """Extract the token from an ``Authorization: Bearer <token>`` header."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


async def current_user(authorization: str = Header(default="")) -> dict[str, Any]:
    """Dependency: require a valid token and return the user row.

    Raises 401 for a missing/invalid/expired token or a user that no longer
    exists. Use on any protected route.
    """
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    try:
        user = users_repo.get_by_id(_user_id_from_token(token))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session expired. Please sign in again.")
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session. Please sign in again.")
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found.")
    return user


async def optional_user(authorization: str = Header(default="")) -> dict[str, Any] | None:
    """Dependency: return the user if a valid token is present, else None.

    Used by endpoints that work signed-out but personalize when signed-in
    (e.g. search marking which results are already favorited).
    """
    token = _bearer_token(authorization)
    if not token:
        return None
    try:
        return users_repo.get_by_id(_user_id_from_token(token))
    except Exception:
        return None
