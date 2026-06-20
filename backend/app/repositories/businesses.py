"""Data access for businesses + their categories and hours (SQL only, §5).

Phase 1 search fetches the active local businesses (with categories and hours
aggregated in the query) and lets the service do distance/filter/rank in Python
— a clean split and fine for the dataset size. Google Places results are added
by the search service from ``services/places.py``.
"""

from __future__ import annotations

from typing import Any, Optional

from app.db.connection import query, transaction

# A business row plus its categories (text[]) and hours (json) in one round-trip.
_SELECT_BUSINESS = """
    SELECT b.id, b.name, b.lat, b.lng, b.address, b.phone, b.website,
           b.price_level, b.is_independent, b.local_confidence,
           b.average_rating, b.review_count, b.photo_url, b.owner_id,
           b.photo_focus_x, b.photo_focus_y, b.geofence_radius_m,
           COALESCE(
               array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),
               '{}'
           ) AS categories,
           (SELECT json_agg(json_build_object(
                       'dow', h.day_of_week, 'open', h.open_time,
                       'close', h.close_time, 'closed', h.is_closed)
                    ORDER BY h.day_of_week)
            FROM business_hours h WHERE h.business_id = b.id) AS hours
    FROM businesses b
    LEFT JOIN business_categories bc ON bc.business_id = b.id
    LEFT JOIN categories c ON c.id = bc.category_id
"""


def list_categories() -> list[dict[str, Any]]:
    return query("SELECT id, name FROM categories ORDER BY name")


def fetch_active() -> list[dict[str, Any]]:
    """Every active business with its categories + hours (for local search).

    Excludes businesses materialized from Google (google_place_id IS NOT NULL):
    those exist only to anchor reviews/visits and must NOT join the curated local
    backbone (the live Google layer already returns them, so including them here
    would duplicate the card and bypass the chain filter)."""
    return query(_SELECT_BUSINESS + " WHERE b.google_place_id IS NULL GROUP BY b.id")


def get_local(business_id: int) -> Optional[dict[str, Any]]:
    """A single local business with categories + hours, or None."""
    rows = query(_SELECT_BUSINESS + " WHERE b.id = %s GROUP BY b.id", [business_id])
    return rows[0] if rows else None


def get_by_place_id(place_id: str) -> Optional[dict[str, Any]]:
    """The materialized row for a Google place, or None if not yet reviewed."""
    rows = query(
        "SELECT id, average_rating, review_count, geofence_radius_m "
        "FROM businesses WHERE google_place_id = %s",
        [place_id],
    )
    return rows[0] if rows else None


def create_from_google(place_id: str, snapshot: dict[str, Any]) -> int:
    """Materialize a lightweight local row for a Google business so it can carry
    reviews/visits. Idempotent via the google_place_id unique index — a
    concurrent first-write returns the same row instead of erroring. The snapshot
    is the data already on the user's screen (no extra Places call needed)."""
    params = {
        "name": snapshot["name"],
        "lat": snapshot["lat"],
        "lng": snapshot["lng"],
        "address": snapshot.get("address"),
        "phone": snapshot.get("phone"),
        "website": snapshot.get("website"),
        "price_level": snapshot.get("price_level"),
        "place_id": place_id,
    }
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO businesses
                   (name, lat, lng, address, phone, website, price_level,
                    is_independent, local_confidence, google_place_id)
               VALUES (%(name)s, %(lat)s, %(lng)s, %(address)s, %(phone)s,
                       %(website)s, %(price_level)s, TRUE, 0.9, %(place_id)s)
               ON CONFLICT (google_place_id) DO UPDATE SET name = EXCLUDED.name
               RETURNING id""",
            params,
        ).fetchone()
    return row["id"]


def list_by_owner(owner_id: int) -> list[dict[str, Any]]:
    """The businesses an owner manages (drives the dashboard selector)."""
    return query(
        _SELECT_BUSINESS + " WHERE b.owner_id = %s GROUP BY b.id ORDER BY b.name",
        [owner_id],
    )


def create(owner_id: int, data: dict[str, Any]) -> int:
    """Insert a business + its category links + its hours in ONE transaction
    (§11): either the whole listing exists, or none of it does."""
    with transaction() as conn:
        business_id = conn.execute(
            """INSERT INTO businesses
                   (name, address, lat, lng, phone, website, price_level,
                    photo_url, owner_id, is_independent, local_confidence)
               VALUES (%(name)s, %(address)s, %(lat)s, %(lng)s, %(phone)s,
                       %(website)s, %(price_level)s, %(photo_url)s,
                       %(owner_id)s, TRUE, 0.9)
               RETURNING id""",
            {"photo_url": None, **data, "owner_id": owner_id},
        ).fetchone()["id"]

        for category_id in data.get("category_ids", []):
            conn.execute(
                "INSERT INTO business_categories (business_id, category_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                [business_id, category_id],
            )

        for h in data.get("hours", []):
            conn.execute(
                """INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (business_id, day_of_week) DO UPDATE
                   SET open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time,
                       is_closed = EXCLUDED.is_closed""",
                [business_id, h["dow"],
                 None if h.get("closed") else h.get("open"),
                 None if h.get("closed") else h.get("close"),
                 bool(h.get("closed"))],
            )
    return business_id


def update(business_id: int, data: dict[str, Any]) -> None:
    """Patch editable fields; COALESCE keeps anything unspecified unchanged."""
    with transaction() as conn:
        conn.execute(
            """UPDATE businesses SET
                   name        = COALESCE(%(name)s, name),
                   address     = COALESCE(%(address)s, address),
                   phone       = COALESCE(%(phone)s, phone),
                   website     = COALESCE(%(website)s, website),
                   price_level = COALESCE(%(price_level)s, price_level),
                   photo_url   = COALESCE(%(photo_url)s, photo_url)
               WHERE id = %(id)s""",
            {"photo_url": None, **data, "id": business_id},
        )


def enable_qr(business_id: int, secret: bytes) -> None:
    """Store the per-business QR secret if not already set (idempotent enable —
    COALESCE keeps an existing secret so re-enabling never rotates it out)."""
    with transaction() as conn:
        conn.execute(
            "UPDATE businesses SET qr_secret = COALESCE(qr_secret, %s) WHERE id = %s",
            [secret, business_id],
        )


def get_qr_secret(business_id: int) -> Optional[bytes]:
    """The per-business QR secret, or None if code check-in isn't enabled.
    Server-only — never returned in any API payload."""
    rows = query("SELECT qr_secret FROM businesses WHERE id = %s", [business_id])
    if not rows or rows[0]["qr_secret"] is None:
        return None
    return bytes(rows[0]["qr_secret"])


def log_view(business_id: int, user_id: Optional[int]) -> None:
    """Append one detail-page view (feeds the owner analytics funnel).

    Best-effort by design: the caller swallows errors so a logging hiccup can
    never break the page the visitor actually asked for.
    """
    with transaction() as conn:
        conn.execute(
            "INSERT INTO business_views (business_id, user_id) VALUES (%s, %s)",
            [business_id, user_id],
        )


def set_photo(business_id: int, photo_url: str) -> None:
    """Used by the enrichment CLI to backfill listing photos."""
    with transaction() as conn:
        conn.execute("UPDATE businesses SET photo_url = %s WHERE id = %s", [photo_url, business_id])


def set_photo_focus(business_id: int, x_pct: int, y_pct: int) -> None:
    """Store the smart-crop focal point (enrichment CLI; 0–100 percentages)."""
    with transaction() as conn:
        conn.execute(
            "UPDATE businesses SET photo_focus_x = %s, photo_focus_y = %s WHERE id = %s",
            [x_pct, y_pct, business_id],
        )


def set_embedding(business_id: int, pgvector_literal: str) -> None:
    """Store a business's 768-dim semantic profile (enrichment CLI)."""
    with transaction() as conn:
        conn.execute(
            "UPDATE businesses SET embedding = %s::vector WHERE id = %s",
            [pgvector_literal, business_id],
        )


def embedding_doc_rows() -> list[dict[str, Any]]:
    """Everything the enrich CLI needs to build each business's embedding text:
    the row itself + category names + up to 8 review bodies."""
    return query(
        """SELECT b.id, b.name, b.address,
                  COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS categories,
                  (SELECT array_agg(body) FROM (
                       SELECT body FROM reviews WHERE business_id = b.id
                       ORDER BY helpful_count DESC, created_at DESC LIMIT 8) t) AS review_bodies
           FROM businesses b
           LEFT JOIN business_categories bc ON bc.business_id = b.id
           LEFT JOIN categories c ON c.id = bc.category_id
           GROUP BY b.id ORDER BY b.id"""
    )


def vibe_search(query_vector_literal: str, limit: int = 10) -> list[dict[str, Any]]:
    """Cosine-nearest businesses to a query embedding (pgvector ``<=>``).

    similarity = 1 − cosine distance, so 1.0 is identical and ~0 is unrelated.
    Only rows with embeddings participate (the enrich CLI fills them).
    """
    return query(
        """SELECT b.id, b.name, b.lat, b.lng, b.address, b.phone, b.website,
                  b.price_level, b.is_independent, b.local_confidence,
                  b.average_rating, b.review_count, b.photo_url, b.owner_id,
                  b.photo_focus_x, b.photo_focus_y,
                  COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS categories,
                  NULL::json AS hours,
                  1 - (b.embedding <=> %s::vector) AS similarity
           FROM businesses b
           LEFT JOIN business_categories bc ON bc.business_id = b.id
           LEFT JOIN categories c ON c.id = bc.category_id
           WHERE b.embedding IS NOT NULL
           GROUP BY b.id
           ORDER BY b.embedding <=> %s::vector
           LIMIT %s""",
        [query_vector_literal, query_vector_literal, limit],
    )
