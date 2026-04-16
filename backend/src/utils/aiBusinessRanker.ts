import { IntentType, ClassifiedIntent } from './intentClassifier';

export interface RankedBusiness {
  id: string;
  place_id?: string;
  name: string;
  description: string | null;
  editorial_summary: string | null;
  address_line_1: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  average_rating: number;
  review_count: number;
  price_level: number | null;
  primary_type: string | null;
  primary_type_display_name: string | null;
  category_name: string;
  is_open_now: boolean | null;
  independence_score: number | null;
  customer_facing_score: number | null;
  local_badge: string | null;
  photo_url: string | null;
  source: string;
  distance_km: number;
  composite_score: number;
}

// ─── Default Weights (sum = 1.00) ───────────────────────────────────────────

interface WeightSet {
  distance: number;
  rating: number;
  review_count: number;
  independence: number;
  customer_facing: number;
  price_match: number;
  category_match: number;
  open_status: number;
}

const DEFAULT_WEIGHTS: WeightSet = {
  distance: 0.25,
  rating: 0.22,
  review_count: 0.13,
  independence: 0.12,
  customer_facing: 0.08,
  price_match: 0.08,
  category_match: 0.07,
  open_status: 0.05,
};

// ─── Intent Multipliers ─────────────────────────────────────────────────────

const INTENT_MULTIPLIERS: Record<IntentType, Partial<WeightSet>> = {
  CHEAP_BUDGET:      { price_match: 4.0, distance: 0.8, rating: 0.7, independence: 1.2 },
  NEARBY_CLOSEST:    { distance: 3.5, rating: 0.5, review_count: 0.4, open_status: 2.0 },
  HIGHLY_RATED:      { rating: 3.0, review_count: 2.5, distance: 0.6, price_match: 0.5 },
  SPECIFIC_CATEGORY: { category_match: 4.0 },
  OPEN_NOW:          { open_status: 5.0, distance: 1.5, rating: 0.7 },
  SUPPORT_LOCAL:     { independence: 4.0, customer_facing: 2.0, distance: 0.8, rating: 0.9 },
  EXPLORATORY:       { distance: 0.6, rating: 0.8, review_count: 0.6, independence: 1.5 },
  GENERAL_CHAT:      {},
};

// ─── Normalization Functions (all return 0–1) ───────────────────────────────

/** Gaussian decay — closer businesses score higher */
function normalizeDistance(km: number, sigma: number = 2.0): number {
  return Math.exp(-(km ** 2) / (2 * sigma ** 2));
}

/** Bayesian average — penalizes businesses with few reviews toward global mean */
function normalizeRating(
  avgRating: number,
  reviewCount: number,
  globalMean: number = 3.7,
  minVotes: number = 15,
): number {
  if (reviewCount === 0) return globalMean / 5.0;
  const bayesian =
    (reviewCount / (reviewCount + minVotes)) * avgRating +
    (minVotes / (reviewCount + minVotes)) * globalMean;
  return bayesian / 5.0;
}

/** Log scale — prevents mega-chains from dominating via sheer volume */
function normalizeReviewCount(count: number, baseline: number = 50): number {
  return Math.min(1.0, Math.log(1 + count) / Math.log(1 + baseline));
}

/** Bidirectional price match — direction driven by intent */
function normalizePriceMatch(
  priceLevel: number | null,
  direction: 'cheap' | 'expensive' | null,
): number {
  if (priceLevel == null) return 0.5;
  if (direction === 'cheap') return (5 - priceLevel) / 4;
  if (direction === 'expensive') return priceLevel / 4;
  return 1.0 - Math.abs(priceLevel - 2.5) / 2.5; // mid-range peaks
}

/** Category match — simple keyword check between query and business type */
function normalizeCategoryMatch(
  businessType: string | null,
  searchQuery: string | null,
): number {
  if (!searchQuery) return 0.5; // no category specified → neutral
  if (!businessType) return 0.0;
  const biz = businessType.toLowerCase().replace(/_/g, ' ');
  const query = searchQuery.toLowerCase();
  if (biz.includes(query) || query.includes(biz)) return 1.0;
  // partial word overlap
  const queryWords = query.split(/\s+/);
  const bizWords = biz.split(/\s+/);
  const overlap = queryWords.filter(w => bizWords.some(bw => bw.includes(w) || w.includes(bw)));
  if (overlap.length > 0) return 0.7;
  return 0.0;
}

/** Open status — hard filter for OPEN_NOW intent, soft penalty otherwise */
function normalizeOpenStatus(
  isOpenNow: boolean | null,
  intent: IntentType,
): number | null {
  if (intent === 'OPEN_NOW' && isOpenNow === false) return null; // hard exclude
  if (isOpenNow === true) return 1.0;
  if (isOpenNow === false) return 0.3;
  return 0.5; // unknown
}

// ─── Weight Adjustment ──────────────────────────────────────────────────────

function computeIntentWeights(intent: IntentType): WeightSet {
  const mods = INTENT_MULTIPLIERS[intent];
  const result = { ...DEFAULT_WEIGHTS };
  let sum = 0;

  for (const key of Object.keys(result) as (keyof WeightSet)[]) {
    result[key] *= (mods[key] ?? 1.0);
    sum += result[key];
  }

  // Renormalize to sum = 1.0
  for (const key of Object.keys(result) as (keyof WeightSet)[]) {
    result[key] /= sum;
  }

  return result;
}

// ─── Haversine Distance ─────────────────────────────────────────────────────

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Main Ranking Function ──────────────────────────────────────────────────

export function rankBusinesses(
  businesses: any[],
  userLat: number,
  userLng: number,
  intent: ClassifiedIntent,
): RankedBusiness[] {
  const weights = computeIntentWeights(intent.intent);

  const scored: RankedBusiness[] = [];

  for (const biz of businesses) {
    const distKm = haversineDistance(userLat, userLng, biz.latitude, biz.longitude);

    // Check open status — hard filter for OPEN_NOW
    const openScore = normalizeOpenStatus(biz.is_open_now, intent.intent);
    if (openScore === null) continue; // excluded by hard filter

    const scores = {
      distance: normalizeDistance(distKm),
      rating: normalizeRating(biz.average_rating || 0, biz.review_count || 0),
      review_count: normalizeReviewCount(biz.review_count || 0),
      independence: (biz.independence_score ?? 0.5),
      customer_facing: (biz.customer_facing_score ?? 0.5),
      price_match: normalizePriceMatch(biz.price_level, intent.price_direction),
      category_match: normalizeCategoryMatch(
        biz.primary_type || biz.category_name,
        intent.search_query,
      ),
      open_status: openScore,
    };

    // Weighted dot product
    let compositeScore = 0;
    for (const key of Object.keys(weights) as (keyof WeightSet)[]) {
      compositeScore += weights[key] * scores[key];
    }

    scored.push({
      id: biz.id,
      place_id: biz.place_id,
      name: biz.name,
      description: biz.description || null,
      editorial_summary: biz.editorial_summary || null,
      address_line_1: biz.address_line_1 || '',
      city: biz.city || '',
      state: biz.state || '',
      latitude: biz.latitude,
      longitude: biz.longitude,
      average_rating: biz.average_rating || 0,
      review_count: biz.review_count || 0,
      price_level: biz.price_level ?? null,
      primary_type: biz.primary_type || null,
      primary_type_display_name: biz.primary_type_display_name || null,
      category_name: biz.category_name || 'Business',
      is_open_now: biz.is_open_now ?? null,
      independence_score: biz.independence_score ?? null,
      customer_facing_score: biz.customer_facing_score ?? null,
      local_badge: biz.local_badge || null,
      photo_url: biz.photo_url || null,
      source: biz.source || 'google_places',
      distance_km: Math.round(distKm * 100) / 100,
      composite_score: Math.round(compositeScore * 1000) / 1000,
    });
  }

  // Sort by composite score descending
  scored.sort((a, b) => b.composite_score - a.composite_score);

  return scored.slice(0, 15);
}
