import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export interface Business {
  id: string;
  name: string;
  category: string;
  description?: string;
  address: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  price_range?: string;
  hours_of_operation?: any;
  photo_urls?: string[];
  avg_rating: number;
  review_count: number;
  distance_km?: number;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  userName: string;
}

export interface Deal {
  id: string;
  business_id: string;
  title: string;
  description?: string;
  discount_amount?: string;
  expiration_date?: string;
  times_redeemed: number;
  redemption_limit?: number;
}

export const businessApi = {
  search: (params: any) => api.get<{ businesses: Business[] }>('/businesses/search', { params }),
  getById: (id: string) => api.get<{ business: Business }>(`/businesses/${id}`),
  create: (data: any) => api.post('/businesses', data),
  update: (id: string, data: any) => api.put(`/businesses/${id}`, data),
  getCategories: () => api.get<{ categories: string[] }>('/businesses/categories'),
};

export const reviewApi = {
  getBusinessReviews: (businessId: string, params?: any) =>
    api.get<{ reviews: Review[] }>(`/reviews/business/${businessId}`, { params }),
  create: (data: any) => api.post('/reviews', data),
  update: (id: string, data: any) => api.put(`/reviews/${id}`, data),
  delete: (id: string) => api.delete(`/reviews/${id}`),
};

export const favoriteApi = {
  getAll: () => api.get<{ favorites: Business[] }>('/favorites'),
  add: (businessId: string) => api.post('/favorites', { businessId }),
  remove: (businessId: string) => api.delete(`/favorites/${businessId}`),
  check: (businessId: string) => api.get<{ isFavorite: boolean }>(`/favorites/check/${businessId}`),
};

export const dealApi = {
  getBusinessDeals: (businessId: string) => api.get<{ deals: Deal[] }>(`/deals/business/${businessId}`),
  getAllActive: (params?: any) => api.get<{ deals: Deal[] }>('/deals/active', { params }),
  create: (data: any) => api.post('/deals', data),
  update: (id: string, data: any) => api.put(`/deals/${id}`, data),
  redeem: (dealId: string) => api.post(`/deals/${dealId}/redeem`),
};

export const analyticsApi = {
  getBusinessAnalytics: (businessId: string, params?: any) =>
    api.get(`/analytics/business/${businessId}`, { params }),
  getDealAnalytics: (businessId: string) => api.get(`/analytics/business/${businessId}/deals`),
};

export const aiApi = {
  chat: (message: string, latitude?: number, longitude?: number) =>
    api.post<{ response: string; suggestions?: any[] }>('/ai/chat', { message, latitude, longitude }),
};
