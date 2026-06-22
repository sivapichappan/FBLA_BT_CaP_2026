/**
 * Shared TypeScript types mirroring the backend's Pydantic response models.
 * One source of truth on each side; keep field names identical to the API.
 */

export interface User {
  id: number;
  email: string;
  username: string;
  role: "user" | "owner" | "admin";
  trust_score: number;
  default_lat: number | null;
  default_lng: number | null;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Business {
  ref: string; // local id as string, or "gp_<placeid>" for Google
  source: "local" | "google";
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  price_level: number | null; // 1–4
  categories: string[];
  average_rating: number;
  review_count: number;
  is_independent: boolean | null;
  local_confidence: number | null;
  local_badge: "verified_local" | "likely_local" | null;
  /** Which pipeline gate verified this as a small business, and why. */
  verdict_source?: "local-owner" | "gemini" | "unverified-offline" | null;
  verdict_reason?: string | null;
  is_open_now: boolean | null;
  distance_km: number | null;
  photo_url: string | null;
  /** Smart-crop focal point (% of frame); absent/null = center crop. */
  photo_focus_x?: number | null;
  photo_focus_y?: number | null;
  editorial_summary: string | null;
  hours_text?: string[];
  owner_id?: number | null;
  /** Present on vibe-search results: cosine similarity to the query (0–1). */
  similarity?: number;
  /* ── Verified Visits (detail page only) ──────────────────────────────── */
  /** The verified-only average (null when no verified reviews exist yet). */
  verified_rating?: number | null;
  /** How many of this business's reviews are backed by a confirmed visit. */
  verified_reviews?: number;
  /** verified_reviews / total reviews (0–1). */
  verification_rate?: number;
  /** Geofence radius in metres — drives the check-in map ring. */
  geofence_radius_m?: number | null;
  /** Glass-box trust-weighted rating (detail page only). */
  trust?: TrustRating;
}

/** The glass-box trust-weighted rating: the raw average re-weighted so verified
 *  reviews count more than anonymous unverified ones. */
export interface TrustRating {
  adjusted_rating: number | null;
  raw_rating: number | null;
  review_count: number;
  verified_share: number;
  factors: string[];
}

/* ── Trip planner ────────────────────────────────────────────────────────── */

export interface TripStop extends Business {
  slot: string;
  arrive: string;
  arrive_min?: number;
  dwell_min: number;
  walk_from_prev_km: number;
  walk_from_prev_min: number;
  // Open-when-you-arrive (idea 3); only set when a weekday was chosen.
  open_at_arrival?: boolean | null;
  hours_known?: boolean;
  // Edit-in-place (idea 1): same-kind alternates for instant swap; lock flag.
  bench?: TripStop[];
  locked?: boolean;
  // Deals on route + personalization (idea 10a/b).
  deals?: { id: number; title: string; discount_pct: number }[];
  is_favorite?: boolean;
  // Free time AFTER this stop (before the next) when a short day is spread to fill
  // the window — rendered as a "time to explore" gap so the clock jump reads right.
  explore_after_min?: number;
}

/** Re-timed itinerary after a client edit (idea 1). */
export interface RetimeResult {
  stops: TripStop[];
  total_walk_km: number;
  over_window: boolean;
}

/** One candidate itinerary. The planner returns several, each optimised for a
 *  different goal (best overall / top-rated / shortest walk) and made of
 *  different businesses — the user picks the one they like. */
/** A rough "money kept local" estimate for an option (idea 8). */
export interface TripSpend {
  low: number;
  high: number;
  unknown_count: number;
}

/** The optional personalisation knobs (idea 4/6/8). */
export interface TripKnobs {
  audience: "solo" | "couple" | "family" | "group" | null;
  occasion: "casual" | "date" | "celebrate" | null;
  pace: "relaxed" | "normal" | "packed" | null;
  budget: number | null; // 1=$ 2=$$ 3=$$$
}

export interface TripOption {
  key: string;
  label: string;
  stops: TripStop[];
  total_walk_km: number;
  narrative: string;
  mode: "llm" | "deterministic";
  estimated_spend?: TripSpend;
  sequence_note?: string | null;
  spread_note?: string | null;
}

/** What Gemini understood from the free-text "describe your day" (null when no
 *  description was given or the model was unavailable). */
export interface TripInterpretation {
  interests: string[];
  sequence?: string[];
  keep_close: boolean;
  summary: string;
}

export interface TripPlan {
  options: TripOption[];
  interests: string[];
  num_stops: number;
  end_time: string;
  start: { lat: number; lng: number; time: string };
  knobs?: TripKnobs;
  interpretation?: TripInterpretation | null;
}

export interface SavedTrip {
  id: number;
  title: string;
  params: Record<string, unknown>;
  stops: TripStop[];
  created_at: string;
  share_token?: string | null;
}

export interface SearchResponse {
  results: Business[];
  total: number;
  used_local_fallback: boolean;
  /** The radius that actually produced these results — the backend widens the
   *  circle until at least 10 small businesses are found (or 50 km). */
  radius_used_km: number;
  radius_expanded: boolean;
}

export interface Category {
  id: number;
  name: string;
}

export interface ReviewReply {
  body: string;
  owner_username: string;
  created_at: string;
}

export interface Review {
  id: number;
  business_id: number;
  user_id: number;
  username: string;
  rating: number;
  body: string;
  helpful_count: number;
  created_at: string;
  /** True when this review is backed by a verified visit (shows the badge). */
  is_verified?: boolean;
  reply: ReviewReply | null;
  /** Present on /reviews/mine (profile page). */
  business_name?: string;
}

/* ── Verified Visits ──────────────────────────────────────────────────── */

/** Enough of a live Google business to materialize a local row on first
 *  review/check-in — so any business nationwide is reviewable. */
export interface BusinessSnapshot {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  phone?: string;
  website?: string;
  price_level?: number;
}

export type VisitMethod =
  | "GPS_GEOFENCE"
  | "GPS_GEOFENCE_DWELL"
  | "QR_GEOFENCE"
  | "RECEIPT"
  | "MANUAL_CODE";

export type VisitStatus =
  | "PENDING"
  | "AWAITING_DWELL"
  | "VERIFIED"
  | "FAILED"
  | "REJECTED"
  | "EXPIRED";

/** The result of initiating a visit or submitting a checkpoint. */
export interface VisitResult {
  visit_id: number;
  business_id: number;
  business_name: string | null;
  status: VisitStatus;
  method: string;
  distance_m: number | null;
  verification_strength: number | null;
  needs_another_checkpoint: boolean;
  expires_at: string;
  verified_at: string | null;
  /** User-safe reason on a non-success terminal state (OUTSIDE_GEOFENCE etc.). */
  reason: string | null;
  message: string;
}

/** The rotating counter-code an owner displays on the kiosk. */
export interface CheckinCode {
  business_id: number;
  business_name: string;
  token: string;
  period_seconds: number;
}

/** A row in the user's visit history / passport (GET /visits/mine). */
export interface MyVisit {
  id: number;
  business_id: number;
  business_name: string;
  method: string;
  status: VisitStatus;
  verified_at: string | null;
  verification_strength: number | null;
  spend_cents: number | null;
  initiated_at: string;
}

/* ── Passport (§17) ───────────────────────────────────────────────────── */

export interface PassportBadge {
  key: string;
  label: string;
  icon: string;
  desc: string;
  have: number;
  need: number;
  earned: boolean;
}

export interface Passport {
  total_verified: number;
  distinct_businesses: number;
  streak_days: number;
  money_local_cents: number;
  badges: PassportBadge[];
  recent: MyVisit[];
}

/** A "For you" pick: a business plus the human-readable why. */
export interface Recommendation extends Business {
  recommendation_score: number;
  reason: string;
}

/** Cashier-mode result: what the owner sees when checking a customer code. */
export interface CodeVerification {
  status: "valid" | "marked_used" | "already_used" | "not_found";
  code?: string;
  deal_title?: string;
  discount_pct?: number;
  business_name?: string;
  customer?: string;
  redeemed_at?: string;
  verified_at?: string;
}

export interface Favorite {
  id: number;
  business_ref: string;
  snapshot: Partial<Business> & { name: string };
  created_at: string;
}

export interface Deal {
  id: number;
  business_id: number;
  business_name: string | null;
  title: string;
  discount_pct: number;
  per_user_limit: number;
  total_limit: number | null;
  redemption_count: number;
  starts_at: string;
  ends_at: string;
}

export interface Redemption {
  deal_id: number;
  code: string;
  redeemed_at: string;
  title: string;
  discount_pct: number;
  business_name: string | null;
}

export interface ChatTurn {
  reply: string;
  businesses: Business[];
  session_id: number;
  intent: { intent: string; search_query: string | null };
  /** "llm" when Gemini answered; "deterministic" when the fallback did. */
  mode: "llm" | "deterministic";
}

/** One pipeline-gate row in the glass-box trail (owner record → registry →
 *  verdict cache → Gemini audit). */
export interface VerdictCheck {
  step: "owner_record" | "chain_registry" | "verdict_cache" | "gemini";
  outcome: string; // matched | passed | hit | miss | answered | unavailable | skipped
  detail: string;
}

/** The full classification provenance for one business (GET /signals). */
export interface ClassifierVerdict {
  ref: string;
  name: string;
  verdict: "chain" | "small";
  is_small: boolean;
  source: "known-registry" | "gemini" | "local-owner" | "unverified-offline";
  reason: string;
  confidence: number;
  checks: VerdictCheck[];
  owner_declared_independent?: boolean | null;
}

/* ── Owner analytics (the customizable report, §11) ─────────────────────── */

export type MetricKey =
  | "summary"
  | "rating_distribution"
  | "reviews_trend"
  | "deals"
  | "redemptions_trend"
  | "views_trend"
  | "funnel";

export interface ReportSummary {
  average_rating: number;
  review_count: number;
  favorites: number;
  deal_redemptions: number;
  views: number;
}

export interface Funnel {
  views: number;
  favorites: number;
  redemptions: number;
  view_to_favorite_pct: number;
  favorite_to_redemption_pct: number;
  view_to_redemption_pct: number;
}

export interface Report {
  business_id: number;
  from: string;
  to: string;
  metrics: MetricKey[];
  summary?: ReportSummary;
  rating_distribution?: { rating: number; count: number }[];
  reviews_trend?: { day: string; count: number; avg_rating: number }[];
  deals?: {
    id: number;
    title: string;
    discount_pct: number;
    total_limit: number | null;
    redemption_count: number;
    redemptions_in_range: number;
  }[];
  redemptions_trend?: { day: string; count: number }[];
  views_trend?: { day: string; count: number }[];
  funnel?: Funnel;
}

/** Search filter state, kept in one object so it can sync with the URL.
 *  (No "independent only" — hiding chains is the product, not a filter.) */
export interface SearchFilters {
  q: string;
  categories: string[];
  min_rating: number;
  price_levels: number[];
  open_now: boolean;
  sort: "best_match" | "distance" | "rating" | "reviews";
}
