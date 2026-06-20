# Verified Visits — feature documentation

> **What it is:** proof a reviewer was *physically at* a business before their
> review counts. It's LocalLens's headline answer to the FBLA rubric's required
> **"verification step to prevent bot activity"** — a bot at a keyboard cannot
> stand inside a shop — and the trust primitive behind three more features
> (passport, money-kept-local, trust-weighted rating).

This document is the single reference for the feature. The build spec it was
implemented from is in `WondrLink-Chat/docs/versions/verified-visits-spec.md`.

---

## 1. Why it exists (the pitch)

Mainstream review sites never confirm a reviewer was actually there — which is
the root cause of review fraud that disproportionately hurts small, independent
businesses. LocalLens confirms physical presence at check-in, so it can show
something no incumbent does: **a rating you can trust.** The same verified-visit
record powers a gamified passport, a "money kept local" counter, and a
trust-weighted rating — one primitive, four features.

**Bot-prevention framing (rubric):** verification is the *product*, not a bolted-on
CAPTCHA. Producing a verified review requires a real device, at real coordinates,
inside the business, passing server-side anti-spoofing — none of which a script
can fake. Rate-limiting + the 5-attempt login lockout remain as supporting layers.

---

## 2. Architecture (strict router → service → repository)

| Layer | Files |
|---|---|
| **Routers** (thin) | `routers/visits.py` (initiate / checkpoint / qr / spend / mine / get), `routers/passport.py` (`/passport/me`), QR-owner endpoints in `routers/businesses.py`, review routes in `routers/reviews.py` |
| **Services** (logic) | `services/visits_service.py` (the state machine), `services/geofence.py` (haversine + fence), `services/antiabuse.py` (impossible-travel, mock, strength), `services/qr.py` (HMAC codes), `services/qr_service.py` (owner enable/kiosk), `services/passport.py`, `services/review_trust.py`, `services/events.py` (the `visit.verified` bus) |
| **Repositories** (all SQL) | `repositories/visits.py`, additions to `repositories/businesses.py` + `repositories/reviews.py` |
| **Models** | `models/visit.py` (VisitInitiateIn, CheckpointIn, QrSubmitIn, SpendIn, VisitOut), `BusinessSnapshot` in `models/business.py`, `reviews.visit_id`/`is_verified` |

`geofence`, `antiabuse`, and `qr` are **pure functions** (no I/O) — unit-tested
without a database, so every number is defensible in Q&A.

---

## 3. Data model (additive, idempotent — `db/schema.sql`)

- **`visits`** — the state machine: `user_id`, `business_id`, `method`, `status`,
  last-checkpoint evidence, `verified_at`/`expires_at`, `verification_strength`
  (0–100), `spend_cents`, `rejection_reason` (internal-only).
- **`visit_checkpoints`** — every location sample (the audit trail purged by
  retention).
- **`qr_redemptions`** — single-use guard `UNIQUE(business_id, user_id, period)`.
- **`businesses`** + `geofence_radius_m`, `qr_secret` (server-only),
  `google_place_id` (unique — materialize-on-write, §6).
- **`reviews`** + `visit_id` (NULL ⇒ unverified; the partial-unique index makes
  `visit_id IS NOT NULL` exactly "verified review").

Enums are `TEXT + CHECK` (matching the existing schema convention).

---

## 4. The verification ladder + state machine

A visit runs `PENDING → AWAITING_DWELL → VERIFIED` (or `FAILED / REJECTED /
EXPIRED`), driven by server-validated checkpoints. Methods, by trust (strength):

| Method | Strength | What it requires |
|---|---|---|
| `GPS_GEOFENCE` | 55 | one in-fence location sample |
| `GPS_GEOFENCE_DWELL` (**the app default / hero**) | 75 | two samples ≥ `DWELL_MINUTES` apart — defeats a momentary spoof |
| `QR_GEOFENCE` | 90 | a rotating counter-code **and** an in-fence sample |

**Order of checks** (in `submit_checkpoint` / `submit_qr`): anti-abuse gates
(→ REJECTED) → geofence + accuracy (→ FAILED) → dwell/code → finalize (→ VERIFIED).

### Threat model → mitigation

| Attack | Mitigation |
|---|---|
| Reviewer was never there | In-geofence checkpoint required (haversine ≤ radius + grace) |
| Faked GPS (mock provider) | Client mock flag (penalty/reject) + server velocity & accuracy sanity |
| Drive-by / momentary spoof | Dwell: two checkpoints ≥ N min apart |
| Reused QR screenshot | Rotating time-bucketed HMAC token + single-use per window |
| Code texted to a remote friend | QR **also** requires an in-geofence checkpoint |
| One visit → many reviews | `visit_id` partial-unique; one review per (user, business) |
| Farming a location | Per-(user, business) verified-visits/day cap |
| Scripted mass check-ins | Per-user rate limit + impossible-travel rejection |
| Trusting the client clock | Server timestamps are authoritative |
| Teaching attackers the rules | REJECTED is generic; the real reason is logged server-side only |

Tunables live in `config.py` (`GEOFENCE_RADIUS_DEFAULT_M=100`, `DWELL_MINUTES=2`,
`MAX_GPS_ACCURACY_M=75`, `MAX_TRAVEL_KMH=900`, `QR_TOKEN_PERIOD_SECONDS=30`,
`MAX_VERIFIED_VISITS_PER_BUSINESS_PER_DAY=2`, `CHECKPOINT_RETENTION_DAYS=30`, …) —
all env-overridable (e.g. drop `DWELL_MINUTES` for a snappier demo video).

---

## 5. Two-tier rating (the headline interaction)

Every business carries **two** numbers: the raw average everyone games, and the
**verified-only** average you can trust. On the detail page a **"Verified reviews
only"** toggle swaps the headline (flagship demo: **4.5 → 3.9**) and filters the
list. One query with a `FILTER (WHERE visit_id IS NOT NULL)`.

---

## 6. Review / check-in ANYWHERE (materialize-on-write)

Seeded NYC businesses have DB rows; live Google results are transient. The first
time anyone reviews or checks in at a Google business, the server **materializes**
a lightweight `businesses` row keyed by `google_place_id`, from the snapshot
already on screen (no extra Places call, offline-safe). Materialized rows are
**excluded from search** so they never duplicate a card. Result: any independent
business nationwide is reviewable — and you can film the demo at a real shop near
you instead of spoofing NYC.

---

## 7. §17 reuse features (all derived from verified visits)

- **Passport** (`/passport`) — badges (milestones + category stamps), a streak,
  and recent verified visits. Cheat-resistant: you can't earn a stamp from your
  couch.
- **Money kept local** — sums an optional self-reported spend across verified
  visits (a quick prompt on the success screen).
- **Trust-weighted rating** — a glass-box adjusted rating that weights verified
  reviews `1.0×` vs unverified `0.4×` (+ strength / account-age / helpful nudges),
  with an on-demand "Why?" stating every rule. No black-box ML.

The verification core emits a `visit.verified` event (`services/events.py`) so
these stay decoupled — a failing reaction can never break a check-in.

---

## 8. API (all require auth unless noted)

```
POST /visits/initiate            {business_ref, method, snapshot?}  → VisitOut
POST /visits/{id}/checkpoint     {latitude, longitude, accuracy_m?, ...} → VisitOut
POST /visits/{id}/qr             {token, latitude, longitude, ...}  → VisitOut
POST /visits/{id}/spend          {spend_cents}                      → {ok}
GET  /visits/{id}                                                   → VisitOut
GET  /visits/mine                                                  → MyVisit[]
GET  /passport/me                                                  → Passport
POST /businesses/{id}/qr/enable        (owner)                     → {enabled}
GET  /businesses/{id}/checkin-code     (owner; kiosk, polled)      → {token, period_seconds, …}
POST /businesses/{ref}/reviews   {rating, body, visit_id?, snapshot?} → Review
GET  /businesses/{ref}/reviews?verified_only=…                     → Review[]
GET  /businesses/{ref}            (detail; adds verified_rating, trust, geofence_radius_m)
```

---

## 9. Privacy & ethics (§14 — judges reward this)

- **Consent & minimization:** location is read **only** at check-in (one prompt),
  never in the background.
- **Retention:** raw `visit_checkpoints` coordinates are purged after
  `CHECKPOINT_RETENTION_DAYS` — run `python -m app.db.purge_checkpoints`. Only the
  derived visit summary is kept.
- **No public coordinates:** a user's exact lat/lng never appears in any payload.
- **Fairness:** verification is optional — anyone can still post a clearly-labeled
  unverified review, so the feature adds trust without excluding anyone.
- The Passport page carries a short in-app "how it works / what we store" note.

---

## 10. Tests

- **Backend (pytest):** `test_geofence`, `test_antiabuse`, `test_visits_service`
  (the §18 acceptance matrix), `test_review_link` (+ materialize), `test_qr`,
  `test_passport`, `test_review_trust`. All pure/mock-the-repo — no DB needed.
- **Frontend (Vitest):** `VerifiedRating.test.tsx` (the toggle).
- Run: `cd backend && ./.venv/bin/python -m pytest tests/ -q` ·
  `cd frontend && npm test`.

---

## 11. Demo script (judge-facing, ~75 seconds)

1. Open a flagship business (Caffè Reggio). Rating reads **4.5 ★ · 21 reviews**.
2. Hit **"Verified reviews only."** The number drops to **3.9** and the list
   filters to badged reviews. *"Every one of these is a confirmed visit."*
3. *(optional)* Tap **"Why?"** on the trust-adjusted rating — the glass-box rules.
4. *(optional, owner device)* Show `/owner/checkin-code` — the rotating QR/code.
5. *(optional)* Show `/passport` — badges + "money kept local."
6. The line: *"This is our verification step to prevent bot activity. A bot can't
   physically stand in a shop — so it can't fake a verified review."*

The toggle + passport + trust rating are **pure DB math**, so they work with no
network — safe for unreliable conference Wi-Fi.

---

## 12. Recording the "real-GPS" demo video

The live check-in needs real device location. To record it cleanly:

**Option A — Chrome DevTools location override (easiest, solo):**
1. `cd backend && ./.venv/bin/python -m uvicorn app.main:app --port 8000` and
   `cd frontend && npm run dev`.
2. *(optional, snappier video)* set `DWELL_MINUTES=1` in `backend/.env`.
3. In Chrome, open the app and **sign in** (e.g. register a fresh account).
4. DevTools → ⋮ → More tools → **Sensors** → **Location** → *Other…* → enter the
   business's coordinates (Caffè Reggio: **40.7299, -74.0003**).
5. Open that business → **"Check in to verify this review"** → **Check me in**.
   Watch *Locating → You're here, stay a moment → ✓ Verified*.
6. *(optional)* tap a spend amount, then **Write my verified review** → post it.
   The review now carries the **✓ Verified visit** badge and the two-tier number
   moves.
7. Show the **passport** filling in, and the owner **kiosk** rotating code.

**Option B — real visit (most authentic):** physically go to a local business,
search your area (any independent works — it materializes on first check-in),
and check in with real device GPS. This is the honest, on-camera proof.

> Note: DevTools location override is the standard, honest way to demo a
> location feature — it sets the *real* `navigator.geolocation` value the app
> reads; nothing in the product is faked or bypassed.
