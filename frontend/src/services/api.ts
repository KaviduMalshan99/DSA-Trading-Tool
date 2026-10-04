import type { Candle, CandleInterval, MarketType } from '../types/market';
import type {
  SMCData, LevelsData, VWAPData, StructureData, AbsorptionData,
} from '../types/analytics';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

/** Full-page navigation target that starts the Google OAuth flow (not a fetch). */
export function googleStartUrl(): string {
  return `${BASE_URL}/auth/google/start`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Matches backend UserOut. */
export interface AuthUser {
  id: number;
  email: string;
  auth_provider: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  /** E.164, e.g. +94771234567. */
  phone: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
  /** Google profile photo (never user-editable). */
  avatar_url: string | null;
  /** Epoch ms. */
  created_at: number;
  has_password: boolean;
  google_linked: boolean;
}

/** Matches backend ProfileUpdateIn: only present fields change; null clears. */
export type ProfilePatch = Partial<Pick<AuthUser, 'first_name' | 'last_name' | 'phone' | 'country'>>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Let the request outlive the page (pagehide). Browsers cap keepalive bodies at 64 KB. */
  keepalive?: boolean;
  /**
   * The request only makes sense with a live session, so a 401 means the session
   * ended (expired, or revoked from another device) and is reported to the
   * session-expired handler. Never set on login/signup/me, where 401 is an answer.
   */
  authRequired?: boolean;
}

// authStore imports this module, so it can't be imported back here without a
// cycle; it registers its handler at module load instead (same pattern as
// authStore.registerSessionHooks).
let sessionExpiredHandler: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

/** Matches backend SyncItemOut. */
interface SyncItem {
  key: string;
  value: string;
  version: number;
  updated_at: number;
}

/** Matches backend BatchItemIn. base_version null = insert (conflict if the key exists). */
interface SyncBatchItem {
  key: string;
  value: string;
  base_version: number | null;
}

/** Matches backend BatchResultOut. On conflict, version/updated_at are the server's current ones (null if missing). */
interface SyncBatchResult {
  key: string;
  status: 'ok' | 'conflict';
  version: number | null;
  updated_at: number | null;
}

// FastAPI errors are { detail: string } or, for 422s, { detail: [{ msg, ... }] }.
function extractDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('detail' in data)) return null;
  const detail = (data as { detail: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msg = (detail[0] as { msg?: unknown } | undefined)?.msg;
    if (typeof msg === 'string') return msg;
  }
  return null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, keepalive, authRequired } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    // Always send/receive the httpOnly session cookie (cross-origin in dev).
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive,
  });

  if (!res.ok) {
    let detail: string | null = null;
    try { detail = extractDetail(await res.json()); } catch { /* non-JSON error body */ }
    if (res.status === 401 && authRequired) sessionExpiredHandler?.();
    throw new ApiError(res.status, detail ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getCandles: (symbol: string, interval: CandleInterval, limit = 200) =>
    request<Candle[]>(`/candles/${symbol}?interval=${interval}&limit=${limit}`),

  searchSymbols: (q: string, market: MarketType = 'crypto') =>
    request<{ results: string[] }>(`/symbols/search?q=${q}&market=${market}`),

  getSMCZones: (symbol: string, interval: CandleInterval) =>
    request<SMCData>(`/indicators/smc/${symbol}?interval=${interval}`),

  getLevels: (symbol: string) =>
    request<LevelsData>(`/indicators/levels/${symbol}`),

  getSessionVWAP: (symbol: string, interval: CandleInterval) =>
    request<VWAPData>(`/indicators/vwap/${symbol}/${interval}`),

  // swing_strength is tunable server-side; the overlay uses the backend default (3)
  getStructure: (symbol: string, interval: CandleInterval, swingStrength?: number) =>
    request<StructureData>(
      `/indicators/structure/${symbol}/${interval}` +
        (swingStrength === undefined ? '' : `?swing_strength=${swingStrength}`)
    ),

  // volume_multiplier/range_fraction/lookback are tunable server-side; the
  // overlay uses the backend defaults (1.3 / 0.9 / 14) until thresholds are tuned
  getAbsorption: (
    symbol: string,
    interval: CandleInterval,
    params?: { volumeMultiplier?: number; rangeFraction?: number; lookback?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.volumeMultiplier !== undefined) qs.set('volume_multiplier', String(params.volumeMultiplier));
    if (params?.rangeFraction !== undefined) qs.set('range_fraction', String(params.rangeFraction));
    if (params?.lookback !== undefined) qs.set('lookback', String(params.lookback));
    const query = qs.toString();
    return request<AbsorptionData>(
      `/indicators/absorption/${symbol}/${interval}${query ? `?${query}` : ''}`
    );
  },

  // ── Auth (session lives in an httpOnly cookie; nothing is stored client-side) ──
  authSignup: (email: string, password: string) =>
    request<{ user: AuthUser }>('/auth/signup', { method: 'POST', body: { email, password } }),

  authLogin: (email: string, password: string) =>
    request<{ user: AuthUser }>('/auth/login', { method: 'POST', body: { email, password } }),

  authLogout: () =>
    request<void>('/auth/logout', { method: 'POST' }),

  authMe: () =>
    request<AuthUser>('/auth/me'),

  authUpdateProfile: (patch: ProfilePatch) =>
    request<AuthUser>('/auth/me', { method: 'PATCH', body: patch, authRequired: true }),

  /** On success the server re-issues this device's cookie and signs out every other session. */
  authChangePassword: (body: { current_password?: string; new_password: string }) =>
    request<AuthUser>('/auth/password', { method: 'POST', body, authRequired: true }),

  authLogoutAll: () =>
    request<void>('/auth/logout-all', { method: 'POST', authRequired: true }),

  // ── Account sync (Stage 4; requires the session cookie) ──
  syncGet: () =>
    request<{ items: SyncItem[] }>('/sync', { authRequired: true }),

  syncBatch: (items: SyncBatchItem[], opts: { keepalive?: boolean } = {}) =>
    request<{ results: SyncBatchResult[] }>('/sync/batch', {
      // A keepalive upload runs while the page unloads: nothing to redirect then.
      method: 'POST', body: { items }, keepalive: opts.keepalive, authRequired: !opts.keepalive,
    }),
};
