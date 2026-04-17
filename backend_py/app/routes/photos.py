import os
from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse, JSONResponse
import httpx

router = APIRouter(prefix="/api/photos", tags=["photos"])

API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")


@router.get("")
async def proxy_photo(name: str = Query(...), maxWidth: int = Query(400)):
    if not API_KEY or not name:
        return JSONResponse(status_code=400, content={"error": "Missing parameters"})

    try:
        url = f"https://places.googleapis.com/v1/{name}/media?maxWidthPx={maxWidth}&key={API_KEY}&skipHttpRedirect=true"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            photo_uri = data.get("photoUri")
            if not photo_uri:
                return JSONResponse(status_code=404, content={"error": "Photo not found"})

            return RedirectResponse(
                url=photo_uri,
                status_code=302,
                headers={
                    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
                },
            )
    except Exception as e:
        print(f"Photo proxy error: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to fetch photo"})
