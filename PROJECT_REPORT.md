# LocalLens — Project Report

## Goal & Purpose

**LocalLens helps people discover authentic local businesses near them — and helps small business owners get found.**

The platform addresses two connected problems:

1. **For consumers**: Mainstream search engines and review platforms (Google, Yelp) bury small independent businesses under chains, ads, and big-name results. Someone looking for "a good coffee shop nearby" usually ends up at Starbucks. LocalLens prioritizes **local, independent, non-chain businesses** and surfaces them through a location-aware map, smart search, and an AI assistant that understands natural-language queries like "cheap lunch near me."

2. **For business owners**: Independent shops can't outspend chains on advertising. LocalLens gives them a free profile, the ability to post deals/coupons, and an analytics dashboard showing how many people viewed their page, searched in their area, favorited them, and redeemed their deals.

The core engagement loop:

- Users search/browse nearby businesses on a map
- They favorite places, leave reviews, and redeem deals
- Business owners see that activity in their analytics dashboard and post deals to attract more customers
- An AI chatbot personalizes recommendations using each user's location and the live business data

---

## Frameworks & Technology Stack

### Frontend — Vanilla HTML/CSS/JavaScript

**No framework.** The frontend is plain HTML/CSS/JS:

- **[frontend/index.html](frontend/index.html)** — single HTML shell with mount points (`<header>`, `<main>`, `<footer>`)
- **[frontend/css/styles.css](frontend/css/styles.css)** — single custom stylesheet (no Bootstrap, no Tailwind)
- **[frontend/js/](frontend/js/)** — vanilla JavaScript organized by concern:
  - `api.js` — fetch wrapper for backend calls
  - `auth.js` — JWT token management
  - `location.js` — geolocation handling
  - `components.js` — shared UI building blocks
  - `pages/` — one JS file per page (home, login, register, search, business-detail, favorites, deals, profile)
  - `app.js` — client-side router
  - `ai-chat.js` — AI assistant widget
- **Google Maps JS SDK** — loaded via CDN for the interactive map
- **Google Fonts (Inter)** — loaded via CDN

**Architecture**: Single Page App built without a framework. `app.js` handles routing by swapping content into `<main>` based on the URL.

### Backend — Python + FastAPI

**[backend_py/](backend_py/)** — modern async Python web API:

- **FastAPI** ([backend_py/app/main.py](backend_py/app/main.py)) — high-performance Python web framework, similar in role to Express.js but async-first
- **Uvicorn** — ASGI server that runs FastAPI in development
- **Mangum** — adapter that lets FastAPI run as an AWS Lambda / Vercel serverless function
- **psycopg2** — PostgreSQL driver (raw SQL, no ORM)
- **Pydantic** — request/response validation via Python type hints
- **PyJWT** — JWT token signing/verification
- **bcrypt** — password hashing
- **slowapi** — rate limiting middleware
- **httpx** — async HTTP client for calling external APIs

**Code organization**:

- `app/main.py` — app entry point
- `app/routes/` — one router per resource (auth, businesses, reviews, favorites, deals, analytics, ai, photos)
- `app/config/database.py` — Postgres connection pool + `query()` helper
- `app/middleware/` — auth (JWT verification) and rate limiting
- `app/services/google_places.py` — Google Places API integration
- `app/utils/` — JWT utilities, AI ranking logic, intent classifier, local-business scorer
- `app/data/chain_brands.py` — list of chains used to filter out non-local businesses

### Database — Supabase (hosted PostgreSQL)

- Connected via `DATABASE_URL` in [backend_py/.env](backend_py/.env) — points at Supabase's transaction pooler
- Tables: `users`, `businesses`, `reviews`, `favorites`, `deals`, `analytics_events`, `deal_redemptions`
- **No schema file in the repo** — table definitions live only in Supabase's dashboard
- All queries are raw parameterized SQL (no ORM like SQLAlchemy)

### External APIs

| API                            | Purpose                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| **Google Maps JavaScript API** | Interactive map with markers (frontend)                                                   |
| **Google Places API**          | Pull real business data into the database (backend)                                       |
| **Groq API**                   | LLM-powered AI chatbot for personalized recommendations (free-tier alternative to OpenAI) |

### Deployment — Vercel Serverless

- **[vercel.json](vercel.json)** — Vercel config
- **[api/index.py](api/index.py)** — entrypoint that wraps the FastAPI app with Mangum so Vercel can run it as a serverless function
- Frontend is served as static files
- Database is hosted (Supabase), so no infrastructure to manage

### Local Development

```bash
npm run dev:backend   # uvicorn app.main:app --reload --port 5000
npm run dev:frontend  # python3 -m http.server 3000 -d frontend
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ index.html + vanilla JS                         │    │
│  │  - app.js (router)                              │    │
│  │  - pages/*.js (page renderers)                  │    │
│  │  - Google Maps SDK                              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS / JSON
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel Serverless Function                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │ api/index.py → Mangum → FastAPI app             │    │
│  │  - /api/auth, /api/businesses, /api/reviews,    │    │
│  │    /api/favorites, /api/deals, /api/analytics,  │    │
│  │    /api/ai, /api/photos                         │    │
│  │  - JWT auth, rate limiting                      │    │
│  └─────────────────────────────────────────────────┘    │
└──────────┬──────────────────┬─────────────────┬─────────┘
           │                  │                 │
           ▼                  ▼                 ▼
   ┌──────────────┐    ┌─────────────┐   ┌────────────┐
   │ Supabase     │    │ Google      │   │ Groq AI    │
   │ Postgres     │    │ Places API  │   │ (LLM)      │
   └──────────────┘    └─────────────┘   └────────────┘
```

---

## Stack Comparison: README vs. Reality

The README describes the **original** Node.js + React build. The project has since been rewritten:

| Layer             | README says               | Actually is         |
| ----------------- | ------------------------- | ------------------- |
| Backend language  | Node.js                   | Python              |
| Backend framework | Express.js                | FastAPI             |
| Frontend          | React + Vite + TypeScript | Vanilla HTML/CSS/JS |
| AI provider       | OpenAI                    | Groq                |
| Database          | self-hosted PostgreSQL    | Supabase (hosted)   |
| Deployment        | Heroku/Railway            | Vercel serverless   |

The README needs updating to reflect the current stack.

---

## Security Notes

Two secrets are exposed in the repo right now and should be rotated:

1. **Google Maps API key** is hardcoded in [frontend/index.html:11](frontend/index.html#L11). Anyone viewing the page source can copy and abuse it. Lock it down to your domain in Google Cloud Console immediately.
2. **Supabase database password** is in [backend_py/.env](backend_py/.env). The earlier OpenAI key in `backend/.env` is also still there. Rotate both.
