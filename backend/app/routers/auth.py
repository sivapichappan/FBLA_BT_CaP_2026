"""Auth HTTP routes — thin layer: validate input, call the service, shape output.

No logic here beyond wiring (BUILD_SPEC §5). Pydantic models validate the body;
``auth_service`` holds the rules; rate limiting protects the login/register
endpoints against brute force (§8.6).
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError

from app.middleware.rate_limit import AUTH_LIMIT, limiter
from app.middleware.security import current_user, hash_password, verify_password
from app.models.auth import (
    LoginIn,
    PasswordChangeIn,
    ProfileUpdateIn,
    RegisterIn,
    TokenOut,
    UserOut,
)
from app.repositories import users as users_repo
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


async def _parse_body(model: type[BaseModel], request: Request) -> BaseModel:
    """Read + validate a JSON body manually, raising FastAPI's standard 422.

    Why manual: slowapi's ``@limiter.limit`` wrapper hides the handler signature
    from FastAPI, so a normal ``body: Model`` param gets mis-parsed. Taking only
    ``request`` and validating here keeps rate limiting AND identical validation
    errors. (Non-rate-limited routes use the normal ``body: Model`` style.)
    """
    try:
        raw = await request.json()
    except (json.JSONDecodeError, ValueError):
        raise RequestValidationError([{"type": "value_error", "loc": ("body",), "msg": "Invalid JSON body."}])
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors())


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_LIMIT)
async def register(request: Request) -> TokenOut:
    body = await _parse_body(RegisterIn, request)
    return auth_service.register(body)


@router.post("/login", response_model=TokenOut)
@limiter.limit(AUTH_LIMIT)
async def login(request: Request) -> TokenOut:
    body = await _parse_body(LoginIn, request)
    return auth_service.login(body)


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)) -> UserOut:
    return user


@router.patch("/profile", response_model=UserOut)
async def update_profile(body: ProfileUpdateIn, user: dict = Depends(current_user)) -> UserOut:
    # Reject a username already taken by someone else.
    if body.username and body.username.lower() != user["username"].lower():
        if users_repo.username_exists(body.username):
            raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken.")
    return users_repo.update_profile(
        user["id"],
        username=body.username,
        default_lat=body.default_lat,
        default_lng=body.default_lng,
    )


@router.post("/change-password")
async def change_password(body: PasswordChangeIn, user: dict = Depends(current_user)) -> dict:
    # Re-fetch the full row to verify the current password.
    full = users_repo.get_by_email(user["email"])
    if not full or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    users_repo.update_password(user["id"], hash_password(body.new_password))
    return {"status": "password updated"}
