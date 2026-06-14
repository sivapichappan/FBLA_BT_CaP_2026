#!/usr/bin/env bash
# ============================================================================
# LocalLens v2 launcher — boots the FastAPI backend + the Vite frontend and
# opens the browser. Safe to run repeatedly: it only installs deps when missing
# and only seeds the database when it's empty.
#   Backend → http://localhost:8000   Frontend → http://localhost:5173
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Backend ─────────────────────────────────────────────────────────────────
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  echo "→ creating Python venv…"
  python3 -m venv .venv
fi
./.venv/bin/pip install -q -U pip
./.venv/bin/pip install -q -r requirements.txt

if [ ! -f .env ]; then
  echo "⚠  backend/.env not found — copy backend/.env.example and set DATABASE_URL."
fi

echo "→ applying schema + seed…"
./.venv/bin/python -m app.db.migrate || echo "⚠  migrate skipped/failed (is DATABASE_URL set?)"

echo "→ starting API on http://localhost:8000"
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# ── Frontend ────────────────────────────────────────────────────────────────
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "→ installing frontend deps…"
  npm install
fi
echo "→ starting frontend on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

# ── Cleanup on exit + open the browser ──────────────────────────────────────
trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true' EXIT INT TERM
sleep 2
( command -v open >/dev/null 2>&1 && open http://localhost:5173 ) || true
wait
