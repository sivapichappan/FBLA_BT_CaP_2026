import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach auth token to every request from the api instance
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  parent_id: number | null;
}

export interface Business {
  id: number | string;
  place_id?: string;
  name: string;
  slug?: string;
  description?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
  website?: string;
  email?: string;
  latitude: number;
  longitude: number;
  price_level?: number;
  is_local?: boolean;
  is_chain?: boolean;
  average_rating: number;
  review_count: number;
  distance_km?: number;
  is_open_now?: boolean | null;
  business_status?: string | null;
  category_name?: string;
  primary_type?: string | null;
  primary_type_display_name?: string | null;
  editorial_summary?: string | null;
  google_maps_uri?: string | null;
  weekday_descriptions?: string[];
  types?: string[];
  categories?: Category[];
  hours?: any[];
  photo_url?: string | null;
  photos?: any[];
  reviews?: any[];
  independence_score?: number | null;
  customer_facing_score?: number | null;
  local_badge?: 'verified_local' | 'likely_local' | null;
  source?: 'local' | 'google_places';
}

export interface Review {
  id: number;
  rating: number;
  title?: string;
  content?: string;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  };
}

export interface Deal {
  id: number;
  business_id: number;
  title: string;
  description?: string;
  discount_type: string;
  discount_value: number;
  end_date?: string;
  redemption_count: number;
  total_limit?: number;
  per_user_limit?: number;
  business_name?: string;
}

export const businessApi = {
  search: (params: any) => api.get<{ businesses: Business[] }>('/businesses/search', { params }),
  getById: (id: number | string) => api.get<{ business: Business }>(`/businesses/${id}`),
  create: (data: any) => api.post('/businesses', data),
  update: (id: number | string, data: any) => api.put(`/businesses/${id}`, data),
  getCategories: () => api.get<{ categories: Category[] }>('/businesses/categories'),
  geocode: (address: string) => api.get<{ latitude: number; longitude: number; formatted_address: string }>('/businesses/geocode', { params: { address } }),
};

export const reviewApi = {
  getBusinessReviews: (businessId: number, params?: any) =>
    api.get<{ reviews: Review[] }>(`/reviews/business/${businessId}`, { params }),
  create: (data: any) => api.post('/reviews', data),
  update: (id: number, data: any) => api.put(`/reviews/${id}`, data),
  delete: (id: number) => api.delete(`/reviews/${id}`),
};

export const favoriteApi = {
  getAll: () => api.get<{ favorites: any[] }>('/favorites'),
  add: (data: {
    businessId?: number;
    googlePlaceId?: string;
    placeName?: string;
    placeAddress?: string;
    placeRating?: number;
    placePhotoUrl?: string;
    placeType?: string;
  }) => api.post('/favorites', data),
  remove: (id: number | string) => api.delete(`/favorites/${id}`),
  check: (id: number | string) => api.get<{ isFavorite: boolean }>(`/favorites/check/${id}`),
};

export const dealApi = {
  getBusinessDeals: (businessId: number) => api.get<{ deals: Deal[] }>(`/deals/business/${businessId}`),
  getAllActive: (params?: any) => api.get<{ deals: Deal[] }>('/deals/active', { params }),
  create: (data: any) => api.post('/deals', data),
  update: (id: number, data: any) => api.put(`/deals/${id}`, data),
  redeem: (dealId: number) => api.post(`/deals/${dealId}/redeem`),
};

export const analyticsApi = {
  getBusinessAnalytics: (businessId: number, params?: any) =>
    api.get(`/analytics/business/${businessId}`, { params }),
  getDealAnalytics: (businessId: number) => api.get(`/analytics/business/${businessId}/deals`),
};

export const aiApi = {
  chat: (message: string, latitude?: number, longitude?: number, sessionToken?: string) =>
    api.post<{ response: string; sessionToken: string; suggestions?: any[] }>('/ai/chat', {
      message,
      latitude,
      longitude,
      sessionToken,
    }),
};
