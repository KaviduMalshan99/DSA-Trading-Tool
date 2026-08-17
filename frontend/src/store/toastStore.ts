import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  side: 'buy' | 'sell';
  time: number;
}

// Ephemeral only — not persisted. A notification surviving a page reload
// would be reporting something stale as if it just happened.
interface ToastState {
  toasts: Toast[];
  addToast: (message: string, side: 'buy' | 'sell') => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, side) =>
    set((state) => ({
      toasts: [...state.toasts, { id: crypto.randomUUID(), message, side, time: Date.now() }],
    })),

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
