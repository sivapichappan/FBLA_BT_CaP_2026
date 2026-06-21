"""Verify a Google ID token — the credential the "Sign in with Google" button
hands us — WITHOUT taking on a cryptography dependency.

We send the token to Google's official ``tokeninfo`` endpoint over TLS. Google
checks its OWN signature and that the token hasn't expired, then returns the
decoded claims. We then enforce the checks only WE can make:

* **audience** — the token must have been minted for OUR client id, so a token
  issued for a different app can't be replayed against LocalLens;
* **issuer** — it must actually come from Google; and
* **verified email** — Google must vouch that the address is confirmed (this is
  what makes "link accounts by email" safe).

Local JWKS verification would avoid the round-trip, but it needs the
``cryptography`` package + RSA signature handling. For our low login volume the
round-trip is simpler, just as safe, and the verification is isolated to this
one function so it could be swapped later without touching callers.
"""

from __future__ import annotations

import httpx

from app.config import settings

_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
# Google may stamp the issuer with or without the scheme; accept both.
_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_TIMEOUT = httpx.Timeout(8.0)


class GoogleAuthError(Exception):
    """The Google credential could not be verified (bad/expired/wrong audience)."""


async def verify_id_token(credential: str) -> dict:
    """Return ``{sub, email, name}`` for a valid Google ID token, else raise
    ``GoogleAuthError`` with a user-safe message."""
    client_id = settings.google_oauth_client_id
    if not client_id:
        raise GoogleAuthError("Google sign-in isn't configured.")
    if not credential:
        raise GoogleAuthError("Missing Google credential.")

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(_TOKENINFO_URL, params={"id_token": credential})
    except httpx.HTTPError:
        raise GoogleAuthError("Couldn't reach Google to verify your sign-in.")

    # tokeninfo returns 400 for an invalid / expired / malformed token.
    if resp.status_code != 200:
        raise GoogleAuthError("That Google sign-in couldn't be verified.")
    claims = resp.json()

    # The token MUST have been issued for our client id (replay defense).
    if claims.get("aud") != client_id:
        raise GoogleAuthError("This sign-in wasn't issued for LocalLens.")
    if claims.get("iss") not in _ISSUERS:
        raise GoogleAuthError("Unexpected sign-in issuer.")

    # email_verified arrives as the string "true" (tokeninfo) or a bool; normalize.
    email = claims.get("email")
    verified = str(claims.get("email_verified", "")).lower() == "true"
    if not email or not verified:
        raise GoogleAuthError("Your Google email isn't verified.")

    sub = claims.get("sub")
    if not sub:
        raise GoogleAuthError("Google didn't return an account id.")

    return {"sub": sub, "email": email, "name": claims.get("name") or ""}
