"""Application settings.

All configuration comes from the environment (a local ``backend/.env`` in dev,
real env vars in production). Centralising it in one typed object means:

* secrets are never hard-coded (see BUILD_SPEC §15);
* every value is validated/typed once at startup instead of scattered
  ``os.getenv`` calls; and
* the rest of the app imports a single ``settings`` instance.

Nothing here raises if optional keys are missing — the app must still *boot*
(e.g. the ``/health`` check) even before the Google/LLM keys are supplied.
Components that truly need a key check for it at call time and degrade
gracefully (BUILD_SPEC §13).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ───────────────────────────────────────────────────────────
    # Empty by default so the app can import without a DB (health check works);
    # the connection pool raises a clear error only when a query is attempted.
    database_url: str = ""

    # ── Auth ───────────────────────────────────────────────────────────────
    jwt_secret: str = "dev-only-insecure-change-me"
    jwt_expires_hours: int = 24 * 7  # 7-day access tokens

    # ── Google Maps Platform (Places + Geocoding) ──────────────────────────
    google_maps_api_key: str = ""

    # ── LLM provider (OpenAI-compatible endpoint; default Google AI Studio) ─
    # Gemini speaks the OpenAI chat-completions protocol via this base URL, so
    # the concierge code stays provider-agnostic. Override any of these in .env
    # to switch providers (e.g. Groq) without touching code.
    llm_api_key: str = ""
    llm_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    llm_intent_model: str = "gemini-2.5-flash-lite"
    llm_reply_model: str = "gemini-2.5-flash"
    # Chain-vs-small audit of search results (the registry's second gate).
    llm_classify_model: str = "gemini-2.5-flash"
    # Embeddings power the "vibe" semantic search; 768 dims matches the
    # vector(768) column. (text-embedding-004 was retired from this API.)
    llm_embed_model: str = "gemini-embedding-001"

    # ── Resilience switch ──────────────────────────────────────────────────
    # When False, every external-API path is skipped and the deterministic /
    # cached fallback is used instead — this is how we rehearse a network-free
    # demo (BUILD_SPEC §13).
    online: bool = True

    # ── HTTP / CORS ────────────────────────────────────────────────────────
    # Comma-separated in the env; parsed into a list by ``cors_origin_list``.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── Demo location (NYC) ────────────────────────────────────────────────
    demo_city: str = "New York, NY"
    demo_lat: float = 40.7308
    demo_lng: float = -73.9973

    model_config = SettingsConfigDict(
        env_file=".env",          # loaded when uvicorn runs from the backend/ dir
        env_file_encoding="utf-8",
        case_sensitive=False,     # DATABASE_URL == database_url
        extra="ignore",           # tolerate unrelated vars in the environment
    )

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origins as a clean list (drops blanks/whitespace)."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton ``Settings`` (parsed once per process)."""
    return Settings()


# Import-friendly singleton: ``from app.config import settings``.
settings = get_settings()
