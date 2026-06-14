"""Rate limiting (anti-abuse / part of the anti-bot story, BUILD_SPEC §8.6).

A single shared ``slowapi`` limiter keyed by client IP. Limit strings are named
constants so the policy is visible in one place and reused across routers.

Two layered anti-bot defenses (BUILD_SPEC §8.6) work together:
* **Per-IP rate limit** (here) — a coarse cap that slows a bot hammering from
  one address.
* **Per-account lockout** (auth_service) — 5 failed attempts locks a *specific*
  account for 15 min.
The IP limit is deliberately looser than the 5-attempt account lockout so the
lockout is the precise, demoable mechanism and the IP limit is the backstop —
if both were 5, the IP cap would mask the account lockout in a live demo.

* AUTH   — login/register: 20 / 15 min  (coarse anti-bruteforce backstop)
* SEARCH — search:         30 / min     (protects the Places quota)
* GENERAL— other writes:   100 / 15 min
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

AUTH_LIMIT = "20/15 minutes"
SEARCH_LIMIT = "30/minute"
GENERAL_LIMIT = "100/15 minutes"
