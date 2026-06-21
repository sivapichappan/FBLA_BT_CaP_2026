# Google Sign-In (social login)

"Continue with Google" on the Login and Register pages, alongside the existing
email/password auth. Built so the email/password path stays the dependable
fallback for a live demo — the Google button only appears when it's configured
**and** Google's script actually loaded.

## Why it's safe (the part to defend in Q&A)

The button hands the browser a **Google ID token** (a signed JWT). We never
trust its contents until the backend verifies it. Verification (`google_oauth.py`)
sends the token to Google's official **`tokeninfo`** endpoint over TLS — Google
checks its own signature and the expiry — and then we enforce the two checks
only we can make:

1. **Audience** — the token's `aud` must equal **our** OAuth client id, so a
   token minted for a *different* app can't be replayed against LocalLens.
2. **Verified email** — Google must vouch `email_verified == true`. That's what
   makes "link by email" safe: a returning user who first signed up with a
   password lands back in the **same** account, because only Google could have
   proven they own that address.

We deliberately did **not** add the `cryptography` package to verify the
signature locally — for our login volume the round-trip to Google is simpler,
just as safe, and avoids a native dependency that complicates the serverless
build. The verification is isolated to one function, so it could be swapped for
local JWKS validation later without touching callers.

## Flow

```
Browser: "Continue with Google" (Google Identity Services)
   │  returns a signed ID token ("credential")
   ▼
POST /auth/google { credential }            (rate-limited like login/register)
   ▼
google_oauth.verify_id_token()  → Google tokeninfo + aud/iss/email_verified checks
   ▼
auth_service.google_login():
   1. oauth_sub already linked?        → sign in
   2. else email matches an account?   → LINK it (keep their password too)
   3. else                             → create a password-less account
   ▼
issue our normal JWT  →  identical session to email/password login
```

Because step 4 returns the **same token shape**, nothing downstream (favorites,
reviews, verified visits, passport) knows or cares how the user signed in.

## Data model (additive — existing accounts untouched)

`users` gained, via idempotent `ALTER`s:

- `password_hash` is now **nullable** (Google accounts have no password).
- `auth_provider TEXT NOT NULL DEFAULT 'password'` — `'password'` or `'google'`.
- `oauth_sub TEXT` — Google's globally-unique subject id, with a partial
  `UNIQUE INDEX … WHERE oauth_sub IS NOT NULL` so no two rows can claim the same
  Google identity.

## Files

**Backend**
- `app/services/google_oauth.py` — verify the ID token (tokeninfo + our checks).
- `app/services/auth_service.py` — `google_login()` (find / link / create).
- `app/repositories/users.py` — `get_by_oauth_sub`, `create_oauth_user`, `link_oauth`.
- `app/routers/auth.py` — `POST /auth/google`.
- `app/models/auth.py` — `GoogleLoginIn`.
- `app/config.py` — `google_oauth_client_id` (the audience we accept).
- `app/db/schema.sql` — the three additive `ALTER`s + unique index.
- `tests/test_google_auth.py` — new-account / link / already-linked / bad-token.

**Frontend**
- `src/components/GoogleSignInButton.tsx` — loads GIS on demand, renders Google's
  button, returns the credential; renders nothing when unconfigured/unreachable.
- `src/lib/api.ts` — `authApi.google()`.
- `src/lib/auth.tsx` — `loginWithGoogle()` in the auth context.
- `src/routes/Login.tsx`, `src/routes/Register.tsx` — "or" divider + the button.

## Setup

**One-time, in Google Cloud Console (same project as the Maps key):**
Create an **OAuth client ID** (Web application) and add your origins under
**Authorized JavaScript origins** (no redirect URIs — this flow doesn't redirect):

- `http://localhost:5173`
- your production URL, e.g. `https://fbla-2026-sivapichappan-5633s-projects.vercel.app`

To let other people (judges) sign in with their own Google accounts, **Publish**
the OAuth consent screen (basic email/profile scopes need no verification). In
"Testing" mode only added test users can sign in.

> Changes can take a few minutes to a few hours to propagate. Until your origin
> is allowed, the browser console shows
> `[GSI_LOGGER]: The given origin is not allowed for the given client ID` and the
> button won't complete — this is a Console config/propagation matter, not a code bug.

**Environment variables** (the client id is public — it ships in the page):

| Where | Var | Used for |
|---|---|---|
| `frontend/.env` (local) | `VITE_GOOGLE_CLIENT_ID` | renders the button |
| `backend/.env` (local) | `GOOGLE_OAUTH_CLIENT_ID` | the audience we verify against |
| Vercel → frontend build env | `VITE_GOOGLE_CLIENT_ID` | inlined into the production bundle at build |
| Vercel → backend runtime env | `GOOGLE_OAUTH_CLIENT_ID` | token verification in production |

Leave the vars blank to disable Google sign-in entirely — the email/password
form keeps working.

## Demo / resilience

- Email/password remains the primary, offline-safe path; if the venue wifi
  flakes or Google's script can't load, the button simply doesn't render.
- `POST /auth/google` is rate-limited exactly like `/auth/login`, so a stolen
  token can't be hammered.
- Verification failures return one generic `401` (we don't leak which check
  failed), with a friendly message.
