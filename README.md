# LocalLens

> Discover authentic local businesses near you — and help small business owners get found.

LocalLens is a location-aware web app that surfaces independent (non-chain) businesses, lets users save favorites, leave reviews, redeem deals, and chat with an AI assistant for personalized recommendations. Business owners get a profile, deal-posting, and an analytics dashboard.

## What it does

- **For consumers:** Search nearby businesses on a map, filter by category/price/rating, save favorites, redeem deals, and ask the AI assistant natural-language questions like "cheap lunch near me."
- **For business owners:** Free profile, post deals/coupons, see analytics on views, searches, favorites, and redemptions.

The platform deliberately ranks small independent businesses above chains, surfacing places that mainstream search engines bury.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (no framework, hash-based SPA router) |
| Backend | Python 3.11+ + FastAPI (async) |
| Database | PostgreSQL hosted on Supabase |
| AI | Groq API (LLM-powered chatbot) |
| Maps | Google Maps JavaScript API + Google Places API |
| Server | Uvicorn (dev), Mangum + Vercel serverless (prod) |
| Auth | JWT + bcrypt |

## Project structure

```
FBLA2526/
├── api/
│   └── index.py              # Vercel serverless entry (Mangum wraps FastAPI)
├── backend_py/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, route registration
│   │   ├── config/database.py    # Postgres connection pool + query() helper
│   │   ├── middleware/
│   │   │   ├── auth.py           # JWT verification, get_current_user dependency
│   │   │   └── rate_limiter.py   # slowapi rate limits
│   │   ├── routes/
│   │   │   ├── auth.py           # register, login, profile, password, email, account
│   │   │   ├── businesses.py     # search, details, categories
│   │   │   ├── reviews.py        # CRUD reviews
│   │   │   ├── favorites.py      # add, remove, list, check
│   │   │   ├── deals.py          # list, redeem
│   │   │   ├── analytics.py      # business owner stats
│   │   │   ├── ai.py             # Groq chatbot
│   │   │   └── photos.py         # business photos
│   │   ├── services/google_places.py  # Google Places integration
│   │   ├── utils/                # JWT helpers, AI ranking, intent classifier
│   │   └── data/chain_brands.py  # chain filter list
│   ├── requirements.txt
│   ├── runtime.txt           # Python version pin for Vercel
│   └── .env                  # local secrets (NOT committed)
├── frontend/
│   ├── index.html            # SPA shell
│   ├── css/styles.css        # all styling
│   └── js/
│       ├── api.js            # fetch wrapper (apiGet/Post/Put/Delete)
│       ├── auth.js           # JWT token + current-user state
│       ├── location.js       # geolocation
│       ├── components.js     # icons, header, footer, skeletons, button-loading
│       ├── ai-chat.js        # AI chat widget
│       ├── app.js            # hash router, init
│       └── pages/
│           ├── home.js
│           ├── search.js
│           ├── login.js
│           ├── register.js
│           ├── business-detail.js
│           ├── favorites.js
│           ├── deals.js
│           ├── profile.js
│           └── settings.js
├── package.json              # dev scripts only (no Node code)
├── vercel.json               # deploy config
└── README.md
```

## Setup

### Prerequisites

- Python 3.11 or higher
- A [Supabase](https://supabase.com) project with the PostgreSQL database (free tier is fine)
- A [Google Maps API key](https://developers.google.com/maps/documentation/javascript/get-api-key) with Maps JavaScript API and Places API enabled
- A [Groq API key](https://console.groq.com) (free tier)

### 1. Install Python dependencies

```bash
pip install -r backend_py/requirements.txt
```

### 2. Create `backend_py/.env`

```bash
# Supabase Postgres connection (use the transaction pooler URL from Supabase → Settings → Database)
DATABASE_URL=postgresql://postgres.<project>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres

# Server
PORT=5000
FRONTEND_URL=http://localhost:3000

# JWT signing secret (generate a long random string)
JWT_SECRET=<random-64-char-string>

# Google Maps + Places
GOOGLE_MAPS_API_KEY=<your-key>

# Groq (AI assistant)
GROQ_API_KEY=<your-key>
```

### 3. Update the Google Maps key in the frontend

Edit [frontend/index.html](frontend/index.html) line 11 to use your Maps API key. **Restrict the key to your domain** in Google Cloud Console — the frontend key is publicly visible.

### 4. Run both servers

```bash
npm run dev:backend    # FastAPI on http://localhost:5000
npm run dev:frontend   # Static file server on http://localhost:3000
```

Open `http://localhost:3000` in your browser.

## API endpoints

All endpoints are prefixed with `/api`. Protected endpoints require `Authorization: Bearer <jwt>`.

### Auth
- `POST /auth/register` — create account
- `POST /auth/login` — get JWT
- `GET /auth/profile` — current user (protected)
- `PUT /auth/location` — update default location (protected)
- `PUT /auth/profile` — update name/city/state (protected)
- `PUT /auth/email` — change email (protected, requires current password)
- `PUT /auth/password` — change password (protected, requires current password)
- `DELETE /auth/account` — delete account (protected, requires current password)

### Businesses
- `GET /businesses/search` — search by location/category/filters
- `GET /businesses/:id` — single business detail
- `GET /businesses/categories` — list categories
- `POST /businesses` — create (protected)
- `PUT /businesses/:id` — update (protected, owner only)

### Reviews / Favorites / Deals
- `GET /reviews/business/:id`, `POST/PUT/DELETE /reviews/...` — review CRUD
- `GET /favorites`, `POST /favorites`, `DELETE /favorites/:id`, `GET /favorites/check/:id`
- `GET /deals/active`, `GET /deals/business/:id`, `POST /deals/:id/redeem`

### AI / Analytics / Health
- `POST /ai/chat` — chatbot (protected)
- `GET /analytics/business/:id` — business stats (protected, owner only)
- `GET /health` — server health check

## Database schema

The schema lives in **Supabase**, not in this repo. Tables include `users`, `businesses`, `business_categories`, `business_hours`, `business_photos`, `reviews`, `favorites`, `deals`, `deal_claims`, `chat_sessions`, `chat_messages`.

To export a `schema.sql` snapshot:

1. Open the Supabase dashboard → SQL Editor
2. Run a `pg_dump`-style query, OR use the table-editor → "Export schema as SQL"
3. Save the result as `backend_py/schema.sql`

## Deployment

The app deploys to **Vercel** as a serverless app:

- The frontend (`frontend/`) is served as static files
- The backend (`backend_py/`) runs as a Python serverless function via [api/index.py](api/index.py) (Mangum adapter)
- [vercel.json](vercel.json) wires the routes
- Set all `backend_py/.env` variables in **Vercel → Settings → Environment Variables**

## Security

- **Never commit `.env` files** — `.gitignore` already excludes them
- The Google Maps key in `frontend/index.html` is publicly visible by design — restrict it to your domain in Google Cloud Console
- Passwords are hashed with bcrypt (10 rounds)
- JWT tokens use `JWT_SECRET` from env; rotate this if compromised
- Failed login attempts lock the account for 15 minutes after 5 failures
- All queries use parameterized SQL (no string interpolation)

## License

Built for FBLA Business Technology.
