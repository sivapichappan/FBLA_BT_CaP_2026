"""A tiny in-process event bus so the Verified Visits core can announce
``visit.verified`` WITHOUT depending on the features that react to it.

A verified visit is a reusable primitive: the gamified passport, the
"money kept local" counter, and the fake-review trust score all want to know
when one happens. Rather than wiring those into the verification path (which
would couple the core to every feature and risk one of them breaking a
check-in), the core just calls ``emit("visit.verified", visit)`` and listeners
subscribe. Each listener is wrapped so a failing reaction can NEVER break the
verification that triggered it.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

log = logging.getLogger("locallens")

# event name -> list of listener callables. Populated at import time by the
# §17 feature modules (passport, economic, review trust) — empty until then.
_listeners: dict[str, list[Callable[[dict[str, Any]], None]]] = {}


def on(event: str, fn: Callable[[dict[str, Any]], None]) -> None:
    """Register a listener for an event (called once at module import)."""
    _listeners.setdefault(event, []).append(fn)


def emit(event: str, payload: dict[str, Any]) -> None:
    """Fire an event. A listener that raises is logged and swallowed so it can
    never break the action that emitted the event."""
    for fn in _listeners.get(event, []):
        try:
            fn(payload)
        except Exception:  # noqa: BLE001 — a reaction must never break verification
            log.exception("listener for %s failed", event)
