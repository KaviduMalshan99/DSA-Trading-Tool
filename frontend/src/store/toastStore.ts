import { create } from 'zustand';

/** 'buy'/'sell' are fired alerts; 'success'/'error'/'info' are app feedback (account, etc.). */
export type ToastKind = 'buy' | 'sell' | 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  side: ToastKind;
  time: number;
}

// Ephemeral only — not persisted. A notification surviving a page reload
// would be reporting something stale as if it just happened.
interface ToastState {
  toasts: Toast[];
  addToast: (message: string, side: ToastKind) => void;
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
