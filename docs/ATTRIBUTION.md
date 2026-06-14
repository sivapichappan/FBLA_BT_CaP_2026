# LocalLens — Attribution

Every third-party library, API, and asset used, with its purpose and license. No templates were
used; all application code, the design system, the hand-rolled HTML/CSS charts, and the inline SVG
icons are original work.

## Backend (Python) — see [backend/requirements.txt](../backend/requirements.txt)

| Package | Purpose | License |
|---|---|---|
| FastAPI | ASGI web framework: routing, dependency injection, OpenAPI | MIT |
| Uvicorn | ASGI server (dev + prod) | BSD-3-Clause |
| Pydantic / pydantic-settings | Request/response validation; typed env config | MIT |
| email-validator | Backs Pydantic `EmailStr` | CC0 / Unlicense |
| psycopg 3 (+ pool) | PostgreSQL driver + connection pooling | LGPL-3.0 |
| PyJWT | Sign/verify JWT bearer tokens | MIT |
| bcrypt | Password hashing (anti-bot requirement) | Apache-2.0 |
| slowapi | Per-route rate limiting | MIT |
| httpx | Async HTTP client (Places, Geocoding, LLM) | BSD-3-Clause |
| Pillow | Image analysis at enrich time — smart-crop focal points | MIT-CMU |
| python-dotenv | Load `.env` in development | BSD-3-Clause |
| pytest | Test runner incl. the chain-registry accuracy harness | MIT |
| Black (dev only) | Code formatting | MIT |

## Frontend (TypeScript) — see [frontend/package.json](../frontend/package.json)

| Package | Purpose | License |
|---|---|---|
| React 18 / react-dom | UI component model | MIT |
| react-router-dom | Client-side routing | MIT |
| @vis.gl/react-google-maps | React bindings for the Google Maps JS API | MIT |
| motion (motion/react) | Orchestrated entrance animation (reduced-motion aware) | MIT |
| Vite | Dev server + production bundler | MIT |
| TypeScript | Compile-time type safety | Apache-2.0 |
| Tailwind CSS (+ PostCSS, Autoprefixer) | Tokenized utility styling | MIT |
| Vitest + jsdom (dev) | Frontend unit-test runner + DOM environment | MIT |
| @testing-library/react (dev) | Renders components in tests the way users see them | MIT |
| Prettier (dev only) | Code formatting | MIT |

## External services (API terms apply; keys live in env vars, never in the repo)

| Service | Used for |
|---|---|
| Google Places API (New) | Live business discovery (text search, nearby browse, details, photos) |
| Google Geocoding API | Address → coordinates (owner forms + the location switcher) |
| Google Maps JavaScript API | The interactive results / trip-route map |
| Google Gemini (OpenAI-compatible endpoint) | Concierge intent + grounded replies, review summaries, trip narration; `gemini-embedding-001` (768 dims) for vibe/semantic search |
| Supabase | Hosted PostgreSQL |
| pgvector (PostgreSQL extension, ships with Supabase) | Cosine-similarity index over business embeddings — PostgreSQL license |

## Fonts & assets

| Asset | Source | License |
|---|---|---|
| Playfair Display (display) | Google Fonts | SIL OFL 1.1 |
| Lora (body) | Google Fonts | SIL OFL 1.1 |
| Star/pin/sun/moon icons, paper-grain texture | Hand-written inline SVG (original) | — |
| Dashboard charts | Hand-rolled HTML/CSS (original; no chart library) | — |

## Data

- Seed data ([backend/app/db/seed.sql](../backend/app/db/seed.sql)): real, publicly known NYC
  independent businesses with approximate coordinates; reviews are fictional demo content written
  for this project; phone numbers use the reserved 555-01xx fictional range.
- Detector validation set ([backend/tests/labeled_businesses.json](../backend/tests/labeled_businesses.json)):
  hand-labeled by the author from public knowledge of each business; field values are realistic
  approximations of what Google Places returns.
- The ~800-entry chain-brand list ([backend/app/services/brands.py](../backend/app/services/brands.py))
  was hand-curated by the author (carried forward from v1 of this project, in [legacy/](../legacy/)).
