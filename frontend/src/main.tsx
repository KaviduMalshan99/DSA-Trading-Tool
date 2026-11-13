import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// One-time cleanup: the Trade Checklist panel was removed; drop its leftover
// saved state. Harmless no-op once the key is gone.
try { localStorage.removeItem('dsa-trade-checklist'); } catch { /* storage blocked */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
