"""Text embeddings for the "vibe" semantic search.

Same resilience contract as every external call (§13): returns ``None`` on any
failure, never raises into a request. Vectors are 768-dim (matching the
``vector(768)`` column) from Gemini's OpenAI-compatible /embeddings endpoint.

Cosine similarity is scale-invariant, so we don't bother normalizing — pgvector's
``<=>`` (cosine distance) gives identical ordering either way.
"""

from __future__ import annotations

import logging
import math
from typing import Optional

import httpx

from app.config import settings

log = logging.getLogger("locallens.embeddings")

EMBED_DIMS = 768
_TIMEOUT = 15.0


async def embed_texts(texts: list[str]) -> Optional[list[list[float]]]:
    """Many strings → vectors in ONE API call (the endpoint accepts a batch).

    Batching is what makes on-the-fly embedding of live search results cheap
    enough to do per-query. None on any failure.
    """
    if not settings.online or not settings.llm_api_key or not texts:
        return None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.llm_base_url.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                json={
                    "model": settings.llm_embed_model,
                    "dimensions": EMBED_DIMS,
                    "input": [t[:4000] for t in texts],  # cap absurd inputs
                },
            )
        if resp.status_code != 200:
            log.warning("embeddings %s: %s", resp.status_code, resp.text[:200])
            return None
        vectors = [d["embedding"] for d in resp.json()["data"]]
        return vectors if all(len(v) == EMBED_DIMS for v in vectors) else None
    except Exception as exc:
        log.warning("embeddings failed: %s", exc)
        return None


async def embed_text(text: str) -> Optional[list[float]]:
    """One string → one 768-dim vector, or None (offline/no key/error)."""
    vectors = await embed_texts([text])
    return vectors[0] if vectors else None


def cosine(a: list[float], b: list[float]) -> float:
    """Plain cosine similarity — used to rank on-the-fly embeddings in Python
    (the pgvector `<=>` operator does the same for stored vectors)."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def to_pgvector(vector: list[float]) -> str:
    """Serialize for a ``%s::vector`` parameter — pgvector's literal format."""
    return "[" + ",".join(f"{x:.7f}" for x in vector) + "]"
