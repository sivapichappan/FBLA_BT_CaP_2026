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
}

/* ── Trip planner ────────────────────────────────────────────────────────── */

export type TripDuration = "quick" | "half" | "full";

export interface TripStop extends Business {
  slot: string;
  arrive: string;
  dwell_min: number;
  walk_from_prev_km: number;
  walk_from_prev_min: number;
}

/** One candidate itinerary. The planner returns several, each optimised for a
 *  different goal (best overall / top-rated / shortest walk) and made of
 *  different businesses — the user picks the one they like. */
export interface TripOption {
  key: string;
  label: string;
  stops: TripStop[];
  total_walk_km: number;
  narrative: string;
  mode: "llm" | "deterministic";
}

/** What Gemini understood from the free-text "describe your day" (null when no
 *  description was given or the model was unavailable). */
export interface TripInterpretation {
  interests: string[];
  keep_close: boolean;
  summary: string;
}

export interface TripPlan {
  options: TripOption[];
  duration: TripDuration;
  interests: string[];
  start: { lat: number; lng: number; time: string };
  interpretation?: TripInterpretation | null;
}

export interface SavedTrip {
  id: number;
  title: string;
  params: Record<string, unknown>;
  stops: TripStop[];
  created_at: string;
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
  reply: ReviewReply | null;
  /** Present on /reviews/mine (profile page). */
  business_name?: string;
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
