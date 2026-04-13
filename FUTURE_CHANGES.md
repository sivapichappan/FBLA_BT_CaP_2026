# Future Changes

Features and improvements deferred for later implementation.

## Security

- **reCAPTCHA bot prevention** — Re-add Google reCAPTCHA v3 to login/register forms. Was removed to reduce friction during development. Backend service exists at `backend/src/services/recaptcha.ts` and can be re-wired when ready. Requires `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` env vars + `react-google-recaptcha` frontend package.
- **Row Level Security (RLS)** — Enable RLS on all Supabase tables if the anon key is ever exposed client-side.

## Features (from existing Supabase schema)

- Badges & user badges system
- Challenges & challenge participants
- Leaderboards (weekly/monthly/all-time)
- User follows (social layer)
- Activity feed
- Favorite collections (named lists, public/private)
- Local impact tracking & summaries
- Business stories (founding story, milestones, community involvement)
- Video spotlights
- Review photos
- Point transactions & gamification

## Infrastructure

- Background jobs / cron triggers for leaderboard recomputation
- Migrate from custom JWT auth to Supabase Auth
- Email verification flow
- Password reset flow
- Image upload (Supabase Storage)
