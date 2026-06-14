"""Pydantic request/response models for auth.

These models are where **syntactic** validation happens at the framework
boundary (BUILD_SPEC §12): types, lengths, ranges, email syntax. Semantic rules
that need data or context (duplicate email, account lockout) live in the service.
"""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

# Reusable coordinate fields with on-the-wire range checks.
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Optional — derived from the email if omitted. 3–30 chars, url/handle-safe.
    username: Optional[str] = Field(default=None, min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_.-]+$")
    role: Literal["user", "owner"] = "user"
    default_lat: Optional[Latitude] = None
    default_lng: Optional[Longitude] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    """Public-safe user shape (never includes the password hash)."""

    id: int
    email: EmailStr
    username: str
    role: str
    trust_score: int
    default_lat: Optional[float] = None
    default_lng: Optional[float] = None
    created_at: dt.datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdateIn(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_.-]+$")
    default_lat: Optional[Latitude] = None
    default_lng: Optional[Longitude] = None


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
