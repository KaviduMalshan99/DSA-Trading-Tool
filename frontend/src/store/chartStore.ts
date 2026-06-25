import { create } from 'zustand';

export type OverlayType = 'heatmap' | 'footprint' | 'volumeProfile' | 'whaleMarkers' | 'smc';

interface ChartState {
  visibleOverlays: Set<OverlayType>;
  visibleRange: { from: number; to: number } | null;
  crosshairPrice: number | null;
  crosshairTime: number | null;

  toggleOverlay: (overlay: OverlayType) => void;
  setVisibleRange: (from: number, to: number) => void;
  setCrosshair: (price: number | null, time: number | null) => void;
}

export const useChartStore = create<ChartState>((set) => ({
  visibleOverlays: new Set(['heatmap', 'smc']),
  visibleRange: null,
  crosshairPrice: null,
  crosshairTime: null,

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
}));
