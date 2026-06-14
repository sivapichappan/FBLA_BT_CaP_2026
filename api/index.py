"""Vercel serverless entrypoint for the LocalLens FastAPI backend.

Vercel's Python runtime serves the module-level ASGI variable named ``app``
directly — no Mangum/adapter needed. The ``rewrites`` in vercel.json send every
``/api/*`` request to this file; Vercel passes the ORIGINAL request path
through, so this function receives e.g. ``/api/businesses/search``.

The real app's routers mount at ``/health``, ``/businesses``, ... with NO
``/api`` prefix (the frontend talks to it same-origin under ``/api`` so there's
no CORS). To reconcile the two without editing a single router, we mount the
real app UNDER ``/api`` in a thin parent app: the ``/api`` segment is consumed
here and the inner app sees its own native paths.
"""

import os
import sys

# Make ``backend/`` an import root so ``from app.main import app`` resolves both
# locally and inside the Vercel bundle (path derived from THIS file's location,
# not the CWD, which differs between local dev and the serverless sandbox).
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from fastapi import FastAPI

from app.main import app as backend_app  # backend/app/main.py → app = create_app()

# Parent app exists only to host the mount point; Vercel loads this ``app``.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", backend_app)
