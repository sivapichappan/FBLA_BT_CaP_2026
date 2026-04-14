import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

export interface PlaceBusiness {
  place_id: string;
  name: string;
  vicinity: string;
  formatted_address?: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types?: string[];
  photos?: Array<{ photo_reference: string; width: number; height: number }>;
  opening_hours?: { open_now?: boolean };
  business_status?: string;
}

export interface PlaceDetail {
  place_id: string;
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types?: string[];
  geometry: { location: { lat: number; lng: number } };
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  photos?: Array<{ photo_reference: string; width: number; height: number }>;
  reviews?: Array<{
    author_name: string;
    rating: number;
    text: string;
    time: number;
    profile_photo_url?: string;
  }>;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

const mapTypeToCategory = (types: string[]): string => {
  const typeMap: Record<string, string> = {
    restaurant: 'Food & Drink',
    food: 'Food & Drink',
    meal_delivery: 'Food & Drink',
    meal_takeaway: 'Food & Drink',
    bakery: 'Food & Drink',
    bar: 'Food & Drink',
    cafe: 'Coffee & Tea',
    store: 'Shopping',
    shopping_mall: 'Shopping',
    clothing_store: 'Shopping',
    grocery_or_supermarket: 'Shopping',
    beauty_salon: 'Health & Beauty',
    hair_care: 'Health & Beauty',
    spa: 'Health & Beauty',
    gym: 'Fitness',
    car_repair: 'Automotive',
    car_dealer: 'Automotive',
    car_wash: 'Automotive',
    movie_theater: 'Entertainment',
    amusement_park: 'Entertainment',
    night_club: 'Entertainment',
    art_gallery: 'Arts & Culture',
    museum: 'Arts & Culture',
    plumber: 'Services',
    electrician: 'Services',
    lawyer: 'Services',
    accounting: 'Services',
    dentist: 'Services',
    doctor: 'Services',
    hospital: 'Services',
  };

  for (const type of types) {
    if (typeMap[type]) return typeMap[type];
  }
  return 'Other';
};

export const searchNearby = async (
  latitude: number,
  longitude: number,
  radius: number = 5000,
  keyword?: string,
  type?: string,
): Promise<PlaceBusiness[]> => {
  if (!API_KEY) {
    console.warn('Google Maps API key not set');
    return [];
  }

  try {
    const params: Record<string, any> = {
      location: `${latitude},${longitude}`,
      radius: Math.min(radius, 50000),
      type: type || 'establishment',
      key: API_KEY,
    };
    if (keyword) params.keyword = keyword;

    const response = await axios.get(`${BASE_URL}/nearbysearch/json`, { params });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Places API error:', response.data.status, response.data.error_message);
      return [];
    }

    return response.data.results || [];
  } catch (error) {
    console.error('Google Places nearby search error:', error);
    return [];
  }
};

export const getPlaceDetails = async (placeId: string): Promise<PlaceDetail | null> => {
  if (!API_KEY) return null;

  try {
    const response = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,price_level,types,geometry,opening_hours,photos,reviews,address_components',
        key: API_KEY,
      },
    });

    if (response.data.status !== 'OK') {
      console.error('Place details error:', response.data.status);
      return null;
    }

    return response.data.result;
  } catch (error) {
    console.error('Google Places detail error:', error);
    return null;
  }
};

export const getPhotoUrl = (photoReference: string, maxWidth: number = 400): string => {
  return `${BASE_URL}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${API_KEY}`;
};

export const formatPlaceAsBusiness = (place: PlaceBusiness) => {
  const category = mapTypeToCategory(place.types || []);
  return {
    id: `gp_${place.place_id}`,
    place_id: place.place_id,
    name: place.name,
    description: null,
    address_line_1: place.vicinity || place.formatted_address || '',
    city: '',
    state: '',
    zip_code: '',
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    average_rating: place.rating || 0,
    review_count: place.user_ratings_total || 0,
    price_level: place.price_level || null,
    category_name: category,
    categories: [{ id: 0, name: category, slug: category.toLowerCase().replace(/\s+/g, '-'), icon: null }],
    is_open_now: place.opening_hours?.open_now ?? null,
    photos: place.photos?.slice(0, 3).map(p => ({
      url: getPhotoUrl(p.photo_reference),
    })) || [],
    source: 'google_places' as const,
  };
};

export const formatPlaceDetailAsBusiness = (place: PlaceDetail) => {
  const category = mapTypeToCategory(place.types || []);

  let city = '';
  let state = '';
  let zipCode = '';
  if (place.address_components) {
    for (const comp of place.address_components) {
      if (comp.types.includes('locality')) city = comp.long_name;
      if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
      if (comp.types.includes('postal_code')) zipCode = comp.long_name;
    }
  }

  return {
    id: `gp_${place.place_id}`,
    place_id: place.place_id,
    name: place.name,
    description: null,
    address_line_1: place.formatted_address || '',
    city,
    state,
    zip_code: zipCode,
    phone: place.formatted_phone_number || null,
    website: place.website || null,
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    average_rating: place.rating || 0,
    review_count: place.user_ratings_total || 0,
    price_level: place.price_level || null,
    category_name: category,
    categories: [{ id: 0, name: category, slug: category.toLowerCase().replace(/\s+/g, '-'), icon: null }],
    is_open_now: place.opening_hours?.open_now ?? null,
    hours: place.opening_hours?.weekday_text?.map((text, i) => ({
      day_of_week: (i + 1) % 7,
      text,
      is_closed: text.toLowerCase().includes('closed'),
    })) || [],
    photos: place.photos?.slice(0, 10).map(p => ({
      url: getPhotoUrl(p.photo_reference),
    })) || [],
    reviews: place.reviews?.map(r => ({
      id: `gpr_${r.time}`,
      rating: r.rating,
      content: r.text,
      createdAt: new Date(r.time * 1000).toISOString(),
      user: {
        username: r.author_name,
        firstName: r.author_name.split(' ')[0],
        lastName: r.author_name.split(' ').slice(1).join(' '),
        profileImageUrl: r.profile_photo_url || null,
      },
    })) || [],
    source: 'google_places' as const,
  };
};
