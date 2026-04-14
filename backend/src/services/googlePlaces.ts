import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE_URL = 'https://places.googleapis.com/v1';

// --- Field masks ---

const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.regularOpeningHours.openNow',
  'places.photos',
  'places.businessStatus',
].join(',');

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'primaryType',
  'primaryTypeDisplayName',
  'regularOpeningHours',
  'photos',
  'businessStatus',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'reviews',
  'editorialSummary',
  'addressComponents',
].join(',');

// --- Category groups for diverse search ---

const CATEGORY_GROUPS = {
  eatDrink: ['restaurant', 'cafe', 'bar', 'bakery', 'coffee_shop', 'fast_food_restaurant'],
  shopServices: ['shopping_mall', 'clothing_store', 'grocery_store', 'hair_salon', 'bank', 'book_store'],
  doSee: ['park', 'museum', 'movie_theater', 'gym', 'tourist_attraction', 'library', 'spa'],
};

// --- Price level mapping ---

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// --- Core API functions ---

export const searchNearby = async (
  latitude: number,
  longitude: number,
  radius: number = 1000,
  includedTypes?: string[],
  maxResultCount: number = 10,
): Promise<any[]> => {
  if (!API_KEY) {
    console.warn('Google Maps API key not set');
    return [];
  }

  try {
    const body: any = {
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: Math.min(radius, 50000),
        },
      },
      maxResultCount,
    };

    if (includedTypes && includedTypes.length > 0) {
      body.includedTypes = includedTypes;
    }

    const response = await axios.post(
      `${BASE_URL}/places:searchNearby`,
      body,
      {
        headers: {
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': SEARCH_FIELDS,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.places || [];
  } catch (error: any) {
    console.error('Places API nearby search error:', error.response?.data || error.message);
    return [];
  }
};

export const searchNearbyDiverse = async (
  latitude: number,
  longitude: number,
  radius: number = 1000,
): Promise<any[]> => {
  const [eatDrink, shopServices, doSee] = await Promise.all([
    searchNearby(latitude, longitude, radius, CATEGORY_GROUPS.eatDrink, 10),
    searchNearby(latitude, longitude, radius, CATEGORY_GROUPS.shopServices, 10),
    searchNearby(latitude, longitude, radius, CATEGORY_GROUPS.doSee, 10),
  ]);

  // Round-robin merge for diversity
  const groups = [eatDrink, shopServices, doSee];
  const merged: any[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(...groups.map(g => g.length));

  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) {
        const place = group[i];
        const id = place.id;
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(place);
        }
      }
    }
  }

  return merged.slice(0, 20);
};

export const searchText = async (
  textQuery: string,
  latitude: number,
  longitude: number,
  radius: number = 5000,
): Promise<any[]> => {
  if (!API_KEY) return [];

  try {
    const response = await axios.post(
      `${BASE_URL}/places:searchText`,
      {
        textQuery,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: Math.min(radius, 50000),
          },
        },
        maxResultCount: 20,
      },
      {
        headers: {
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': SEARCH_FIELDS,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.places || [];
  } catch (error: any) {
    console.error('Places API text search error:', error.response?.data || error.message);
    return [];
  }
};

export const getPlaceDetails = async (placeId: string): Promise<any | null> => {
  if (!API_KEY) return null;

  try {
    const response = await axios.get(
      `${BASE_URL}/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': DETAIL_FIELDS,
        },
      },
    );

    return response.data;
  } catch (error: any) {
    console.error('Places API detail error:', error.response?.data || error.message);
    return null;
  }
};

// --- Photo URL ---

export const getPhotoUrl = (photoName: string, maxWidth: number = 400): string => {
  return `/api/photos?name=${encodeURIComponent(photoName)}&maxWidth=${maxWidth}`;
};

// --- Formatters ---

export const formatPlace = (place: any) => {
  const priceLevel = place.priceLevel ? (PRICE_LEVEL_MAP[place.priceLevel] ?? null) : null;
  const photoName = place.photos?.[0]?.name;

  return {
    id: `gp_${place.id}`,
    place_id: place.id,
    name: place.displayName?.text || 'Unknown',
    description: place.editorialSummary?.text || null,
    editorial_summary: place.editorialSummary?.text || null,
    address_line_1: place.formattedAddress || '',
    city: '',
    state: '',
    zip_code: '',
    latitude: place.location?.latitude || 0,
    longitude: place.location?.longitude || 0,
    average_rating: place.rating || 0,
    review_count: place.userRatingCount || 0,
    price_level: priceLevel,
    primary_type: place.primaryType || null,
    primary_type_display_name: place.primaryTypeDisplayName?.text || null,
    category_name: place.primaryTypeDisplayName?.text || place.primaryType?.replace(/_/g, ' ') || 'Business',
    types: place.primaryType ? [place.primaryType] : [],
    categories: place.primaryTypeDisplayName?.text
      ? [{ id: 0, name: place.primaryTypeDisplayName.text, slug: place.primaryType || '', icon: null }]
      : [],
    is_open_now: place.regularOpeningHours?.openNow ?? null,
    business_status: place.businessStatus || null,
    photo_url: photoName ? getPhotoUrl(photoName, 800) : null,
    photos: (place.photos || []).slice(0, 5).map((p: any) => ({
      url: getPhotoUrl(p.name, 800),
    })),
    source: 'google_places' as const,
  };
};

export const formatPlaceDetail = (place: any) => {
  const base = formatPlace(place);

  // Parse address components
  let city = '';
  let state = '';
  let zipCode = '';
  if (place.addressComponents) {
    for (const comp of place.addressComponents) {
      const types = comp.types || [];
      if (types.includes('locality')) city = comp.longText || comp.shortText || '';
      if (types.includes('administrative_area_level_1')) state = comp.shortText || '';
      if (types.includes('postal_code')) zipCode = comp.longText || '';
    }
  }

  return {
    ...base,
    city,
    state,
    zip_code: zipCode,
    phone: place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
    google_maps_uri: place.googleMapsUri || null,
    weekday_descriptions: place.regularOpeningHours?.weekdayDescriptions || [],
    hours: place.regularOpeningHours?.weekdayDescriptions?.map((text: string, i: number) => ({
      day_of_week: (i + 1) % 7,
      text,
      is_closed: text.toLowerCase().includes('closed'),
    })) || [],
    reviews: (place.reviews || []).map((r: any) => ({
      id: `gpr_${r.publishTime || Date.now()}`,
      rating: r.rating || 0,
      title: null,
      content: r.text?.text || r.originalText?.text || '',
      createdAt: r.publishTime || new Date().toISOString(),
      user: {
        id: 0,
        username: r.authorAttribution?.displayName || 'Google User',
        firstName: (r.authorAttribution?.displayName || '').split(' ')[0],
        lastName: (r.authorAttribution?.displayName || '').split(' ').slice(1).join(' '),
        profileImageUrl: r.authorAttribution?.photoUri || null,
      },
    })),
  };
};
