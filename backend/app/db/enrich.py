"""Enrich seeded local businesses with real-world data.

Three passes, all failure-safe and idempotent (re-runs only fill gaps):

* **Photos** — text-search Google Places for "<name> <address>", sanity-check
  the top hit's name actually matches, and store its photo as our PROXY url
  (`/businesses/photo?name=…`), keeping the Maps key server-side (§13/§15).
* **Embeddings** — build each business's "semantic profile" text (name +
  categories + what its reviews actually say) and store the 768-dim vector
  that powers the vibe search. Reviews matter most here: they carry the
  atmosphere words ("cozy", "romantic", "old-world") people search by vibe.
* **Focal points** — download each stored photo once and compute where its
  visual subject is (edge-energy analysis, services/photo_focus.py), so card
  crops keep the storefront sign in frame instead of blindly center-cropping.

Run from ``backend/`` after seeding:

    python -m app.db.enrich
"""

from __future__ import annotations

import asyncio
import re
import unicodedata
from urllib.parse import parse_qs, urlparse

import httpx

from app.db.connection import query
from app.repositories.businesses import (
    embedding_doc_rows,
    set_embedding,
    set_photo,
    set_photo_focus,
)
from app.services import places
from app.services.embeddings import embed_text, to_pgvector
from app.services.photo_focus import focal_point


def _normalize(name: str) -> str:
    """Accent-fold then strip non-alphanumerics, so 'Caffè Reggio' matches
    Google's 'Caffe Reggio' (NFKD splits é→e+◌́; the mark is then dropped)."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", folded.lower())


def _names_match(seeded: str, found: str) -> bool:
    """Loose match so 'Joe's Pizza' == 'Joe's Pizza - Carmine St' but a totally
    different storefront is rejected (we'd rather show a placeholder than the
    wrong shop's photo)."""
    a, b = _normalize(seeded), _normalize(found)
    return a in b or b in a


async def enrich_photos() -> None:
    rows = query(
        "SELECT id, name, address, lat, lng FROM businesses WHERE photo_url IS NULL ORDER BY id"
    )
    print(f"Backfilling photos for {len(rows)} businesses …")
    filled = skipped = 0

    for row in rows:
        results, _ = await places.search_text(f"{row['name']} {row['address']}", row["lat"], row["lng"], 1500)
        hit = results[0] if results else None
        if hit and hit.get("photo_url") and _names_match(row["name"], hit["name"]):
            set_photo(row["id"], hit["photo_url"])
            filled += 1
            print(f"  ✓ {row['name']}")
        else:
            skipped += 1
            reason = "no result" if not hit else ("no photo" if not hit.get("photo_url") else f"name mismatch ({hit['name']})")
            print(f"  – {row['name']}: {reason} (placeholder will show)")

    print(f"Done: {filled} photos stored, {skipped} left to the placeholder.")


async def enrich_embeddings() -> None:
    """Compute + store the vibe-search vector for businesses missing one."""
    have = {
        r["id"]
        for r in query("SELECT id FROM businesses WHERE embedding IS NOT NULL")
    }
    rows = [r for r in embedding_doc_rows() if r["id"] not in have]
    print(f"Embedding {len(rows)} businesses …")
    done = failed = 0

    for row in rows:
        doc = " | ".join(
            part
            for part in [
                row["name"],
                ", ".join(row.get("categories") or []),
                row.get("address") or "",
                " ".join(row.get("review_bodies") or []),
            ]
            if part
        )
        vector = await embed_text(doc)
        if vector:
            set_embedding(row["id"], to_pgvector(vector))
            done += 1
        else:
            failed += 1
            print(f"  – {row['name']}: embedding failed (vibe search will skip it)")

    print(f"Done: {done} embedded, {failed} failed.")


async def _download_photo(photo_url: str) -> bytes | None:
    """Fetch the actual image bytes behind a stored photo_url.

    Proxy paths ("/businesses/photo?name=…") resolve through the Places photo
    API exactly like the runtime proxy does; owner-supplied absolute URLs are
    fetched directly. Returns None on any failure (focus stays NULL → 50/50).
    """
    if photo_url.startswith("/"):
        names = parse_qs(urlparse(photo_url).query).get("name")
        if not names:
            return None
        uri = await places.fetch_photo_uri(names[0])
        if not uri:
            return None
        photo_url = uri
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(photo_url)
        return resp.content if resp.status_code == 200 else None
    except Exception:
        return None


async def enrich_photo_focus() -> None:
    """Compute the smart-crop focal point for photos that don't have one."""
    rows = query(
        "SELECT id, name, photo_url FROM businesses "
        "WHERE photo_url IS NOT NULL AND photo_focus_x IS NULL ORDER BY id"
    )
    print(f"Computing focal points for {len(rows)} photos …")
    done = skipped = 0

    for row in rows:
        data = await _download_photo(row["photo_url"])
        focus = focal_point(data) if data else None
        if focus:
            set_photo_focus(row["id"], focus[0], focus[1])
            done += 1
            print(f"  ✓ {row['name']}: subject at {focus[0]}% / {focus[1]}%")
        else:
            skipped += 1
            print(f"  – {row['name']}: unreadable photo (center crop will show)")

    print(f"Done: {done} focal points stored, {skipped} defaulting to center.")


async def main() -> None:
    await enrich_photos()
    await enrich_embeddings()
    await enrich_photo_focus()


if __name__ == "__main__":
    asyncio.run(main())
