import { create } from 'zustand';

export interface WhaleTrade {
  time:      number;   // epoch ms
  price:     number;
  quantity:  number;
  notional:  number;
  side:      'buy' | 'sell';
  is_maker:  boolean;
}

interface WhaleState {
  trades: WhaleTrade[];
  addTrades:   (incoming: WhaleTrade[]) => void;
  clearTrades: () => void;
}

export const useWhaleStore = create<WhaleState>((set) => ({
  trades: [],

  // Prepend incoming trades (newest first) and cap at 50
  addTrades: (incoming) =>
    set((state) => ({
      trades: [...incoming, ...state.trades].slice(0, 50),
    })),

  clearTrades: () => set({ trades: [] }),
}));
