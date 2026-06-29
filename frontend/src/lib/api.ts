/**
 * Typed API client — the single place the frontend talks to the backend (§5).
 * Owns the base URL, the bearer token, JSON parsing, and friendly errors.
 * Feature modules below group endpoints by resource.
 */

import type {
  AuthResponse,
  Business,
  Category,
  ChatTurn,
  CodeVerification,
  Deal,
  Favorite,
  Recommendation,
  Redemption,
  Report,
  Review,
  ReviewReply,
  RetimeResult,
  SavedTrip,
  SearchResponse,
  ClassifierVerdict,
  TripPlan,
  TripStop,
  User,
  VisitMethod,
  VisitResult,
  MyVisit,
  BusinessSnapshot,
  CheckinCode,
  Passport,
  UserReport,
} from "../types";

/** Build the materialize-on-write snapshot for a live Google business (so it
 *  becomes reviewable); returns undefined for businesses that already exist
 *  locally (a numeric ref → the server resolves it directly). */
export function businessSnapshot(b: Business): BusinessSnapshot | undefined {
  if (b.source !== "google") return undefined;
  return {
    name: b.name,
    lat: b.lat,
    lng: b.lng,
    address: b.address ?? undefined,
    phone: b.phone ?? undefined,
    website: b.website ?? undefined,
    price_level: b.price_level ?? undefined,
  };
}

const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

/**
 * Resolve a business photo reference to a loadable URL. Backend-proxied photos
 * are stored as relative paths ("/businesses/photo?name=…") so the Maps key
 * stays server-side; owner-supplied photos are absolute URLs and pass through.
 */
export function photoSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}

const TOKEN_KEY = "locallens_token";

/** Token lives in localStorage so a refresh keeps you signed in. */
export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Error carrying the HTTP status so callers can branch on 401/409/422. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Pull a human-readable message out of FastAPI error bodies (incl. 422 lists). */
function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    if (typeof b.detail === "string") return b.detail;
    if (Array.isArray(b.detail) && b.detail.length > 0) {
      // Pydantic 422: [{loc: ['body','field'], msg: '...'}] → "field: msg"
      const first = b.detail[0] as { loc?: unknown[]; msg?: string };
      const field = Array.isArray(first.loc)
        ? String(first.loc[first.loc.length - 1])
        : "";
      return field && first.msg
        ? `${field}: ${first.msg}`
        : (first.msg ?? `Invalid input (${status})`);
    }
  }
  return `Request failed (${status})`;
}

// Hard timeout on every request (§13): a hung backend call becomes a friendly
// error after 15 s instead of an infinite spinner.
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiError(
      timedOut
        ? "That took too long — please try again."
        : "Can't reach the server. Check your connection.",
      0,
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(extractMessage(body, res.status), res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown, timeoutMs?: number) =>
  request<T>(
    path,
    {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    timeoutMs,
  );
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

/* ── Endpoint groups ────────────────────────────────────────────────────── */

export const authApi = {
  register: (data: {
    email: string;
    password: string;
    username?: string;
    role?: "user" | "owner";
  }) => post<AuthResponse>("/auth/register", data),
  login: (email: string, password: string) =>
    post<AuthResponse>("/auth/login", { email, password }),
  // Exchange a Google ID token (the GIS "credential") for our app session.
  google: (credential: string) =>
    post<AuthResponse>("/auth/google", { credential }),
  me: () => get<User>("/auth/me"),
};

export const businessApi = {
  search: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
    }
    return get<SearchResponse>(`/businesses/search?${qs}`);
  },
  detail: (ref: string, lat?: number, lng?: number) => {
    const qs = new URLSearchParams();
    if (lat !== undefined) qs.set("lat", String(lat));
    if (lng !== undefined) qs.set("lng", String(lng));
    const suffix = qs.size ? `?${qs}` : "";
    return get<Business>(`/businesses/${encodeURIComponent(ref)}${suffix}`);
  },
  categories: () => get<Category[]>("/businesses/categories"),
  /** Glass-box: the classification provenance (which gate decided, and why). */
  signals: (ref: string) =>
    get<ClassifierVerdict>(`/businesses/${encodeURIComponent(ref)}/signals`),
  /** "What people love here" — cached LLM digest (null = hide the block). */
  summary: (businessId: number) =>
    get<{ summary: string | null }>(`/businesses/${businessId}/summary`),
  /** Address/city → coordinates (public; powers the location switcher). */
  geocode: (address: string) =>
    get<{ lat: number; lng: number; formatted_address: string }>(
      `/businesses/geocode?address=${encodeURIComponent(address)}`,
    ),
  /** Vibe (semantic) search; available=false when the AI is unreachable.
   *  Takes the same FilterBar params as classic search, so switching modes
   *  keeps the user's filters in force. */
  vibe: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
    }
    return get<{ available: boolean; results: Business[]; total: number }>(
      `/businesses/vibe?${qs}`,
    );
  },
};

export const tripApi = {
  plan: (data: {
    lat?: number;
    lng?: number;
    interests: string[];
    start_time: string;
    end_time: string;
    num_stops: number;
    goals?: string;
    // Optional personalisation knobs (idea 4/6/8); omit for the neutral default.
    audience?: "solo" | "couple" | "family" | "group";
    occasion?: "casual" | "date" | "celebrate";
    pace?: "relaxed" | "normal" | "packed";
    budget?: number; // 1=$ 2=$$ 3=$$$
    weekday?: number; // 0=Sun..6=Sat (open-on-arrival)
    accessible_only?: boolean; // build the day only from accessible stops
    locked_refs?: string[]; // stops kept when re-planning (idea 1)
    // Planning runs several live category searches; at a fresh location that's
    // legitimately slower than a normal call, so it gets a longer client budget.
  }) => post<TripPlan>("/trips/plan", data, 45_000),
  // Re-time an edited itinerary (server owns the clock math, idea 1).
  retime: (data: {
    start: { lat: number; lng: number; time: string };
    end_time: string;
    stops: TripStop[];
    dwell_overrides: Record<string, number>;
  }) => post<RetimeResult>("/trips/retime", data),
  save: (title: string, params: Record<string, unknown>, stops: TripStop[]) =>
    post<SavedTrip>("/trips", { title, params, stops }),
  mine: () => get<SavedTrip[]>("/trips"),
  remove: (id: number) => del<{ status: string }>(`/trips/${id}`),
  // Share + calendar export (idea 10c).
  share: (id: number) => post<{ share_token: string }>(`/trips/${id}/share`),
  sharedTrip: (token: string) =>
    get<SavedTrip>(`/trips/share/${encodeURIComponent(token)}`),
  icsUrl: (token: string) =>
    `${API_BASE}/trips/share/${encodeURIComponent(token)}.ics`,
};

export const recommendApi = {
  forYou: (lat?: number, lng?: number) => {
    const qs = new URLSearchParams();
    if (lat !== undefined) qs.set("lat", String(lat));
    if (lng !== undefined) qs.set("lng", String(lng));
    return get<Recommendation[]>(`/recommendations?${qs}`);
  },
};

export const reviewApi = {
  // ref is a local id ("12") or a Google ref ("gp_…"); both are reviewable.
  list: (ref: string, sort = "recent") =>
    get<Review[]>(
      `/businesses/${encodeURIComponent(ref)}/reviews?sort=${sort}`,
    ),
  mine: () => get<Review[]>("/reviews/mine"),
  /** Create a review. Pass a VERIFIED visit id to make it verified, and a
   *  snapshot to materialize a not-yet-local Google business. */
  create: (
    ref: string,
    rating: number,
    body: string,
    visitId?: number,
    snapshot?: BusinessSnapshot,
  ) =>
    post<Review>(`/businesses/${encodeURIComponent(ref)}/reviews`, {
      rating,
      body,
      visit_id: visitId,
      snapshot,
    }),
  update: (reviewId: number, data: { rating?: number; body?: string }) =>
    patch<Review>(`/reviews/${reviewId}`, data),
  remove: (reviewId: number) => del<{ status: string }>(`/reviews/${reviewId}`),
  helpful: (reviewId: number) =>
    post<{ helpful_count: number }>(`/reviews/${reviewId}/helpful`),
  reply: (reviewId: number, body: string) =>
    post<ReviewReply>(`/reviews/${reviewId}/reply`, { body }),
  deleteReply: (reviewId: number) =>
    del<{ status: string }>(`/reviews/${reviewId}/reply`),
};

/** Verified Visits: prove physical presence so a review can be marked verified. */
export const visitApi = {
  // ref is a local id or a Google ref; snapshot materializes a not-yet-local one.
  initiate: (ref: string, method: VisitMethod, snapshot?: BusinessSnapshot) =>
    post<VisitResult>("/visits/initiate", {
      business_ref: ref,
      method,
      snapshot,
    }),
  checkpoint: (
    visitId: number,
    data: {
      latitude: number;
      longitude: number;
      accuracy_m?: number;
      mock_location?: boolean;
      client_ts?: string;
      spend_cents?: number;
    },
  ) => post<VisitResult>(`/visits/${visitId}/checkpoint`, data),
  /** Verify with the counter code (QR_GEOFENCE) — geofence still required. */
  submitQr: (
    visitId: number,
    data: {
      token: string;
      latitude: number;
      longitude: number;
      accuracy_m?: number;
      mock_location?: boolean;
      client_ts?: string;
    },
  ) => post<VisitResult>(`/visits/${visitId}/qr`, data),
  get: (visitId: number) => get<VisitResult>(`/visits/${visitId}`),
  mine: () => get<MyVisit[]>("/visits/mine"),
  /** Record an optional self-reported spend on a verified visit. */
  setSpend: (visitId: number, spendCents: number) =>
    post<{ ok: boolean }>(`/visits/${visitId}/spend`, {
      spend_cents: spendCents,
    }),
};

/** The gamified check-in passport: badges, streak, money-kept-local. */
export const passportApi = {
  me: () => get<Passport>("/passport/me"),
};

export const favoriteApi = {
  list: () => get<Favorite[]>("/favorites"),
  add: (businessRef: string, snapshot: Partial<Business> & { name: string }) =>
    post<Favorite>("/favorites", { business_ref: businessRef, snapshot }),
  remove: (businessRef: string) =>
    del<{ status: string }>(`/favorites/${encodeURIComponent(businessRef)}`),
  check: (businessRef: string) =>
    get<{ is_favorite: boolean }>(
      `/favorites/check/${encodeURIComponent(businessRef)}`,
    ),
};

export const dealApi = {
  listActive: () => get<Deal[]>("/deals"),
  forBusiness: (businessId: number) =>
    get<Deal[]>(`/deals/business/${businessId}`),
  redeem: (dealId: number) => post<Redemption>(`/deals/${dealId}/redeem`),
  myRedemptions: () => get<Redemption[]>("/deals/redemptions"),
};

export const aiApi = {
  // The concierge runs a multi-step pipeline server-side (intent → Google search
  // → chain classifier → grounded reply), each step an LLM/Places round-trip, on
  // top of a possible serverless cold start. That legitimately overruns the
  // default 15 s budget, so give it a generous ceiling — otherwise the browser
  // aborts a request the backend is about to answer (the "I hit a snag" bug).
  chat: (message: string, sessionId?: number, lat?: number, lng?: number) =>
    post<ChatTurn>(
      "/ai/chat",
      { message, session_id: sessionId, lat, lng },
      60_000,
    ),
};

export const ownerApi = {
  /** The signed-in owner's businesses (dashboard selector). */
  mine: () => get<Business[] & { id?: number }[]>("/businesses/mine"),
  geocode: (address: string) =>
    get<{ lat: number; lng: number; formatted_address: string }>(
      `/businesses/geocode?address=${encodeURIComponent(address)}`,
    ),
  createBusiness: (data: unknown) =>
    post<{ id: number; name: string }>("/businesses", data),
  updateBusiness: (id: number, data: unknown) =>
    patch<Business & { id: number }>(`/businesses/${id}`, data),
  createDeal: (data: unknown) => post<Deal>("/deals", data),
  /** Cashier mode: check (and optionally consume) a customer's code. */
  verifyCode: (code: string, markUsed: boolean) =>
    post<CodeVerification>("/deals/verify-code", { code, mark_used: markUsed }),
  /** Verified Visits: turn on the rotating check-in code for a business. */
  enableQr: (businessId: number) =>
    post<{ enabled: boolean }>(`/businesses/${businessId}/qr/enable`),
  /** The current kiosk code to display (polled each period). */
  checkinCode: (businessId: number) =>
    get<CheckinCode>(`/businesses/${businessId}/checkin-code`),
  /** The customizable report (§11): date range + metric selection + granularity. */
  report: (
    businessId: number,
    params: {
      from?: string;
      to?: string;
      metrics?: string;
      granularity?: string;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.metrics) qs.set("metrics", params.metrics);
    if (params.granularity) qs.set("granularity", params.granularity);
    return get<Report>(`/analytics/business/${businessId}?${qs}`);
  },
};

/** The consumer's "My Local Impact" report (§11/§17) — same knobs as the owner
 *  report, scoped to the signed-in user (the id comes from the auth token). */
export const reportApi = {
  me: (params: {
    from?: string;
    to?: string;
    sections?: string;
    granularity?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.sections) qs.set("sections", params.sections);
    if (params.granularity) qs.set("granularity", params.granularity);
    return get<UserReport>(`/reports/me?${qs}`);
  },
};

export const api = {
  health: () =>
    get<{ status: string; service: string; online: boolean }>("/health"),
};
