import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

/** Entry for VITE_SITE_MODE=chart (default) — the trading chart app, unchanged. */
export function mount(el: HTMLElement) {
  // One-time cleanup: the Trade Checklist panel was removed; drop its leftover
  // saved state. Harmless no-op once the key is gone.
  try { localStorage.removeItem('dsa-trade-checklist'); } catch { /* storage blocked */ }

  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
