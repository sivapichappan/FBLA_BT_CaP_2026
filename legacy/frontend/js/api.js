/* ─── API Client ─────────────────────────────────────────────────────── */

// On Vercel the frontend and API share an origin, so a relative '/api' is rewritten
// to the serverless function. In local dev the static server (:3000) and the FastAPI
// backend (:5001) are separate origins, so point straight at the backend port.
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? `http://${location.hostname}:5001/api`
  : '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function apiGet(path, params) {
  let url = API_BASE + path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || err.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || err.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || err.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function apiDelete(path, body) {
  const opts = { method: 'DELETE', headers: getAuthHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || err.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/* ─── Endpoint wrappers ──────────────────────────────────────────────── */

const businessApi = {
  search: (params) => apiGet('/businesses/search', params),
  getById: (id) => apiGet(`/businesses/${id}`),
  getCategories: () => apiGet('/businesses/categories'),
  geocode: (address) => apiGet('/businesses/geocode', { address }),
  autocomplete: (input) => apiGet('/businesses/autocomplete', { input }),
};

const reviewApi = {
  getBusinessReviews: (id, params) => apiGet(`/reviews/business/${id}`, params),
  create: (data) => apiPost('/reviews', data),
  update: (id, data) => apiPut(`/reviews/${id}`, data),
  delete: (id) => apiDelete(`/reviews/${id}`),
};

const favoriteApi = {
  getAll: () => apiGet('/favorites'),
  add: (data) => apiPost('/favorites', data),
  remove: (id) => apiDelete(`/favorites/${id}`),
  check: (id) => apiGet(`/favorites/check/${id}`),
};

const dealApi = {
  getBusinessDeals: (id) => apiGet(`/deals/business/${id}`),
  getAllActive: (params) => apiGet('/deals/active', params),
  redeem: (id) => apiPost(`/deals/${id}/redeem`),
};

const aiApi = {
  chat: (message, latitude, longitude, sessionToken) =>
    apiPost('/ai/chat', { message, latitude, longitude, sessionToken }),
};
