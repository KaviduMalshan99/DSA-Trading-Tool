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

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  openAuthModal: (mode: AuthModalMode) => void;
  closeAuthModal: () => void;
}

// Module-level so StrictMode's double effect (and any re-mount) can't fire /auth/me twice.
let initStarted = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'checking',
  authModalOpen: false,
  authModalMode: 'login',

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
    try {
      await api.authLogout();
    } catch (err) {
      console.error('[auth] logout request failed', err);
    } finally {
      set({ user: null, status: 'anonymous' });
    }
  },

  openAuthModal: (mode) => set({ authModalOpen: true, authModalMode: mode }),
  closeAuthModal: () => set({ authModalOpen: false }),
}));
