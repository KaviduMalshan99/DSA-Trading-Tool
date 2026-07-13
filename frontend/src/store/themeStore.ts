import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'dsa-theme';

function loadInitial(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch { /* ignore malformed/blocked storage */ }
  return 'dark';
}

function applyDocumentTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initial = loadInitial();
// Applied eagerly at module load (before first render) so there's no flash of the wrong theme.
applyDocumentTheme(initial);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,

  setTheme: (theme) => {
    set({ theme });
    applyDocumentTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  },
}));
