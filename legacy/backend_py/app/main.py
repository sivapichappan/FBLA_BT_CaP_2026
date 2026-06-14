import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

load_dotenv()

# httpx logs every outbound request URL at INFO. The Geocoding API requires
# the key in the query string (no header alternative), so those INFO lines
# leak the API key into Vercel logs. Suppress to WARNING.
logging.getLogger("httpx").setLevel(logging.WARNING)

from app.middleware.rate_limiter import limiter
from app.routes import auth, businesses, reviews, favorites, deals, analytics, ai, photos

app = FastAPI(title="LocalDiscover API", docs_url=None, redoc_url=None)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router)
app.include_router(businesses.router)
app.include_router(reviews.router)
app.include_router(favorites.router)
app.include_router(deals.router)
app.include_router(analytics.router)
app.include_router(ai.router)
app.include_router(photos.router)


@app.get("/api/health")
async def health():
    from datetime import datetime
    return {"status": "OK", "timestamp": datetime.utcnow().isoformat()}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    print(f"Unhandled error on {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"error": "Internal server error"})
