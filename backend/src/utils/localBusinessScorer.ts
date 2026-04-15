/**
 * Local Business Scorer — Multi-layered algorithm for detecting
 * independent, customer-facing businesses.
 *
 * Two dimensions:
 *   1. Independence Score (0-1): Is this an independent business (not a chain)?
 *   2. Customer-Facing Score (0-1): Can a customer walk in and interact?
 *
 * Three phases:
 *   Phase 0: Hard exclude non-customer-facing types
 *   Phase 1: Chain name dictionary lookup (O(1), ~500 brands)
 *   Phase 2: Heuristic scoring from 3 signals (name, reviews, type)
 */

import { matchChain } from '../data/chainBrands';

// --- Types ---

export interface ScoringResult {
  independence_score: number;
  customer_facing_score: number;
  local_badge: 'verified_local' | 'likely_local' | null;
  excluded: boolean;
  exclusion_reason?: string;
}

// --- Phase 0: Non-customer-facing type exclusion ---

const NON_CUSTOMER_FACING_TYPES = new Set([
  'corporate_office', 'manufacturer', 'supplier', 'wholesaler',
  'government_office', 'local_government_office', 'post_office',
  'fire_station', 'police', 'courthouse', 'embassy',
  'parking', 'parking_lot', 'parking_garage',
  'apartment_building', 'apartment_complex', 'condominium_complex',
  'research_institute', 'television_studio', 'cemetery',
  'transit_depot', 'transit_station', 'toll_station',
  'church', 'mosque', 'synagogue', 'hindu_temple',
  'school', 'primary_school', 'secondary_school', 'university',
  'library', 'city_hall', 'prison',
  'electric_vehicle_charging_station', 'atm',
]);

function isExcludedType(primaryType: string | null): boolean {
  if (!primaryType) return false;
  return NON_CUSTOMER_FACING_TYPES.has(primaryType);
}

// --- Phase 2: Heuristic signals ---

// Signal A: Name pattern analysis (weight 0.30)
function computeNameScore(name: string, address: string): number | null {
  let score = 0;
  let hasSignal = false;

  // Chain indicators
  if (/#\d{3,}|\bStore\s*\d+|\bUnit\s*\d{3,}/i.test(name)) {
    score -= 0.7; hasSignal = true;
  }
  if (/[®™]/.test(name)) {
    score -= 0.5; hasSignal = true;
  }
  // Short ALL-CAPS names (KFC, IHOP, etc.) — but not if it's just a normal short name
  if (/^[A-Z]{2,5}$/.test(name.trim())) {
    score -= 0.3; hasSignal = true;
  }

  // Local indicators
  // Possessive with personal name (Maria's, Tony's)
  if (/[A-Z][a-z]{2,}'s\b/.test(name)) {
    score += 0.4; hasSignal = true;
  }
  // "The" prefix with descriptive name (The Rusty Nail Pub)
  if (/^The\s+\w+\s+\w+/i.test(name)) {
    score += 0.25; hasSignal = true;
  }
  // Long creative names (4+ words) — "Salt & Pepper Southern Kitchen"
  if (name.split(/\s+/).length >= 4) {
    score += 0.15; hasSignal = true;
  }
  // Name contains a locality reference matching the address
  const addressLower = address.toLowerCase();
  const nameLower = name.toLowerCase();
  // Extract city-like words from address (after first comma, before state)
  const addressParts = addressLower.split(',');
  if (addressParts.length >= 2) {
    const city = addressParts[1]?.trim().split(/\s+/).slice(0, 2).join(' ');
    if (city && city.length > 3 && nameLower.includes(city)) {
      score += 0.3; hasSignal = true;
    }
  }

  return hasSignal ? Math.max(-1, Math.min(1, score)) : null;
}

// Signal C: Review count heuristic (weight 0.35)
function computeReviewCountScore(reviewCount: number, primaryType: string | null): number | null {
  if (reviewCount === undefined || reviewCount === null) return null;

  // High-traffic types get a 2x multiplier on thresholds
  const highTrafficTypes = [
    'restaurant', 'cafe', 'bar', 'bakery', 'fast_food_restaurant',
    'coffee_shop', 'hotel', 'tourist_attraction',
  ];
  const isHighTraffic = highTrafficTypes.some(t => primaryType?.includes(t));
  const m = isHighTraffic ? 2 : 1;

  if (reviewCount < 15 * m) return 0.3;
  if (reviewCount < 100 * m) return 0.1;
  if (reviewCount < 500 * m) return 0.0;
  if (reviewCount < 2000 * m) return -0.2;
  return -0.4;
}

// Signal F: Type prior probability (weight 0.35)
const TIER_1_CHAIN: Set<string> = new Set([
  'gas_station', 'fast_food_restaurant', 'convenience_store',
  'hotel', 'bank', 'car_rental', 'pharmacy', 'department_store',
  'supermarket', 'home_improvement_store', 'warehouse_store',
  'auto_parts_store', 'cell_phone_store', 'discount_store',
]);
const TIER_2_MODERATE_CHAIN: Set<string> = new Set([
  'coffee_shop', 'sandwich_shop', 'ice_cream_shop', 'pet_store',
  'shoe_store', 'fitness_center', 'car_repair', 'car_wash',
  'extended_stay_hotel', 'motel',
]);
const TIER_4_MODERATE_LOCAL: Set<string> = new Set([
  'cafe', 'bakery', 'fine_dining_restaurant', 'seafood_restaurant',
  'brewery', 'butcher_shop', 'jewelry_store', 'book_store',
  'hardware_store', 'mediterranean_restaurant', 'indian_restaurant',
  'japanese_restaurant', 'thai_restaurant', 'vietnamese_restaurant',
  'mexican_restaurant', 'italian_restaurant', 'chinese_restaurant',
  'korean_restaurant', 'greek_restaurant', 'turkish_restaurant',
  'brunch_restaurant', 'ramen_restaurant', 'sushi_restaurant',
  'vegetarian_restaurant', 'vegan_restaurant',
]);
const TIER_5_LOCAL: Set<string> = new Set([
  'art_gallery', 'art_studio', 'florist', 'tailor',
  'body_art_service', 'farmers_market', 'bed_and_breakfast',
  'performing_arts_theater', 'antique_store', 'gift_shop',
  'pawn_shop', 'second_hand_store', 'furniture_store',
  'lawn_care', 'locksmith', 'moving_company', 'plumber',
  'electrician', 'roofing_contractor',
]);

function computeTypePrior(primaryType: string | null): number | null {
  if (!primaryType) return null;
  if (TIER_1_CHAIN.has(primaryType)) return -0.5;
  if (TIER_2_MODERATE_CHAIN.has(primaryType)) return -0.2;
  if (TIER_4_MODERATE_LOCAL.has(primaryType)) return 0.2;
  if (TIER_5_LOCAL.has(primaryType)) return 0.4;
  return 0.0; // Tier 3 neutral
}

// --- Customer-Facing Score ---

const NON_CF_NAME_KEYWORDS = /\b(headquarters|hq|warehouse|distribution|wholesale only|corporate office|administrative|logistics|data center|call center|manufacturing|training center|fulfillment)\b/i;
const CF_NAME_KEYWORDS = /\b(shop|store|restaurant|café|cafe|salon|clinic|gallery|gym|studio|boutique|bakery|bar|pub|grill|diner|kitchen|market)\b/i;

function computeCustomerFacingScore(
  primaryType: string | null,
  businessStatus: string | null,
  name: string,
): number {
  let score = 0.5;

  // Type-based (primary signal)
  if (primaryType && NON_CUSTOMER_FACING_TYPES.has(primaryType)) {
    score -= 0.5;
  } else {
    score += 0.3;
  }

  // Business status
  if (businessStatus === 'CLOSED_PERMANENTLY') score -= 0.4;

  // Name keywords
  if (NON_CF_NAME_KEYWORDS.test(name)) score -= 0.3;
  if (CF_NAME_KEYWORDS.test(name)) score += 0.2;

  // Address signals (suite number parsing would go here with full address)
  // Skipped for search results — available in detail view

  return Math.max(0, Math.min(1, score));
}

// --- Main scoring function ---

export function scoreBusiness(business: any): ScoringResult {
  const name = business.name || '';
  const primaryType = business.primary_type || null;
  const address = business.address_line_1 || '';
  const reviewCount = business.review_count ?? 0;
  const businessStatus = business.business_status || null;

  // Phase 0: Hard type exclusion
  if (isExcludedType(primaryType)) {
    return {
      independence_score: 0,
      customer_facing_score: 0,
      local_badge: null,
      excluded: true,
      exclusion_reason: 'Non-customer-facing type',
    };
  }

  // Customer-facing score
  const customerFacingScore = computeCustomerFacingScore(primaryType, businessStatus, name);
  if (customerFacingScore < 0.3) {
    return {
      independence_score: 0,
      customer_facing_score: customerFacingScore,
      local_badge: null,
      excluded: true,
      exclusion_reason: 'Not customer-facing',
    };
  }

  // Phase 1: Chain name lookup
  const chainMatch = matchChain(name);
  if (chainMatch) {
    return {
      independence_score: 0.05,
      customer_facing_score: customerFacingScore,
      local_badge: null,
      excluded: true,
      exclusion_reason: `Known chain: ${chainMatch}`,
    };
  }

  // Phase 2: Heuristic scoring
  const signals: Array<{ weight: number; value: number }> = [];

  const nameScore = computeNameScore(name, address);
  if (nameScore !== null) signals.push({ weight: 0.30, value: nameScore });

  const reviewScore = computeReviewCountScore(reviewCount, primaryType);
  if (reviewScore !== null) signals.push({ weight: 0.35, value: reviewScore });

  const typeScore = computeTypePrior(primaryType);
  if (typeScore !== null) signals.push({ weight: 0.35, value: typeScore });

  // Compute weighted average
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  let independenceScore: number;

  if (totalWeight === 0) {
    // No signals fired — default to include (err on inclusion)
    independenceScore = 0.55;
  } else {
    const weightedSum = signals.reduce((sum, s) => sum + s.weight * s.value, 0) / totalWeight;
    independenceScore = (weightedSum + 1) / 2; // map [-1,+1] to [0,1]
  }

  // Classification
  const excluded = independenceScore < 0.3;
  let localBadge: 'verified_local' | 'likely_local' | null = null;
  if (!excluded) {
    localBadge = independenceScore >= 0.6 ? 'verified_local' : 'likely_local';
  }

  return {
    independence_score: Math.round(independenceScore * 100) / 100,
    customer_facing_score: Math.round(customerFacingScore * 100) / 100,
    local_badge: localBadge,
    excluded,
    exclusion_reason: excluded ? 'Independence score below threshold' : undefined,
  };
}

// --- Batch filter and score ---

export function filterAndScoreBusinesses(businesses: any[]): any[] {
  const results: any[] = [];

  for (const business of businesses) {
    const score = scoreBusiness(business);

    if (score.excluded) continue;

    results.push({
      ...business,
      independence_score: score.independence_score,
      customer_facing_score: score.customer_facing_score,
      local_badge: score.local_badge,
    });
  }

  // Sort by independence score descending (most local first)
  results.sort((a, b) => (b.independence_score || 0) - (a.independence_score || 0));

  return results;
}
