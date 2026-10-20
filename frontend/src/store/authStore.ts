import { create } from 'zustand';
import { api, ApiError, registerSessionExpiredHandler, type AuthUser, type Plan } from '../services/api';
import { accessUntil, daysLeftAt, nextBoundaryDelay, planAt, showBannerAt } from '../utils/subscription';

// Deliberately NOT persisted: the session lives in an httpOnly cookie and
// init() re-derives the user from /auth/me on every load.

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';
export type AuthModalMode = 'login' | 'signup';
export type ProfileTab = 'profile' | 'security' | 'subscription';

/** sessionStorage flag: the session ended under us; the reloaded page asks to log in again. */
const SESSION_EXPIRED_FLAG = 'dsa-session-expired';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
  /** Banner shown above the modal's form, e.g. a failed Google sign-in. */
  authModalError: string | null;
  profileOpen: boolean;
  profileTab: ProfileTab;
  /** server_now minus Date.now() when the user was last fetched: corrects for a skewed local clock. */
  clockOffset: number;
  /**
   * The server's clock as of the last tick (user fetched, or a day-count boundary
   * passed). Entitlement selectors read this rather than Date.now(), so they stay pure.
   */
  serverNow: number;

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Revoke every session of this account (all devices), then log out here. Throws if the request fails. */
  logoutAll: () => Promise<void>;
  /** Replace the user after a profile/password update. */
  setUser: (user: AuthUser) => void;
  /** Re-fetch /auth/me (plan, access dates). Concurrent calls share one request. */
  refreshMe: () => Promise<void>;
  /** Advance serverNow to the current (offset-corrected) time. */
  tick: () => void;
  /** A request that needs a session got 401: the session expired or was revoked elsewhere. */
  handleSessionExpired: () => Promise<void>;
  openAuthModal: (mode: AuthModalMode, error?: string) => void;
  closeAuthModal: () => void;
  clearAuthModalError: () => void;
  openProfile: (tab?: ProfileTab) => void;
  closeProfile: () => void;
}

// Module-level so StrictMode's double effect (and any re-mount) can't fire /auth/me twice.
let initStarted = false;

/** What logout needs from the account-sync engine (services/sync.ts). */
interface SessionHooks {
  flushNow: (timeoutMs: number) => Promise<void>;
  clearLocalSyncedData: () => void;
}

// The sync engine imports this store (it subscribes to auth status), so this
// store can't import it back without a cycle; the engine registers itself here
// from its start() instead.
let sessionHooks: SessionHooks | null = null;

export function registerSessionHooks(hooks: SessionHooks): void {
  sessionHooks = hooks;
}

/** Drop the account's synced data from this browser and reload so every store re-reads it. */
function endLocalSession(): void {
  sessionHooks?.clearLocalSyncedData();
  window.location.reload();
}

/**
 * True once, on the first page load after handleSessionExpired's reload (the flag
 * is consumed, so StrictMode's second effect run gets false).
 */
export function takeSessionExpiredNotice(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_FLAG) === null) return false;
    sessionStorage.removeItem(SESSION_EXPIRED_FLAG);
    return true;
  } catch {
    return false;
  }
}

// Set while the session is ending: several requests can fail with 401 at once
// (sync GET + batch), and a deliberate logout's own 401s aren't an expiry.
let expiring = false;

let refreshing: Promise<void> | null = null;

/** State for a freshly fetched user, re-measuring the clock offset from its server_now. */
function withUser(user: AuthUser): Pick<AuthState, 'user' | 'clockOffset' | 'serverNow'> {
  return { user, clockOffset: user.server_now - Date.now(), serverNow: user.server_now };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'checking',
  authModalOpen: false,
  authModalMode: 'login',
  authModalError: null,
  profileOpen: false,
  profileTab: 'profile',
  clockOffset: 0,
  serverNow: Date.now(),

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    try {
      const user = await api.authMe();
      set({ ...withUser(user), status: 'authenticated' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.error('[auth] session check failed', err);
      }
      set({ user: null, status: 'anonymous' });
    }
  },

  login: async (email, password) => {
    const { user } = await api.authLogin(email, password);
    set({ ...withUser(user), status: 'authenticated' });
  },

  signup: async (email, password) => {
    const { user } = await api.authSignup(email, password);
    set({ ...withUser(user), status: 'authenticated' });
  },

  logout: async () => {
    expiring = true; // always ends in a reload
    // Upload pending edits while the session cookie is still valid.
    try {
      await sessionHooks?.flushNow(3000);
    } catch { /* best effort */ }
    try {
      await api.authLogout();
    } catch (err) {
      console.error('[auth] logout request failed', err);
    } finally {
      set({ user: null, status: 'anonymous' });
    }
    // The account's synced data must not stay behind for the next (anonymous) user.
    // Reload so every store re-reads the now-empty localStorage.
    endLocalSession();
  },

  logoutAll: async () => {
    // Upload pending edits while the session cookie is still valid.
    try {
      await sessionHooks?.flushNow(3000);
    } catch { /* best effort */ }
    expiring = true;
    try {
      // Unlike logout, a failure here is reported: the other devices are still signed in.
      await api.authLogoutAll();
    } catch (err) {
      expiring = false;
      // A 401 means this session had already ended: run the normal expiry flow.
      if (err instanceof ApiError && err.status === 401) void get().handleSessionExpired();
      throw err;
    }
    set({ user: null, status: 'anonymous', profileOpen: false });
    endLocalSession();
  },

  setUser: (user) => set(withUser(user)),

  refreshMe: () => {
    if (get().status !== 'authenticated') return Promise.resolve();
    refreshing ??= (async () => {
      try {
        const user = await api.authMe();
        // A logout may have finished while the request was in flight.
        if (get().status === 'authenticated') set(withUser(user));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) void get().handleSessionExpired();
        else console.warn('[auth] refresh failed', err);
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },

  tick: () => set({ serverNow: Date.now() + get().clockOffset }),

  handleSessionExpired: async () => {
    if (expiring || get().status !== 'authenticated') return;
    expiring = true;
    // A request sent with the old cookie can lose a race with a password change
    // on this device, which re-issues the cookie. Confirm the session is really gone.
    try {
      const user = await api.authMe();
      set(withUser(user));
      expiring = false;
      return;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        // Can't tell (server unreachable): keep the session; the next request decides.
        expiring = false;
        return;
      }
    }
    // No flushNow: the cookie is already invalid, so pending edits can't be uploaded.
    set({ user: null, status: 'anonymous', profileOpen: false });
    try { sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1'); } catch { /* storage blocked */ }
    endLocalSession();
  },

  openAuthModal: (mode, error) => set({ authModalOpen: true, authModalMode: mode, authModalError: error ?? null }),
  closeAuthModal: () => set({ authModalOpen: false, authModalError: null }),
  clearAuthModalError: () => set({ authModalError: null }),
  openProfile: (tab = 'profile') => set({ profileOpen: true, profileTab: tab }),
  closeProfile: () => set({ profileOpen: false }),
}));

registerSessionExpiredHandler(() => { void useAuthStore.getState().handleSessionExpired(); });

// ── Entitlement selectors ─────────────────────────────────────────────────────

export const selectPlan = (s: AuthState): Plan | null => (s.user ? planAt(s.user, s.serverNow) : null);
export const selectDaysLeft = (s: AuthState): number => (s.user ? daysLeftAt(s.user, s.serverNow) : 0);
export const selectShowBanner = (s: AuthState): boolean =>
  s.status === 'authenticated' && s.user !== null && showBannerAt(s.user, s.serverNow);

// ── Expiry timer ──────────────────────────────────────────────────────────────
// Ticks serverNow at the next point where the rounded-up day count changes
// (nextBoundaryDelay), which includes the banner's start and the moment access
// ends; at the end, /auth/me is re-fetched for the server's verdict (a payment
// may have extended it). Timers run late in background tabs and across sleep,
// so the user is also re-fetched when the tab becomes visible and every 10 min.

const REFRESH_EVERY_MS = 10 * 60_000;

let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

function armBoundaryTimer(): void {
  clearTimeout(boundaryTimer);
  boundaryTimer = undefined;
  const { user, status, clockOffset } = useAuthStore.getState();
  if (status !== 'authenticated' || !user) return;
  const left = accessUntil(user) - (Date.now() + clockOffset);
  if (left <= 0) return;
  boundaryTimer = setTimeout(() => {
    boundaryTimer = undefined;
    const state = useAuthStore.getState();
    state.tick(); // re-arms through the subscription below
    if (state.user && accessUntil(state.user) <= Date.now() + state.clockOffset) void state.refreshMe();
  }, nextBoundaryDelay(left));
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') void useAuthStore.getState().refreshMe();
}

function setRefreshLoop(on: boolean): void {
  clearInterval(refreshTimer);
  refreshTimer = undefined;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (!on) return;
  refreshTimer = setInterval(() => { void useAuthStore.getState().refreshMe(); }, REFRESH_EVERY_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

useAuthStore.subscribe((s, prev) => {
  if (s.status !== prev.status) setRefreshLoop(s.status === 'authenticated');
  if (s.user !== prev.user || s.serverNow !== prev.serverNow || s.status !== prev.status) armBoundaryTimer();
});
