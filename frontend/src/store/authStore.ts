import { create } from 'zustand';
import { api, ApiError, type AuthUser } from '../services/api';

// Deliberately NOT persisted: the session lives in an httpOnly cookie and
// init() re-derives the user from /auth/me on every load.

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';
export type AuthModalMode = 'login' | 'signup';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
  /** Banner shown above the modal's form, e.g. a failed Google sign-in. */
  authModalError: string | null;

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  openAuthModal: (mode: AuthModalMode, error?: string) => void;
  closeAuthModal: () => void;
  clearAuthModalError: () => void;
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'checking',
  authModalOpen: false,
  authModalMode: 'login',
  authModalError: null,

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    try {
      const user = await api.authMe();
      set({ user, status: 'authenticated' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.error('[auth] session check failed', err);
      }
      set({ user: null, status: 'anonymous' });
    }
  },

  login: async (email, password) => {
    const { user } = await api.authLogin(email, password);
    set({ user, status: 'authenticated' });
  },

  signup: async (email, password) => {
    const { user } = await api.authSignup(email, password);
    set({ user, status: 'authenticated' });
  },

  logout: async () => {
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
    sessionHooks?.clearLocalSyncedData();
    window.location.reload();
  },

  openAuthModal: (mode, error) => set({ authModalOpen: true, authModalMode: mode, authModalError: error ?? null }),
  closeAuthModal: () => set({ authModalOpen: false, authModalError: null }),
  clearAuthModalError: () => set({ authModalError: null }),
}));
