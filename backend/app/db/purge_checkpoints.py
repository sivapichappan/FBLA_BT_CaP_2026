"""Purge raw location checkpoints past the retention window (privacy, §14).

Verified Visits keeps only what ratings need long-term — the derived visit
summary (status, verified_at, verification_strength). The raw per-sample
coordinates in ``visit_checkpoints`` are deleted after CHECKPOINT_RETENTION_DAYS.
Run periodically (manually, or from a scheduler):

    cd backend && python -m app.db.purge_checkpoints

Idempotent and safe to re-run — it only deletes rows already past the window.
"""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from app.config import settings
from app.db.connection import _dsn


def main() -> int:
    days = settings.checkpoint_retention_days
    with psycopg.connect(_dsn(), autocommit=True, row_factory=dict_row) as conn:
        deleted = conn.execute(
            "DELETE FROM visit_checkpoints WHERE server_ts < now() - make_interval(days => %s)",
            [days],
        ).rowcount
    print(f"✓ purged {deleted} checkpoint(s) older than {days} days "
          f"(visit summaries kept).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
