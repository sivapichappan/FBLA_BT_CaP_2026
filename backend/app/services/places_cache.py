"""Tiny on-disk JSON cache for external API responses (BUILD_SPEC §13).

Two jobs:
* speed up repeated identical queries during a demo, and
* act as a **fallback**: if a live call fails, we can serve the last good
  response so the demo never shows an error.

Keys are hashed into filenames under ``app/cache/``. ``get`` accepts an optional
freshness window; pass ``allow_stale=True`` to return an expired entry as a
last resort when the live call has failed.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Optional

_CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"


def _path_for(key: str) -> Path:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return _CACHE_DIR / f"{digest}.json"


def get(key: str, max_age_s: Optional[float] = None, allow_stale: bool = False) -> Optional[Any]:
    """Return the cached value, or None. Honors ``max_age_s`` unless ``allow_stale``."""
    path = _path_for(key)
    if not path.exists():
        return None
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    age = time.time() - envelope.get("stored_at", 0)
    if not allow_stale and max_age_s is not None and age > max_age_s:
        return None
    return envelope.get("value")


def set(key: str, value: Any) -> None:
    """Store a JSON-serializable value (best-effort; never raises to the caller)."""
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _path_for(key).write_text(
            json.dumps({"stored_at": time.time(), "value": value}), encoding="utf-8"
        )
    except (OSError, TypeError):
        pass
