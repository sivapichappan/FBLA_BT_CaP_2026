"""Google sign-in service tests, driven by a fake in-memory users repo and a
stubbed token verifier so no network or database is touched (same offline style
as the other service tests).

Covers the three resolution paths — new account, link-by-email, already-linked —
plus a rejected token surfacing as a 401.
"""

import asyncio

import pytest
from fastapi import HTTPException

from app.services import auth_service
from app.services.google_oauth import GoogleAuthError


class FakeUsers:
    """Minimal stand-in for the users repo: an in-memory list of public rows."""

    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self._next_id = max((r["id"] for r in self.rows), default=0) + 1

    def get_by_oauth_sub(self, sub):
        return next((r for r in self.rows if r.get("oauth_sub") == sub), None)

    def get_by_email(self, email):
        return next((r for r in self.rows if r["email"].lower() == email.lower()), None)

    def username_exists(self, username):
        return any(r["username"].lower() == username.lower() for r in self.rows)

    def link_oauth(self, user_id, oauth_sub):
        row = next(r for r in self.rows if r["id"] == user_id)
        row["oauth_sub"] = oauth_sub
        return row

    def create_oauth_user(self, *, email, username, oauth_sub, provider="google", role="user"):
        row = {
            "id": self._next_id, "email": email, "username": username, "role": role,
            "trust_score": 0, "default_lat": None, "default_lng": None,
            "created_at": "2026-01-01T00:00:00Z", "oauth_sub": oauth_sub,
            "auth_provider": provider,
        }
        self._next_id += 1
        self.rows.append(row)
        return row


def _stub_verify(claim):
    async def _verify(_credential):
        return claim
    return _verify


def _patch(monkeypatch, users, verify):
    monkeypatch.setattr(auth_service, "users_repo", users)
    monkeypatch.setattr(auth_service.google_oauth, "verify_id_token", verify)


def test_new_visitor_creates_account(monkeypatch):
    users = FakeUsers()
    _patch(monkeypatch, users, _stub_verify(
        {"sub": "g-123", "email": "Ada@example.com", "name": "Ada"}))

    out = asyncio.run(auth_service.google_login("tok"))

    assert out["token_type"] == "bearer" and out["access_token"]
    assert out["user"]["email"] == "Ada@example.com"
    assert out["user"]["oauth_sub"] == "g-123"
    assert len(users.rows) == 1  # exactly one account was created


def test_existing_email_links_not_duplicates(monkeypatch):
    # A password account already exists for this email, with no Google link yet.
    existing = {
        "id": 7, "email": "ada@example.com", "username": "ada", "role": "user",
        "trust_score": 5, "default_lat": None, "default_lng": None,
        "created_at": "2026-01-01T00:00:00Z", "oauth_sub": None,
        "auth_provider": "password",
    }
    users = FakeUsers([existing])
    _patch(monkeypatch, users, _stub_verify(
        {"sub": "g-999", "email": "ada@example.com", "name": "Ada"}))

    out = asyncio.run(auth_service.google_login("tok"))

    assert out["user"]["id"] == 7            # same account, not a new one
    assert out["user"]["oauth_sub"] == "g-999"  # now linked
    assert len(users.rows) == 1


def test_returning_google_user_signs_straight_in(monkeypatch):
    linked = {
        "id": 3, "email": "ada@example.com", "username": "ada", "role": "user",
        "trust_score": 0, "default_lat": None, "default_lng": None,
        "created_at": "2026-01-01T00:00:00Z", "oauth_sub": "g-555",
        "auth_provider": "google",
    }
    users = FakeUsers([linked])
    _patch(monkeypatch, users, _stub_verify(
        {"sub": "g-555", "email": "ada@example.com", "name": "Ada"}))

    out = asyncio.run(auth_service.google_login("tok"))

    assert out["user"]["id"] == 3
    assert len(users.rows) == 1  # no new row, no re-link churn


def test_invalid_token_is_401(monkeypatch):
    async def _reject(_credential):
        raise GoogleAuthError("That Google sign-in couldn't be verified.")

    _patch(monkeypatch, FakeUsers(), _reject)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.google_login("bad"))
    assert exc.value.status_code == 401
