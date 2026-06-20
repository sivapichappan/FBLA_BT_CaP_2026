"""FastAPI application factory.

This module wires the app together but contains **no business logic** — that
lives in ``services/`` (BUILD_SPEC §5 layering rule). Responsibilities here:

* build the ``FastAPI`` instance via ``create_app()``;
* register CORS so the Vite frontend can call the API in dev;
* install a **global exception handler** so an uncaught error becomes a clean
  JSON 500 with a friendly message — never a stack trace leaking to the UI
  (BUILD_SPEC §13);
* manage the DB connection pool's lifecycle (open lazily, close on shutdown);
* mount routers. In Phase 0 only ``/health`` exists; feature routers are added
  in later phases.
"""

from __future__ import annotations

import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.db.connection import close_pool
from app.middleware.rate_limit import limiter
from app.routers import (
    ai,
    analytics,
    auth,
    businesses,
    deals,
    favorites,
    passport,
    recommendations,
    reviews,
    trips,
    visits,
)

log = logging.getLogger("locallens")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hook.

    The DB pool is created lazily on first query (so the app boots even without
    a database), but we make sure it is closed cleanly on shutdown to release
    connections back to Postgres.
    """
    log.info("LocalLens API starting (online=%s)", settings.online)
    yield
    close_pool()
    log.info("LocalLens API stopped")


def create_app() -> FastAPI:
    """Construct and configure the FastAPI application."""
    app = FastAPI(
        title="LocalLens API",
        version="2.0.0",
        summary="Discover and support independent local businesses.",
        lifespan=lifespan,
    )

    # ── CORS ───────────────────────────────────────────────────────────────
    # Allow the dev frontend origins to call the API with credentials.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Rate limiting (slowapi) ────────────────────────────────────────────
    # The limiter is shared (middleware/rate_limit.py); register it on the app
    # and install the handler that turns a tripped limit into a clean 429.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Global exception handler (never crash on stage) ────────────────────
    # Anything not handled by a route is logged server-side (full traceback)
    # and returned to the client as a friendly, stack-trace-free 500.
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        log.error(
            "Unhandled error on %s %s: %s",
            request.method,
            request.url.path,
            "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Something went wrong on our end. Please try again."},
        )

    # ── Health check (used by run.sh and uptime monitoring) ────────────────
    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        """Liveness probe. Intentionally does NOT touch the database so it
        succeeds even if Postgres is unreachable."""
        return {"status": "ok", "service": "locallens", "online": settings.online}

    # ── Feature routers ────────────────────────────────────────────────────
    # Phase 1: auth, businesses (search), reviews, favorites, deals, ai.
    # (analytics arrives in Phase 3.)
    app.include_router(auth.router)
    app.include_router(businesses.router)
    app.include_router(reviews.router)
    app.include_router(favorites.router)
    app.include_router(deals.router)
    app.include_router(ai.router)
    app.include_router(analytics.router)
    app.include_router(recommendations.router)
    app.include_router(trips.router)
    app.include_router(visits.router)
    app.include_router(passport.router)

    return app


# ASGI entry point: ``uvicorn app.main:app``.
app = create_app()
