import { create } from 'zustand';
import { VISIBLE_OVERLAYS } from '../config/topBarVisibility';

export type OverlayType =
  | 'heatmap' | 'footprint' | 'volumeProfile' | 'whaleMarkers'
  | 'smc' | 'levels' | 'vwap' | 'sessions' | 'structure' | 'context'
  | 'absorption' | 'execution' | 'checklist' | 'scanner';

interface ChartState {
  visibleOverlays: Set<OverlayType>;
  visibleRange: { from: number; to: number } | null;
  crosshairPrice: number | null;
  crosshairTime: number | null;
  // Ratio (3.0 = 300%) used by FootprintCanvas's dedicated Imbalance highlight —
  // a footprint-level setting, not a separate overlay, so it lives here rather
  // than in visibleOverlays. Default 300% per the Stage 3 Imbalance spec.
  imbalanceRatio: number;
  // Minimum run length of consecutive same-side diagonally-imbalanced levels
  // (using the same computeDiagonalFlags()/imbalanceRatio above) for
  // FootprintCanvas to mark a "stacked imbalance". Default 3 per the Stage 3
  // Stacked Imbalance spec.
  stackSize: number;

  toggleOverlay: (overlay: OverlayType) => void;
  setVisibleRange: (from: number, to: number) => void;
  setCrosshair: (price: number | null, time: number | null) => void;
  setImbalanceRatio: (ratio: number) => void;
  setStackSize: (size: number) => void;
}

export const useChartStore = create<ChartState>((set) => ({
  // Only released tools (config/topBarVisibility.ts) can be on at startup, so
  // a hidden tool — which has no toggle to switch it off — is never enabled.
  // Full pro-app default was new Set(['heatmap', 'smc', 'context']).
  visibleOverlays: new Set<OverlayType>(VISIBLE_OVERLAYS),
  visibleRange: null,
  crosshairPrice: null,
  crosshairTime: null,
  imbalanceRatio: 3.0,
  stackSize: 3,

  toggleOverlay: (overlay) =>
    set((state) => {
      const next = new Set(state.visibleOverlays);
      if (next.has(overlay)) {
        next.delete(overlay);
      } else {
        next.add(overlay);
      }
      return { visibleOverlays: next };
    }),

  setVisibleRange: (from, to) => set({ visibleRange: { from, to } }),
  setCrosshair: (crosshairPrice, crosshairTime) =>
    set({ crosshairPrice, crosshairTime }),
  setImbalanceRatio: (ratio) => set({ imbalanceRatio: ratio }),
  setStackSize: (size) => set({ stackSize: size }),
}));
