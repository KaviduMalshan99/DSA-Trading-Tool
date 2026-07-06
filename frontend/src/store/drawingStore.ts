import { create } from 'zustand';

// The six options TradingView shows under the first ("cursor") toolbar button.
export type CursorMode = 'cross' | 'dot' | 'arrow' | 'demonstration' | 'magic' | 'eraser';
export const CURSOR_MODES: readonly CursorMode[] = ['cross', 'dot', 'arrow', 'demonstration', 'magic', 'eraser'];

export type DrawingTool = CursorMode | 'trendline' | 'hline' | 'rectangle' | 'fibonacci';

export interface TrendLineDrawing {
  id: string;
  type: 'trendline';
  price1: number; time1: number;
  price2: number; time2: number;
}

export interface HLineDrawing {
  id: string;
  type: 'hline';
  price: number;
}

export interface RectangleDrawing {
  id: string;
  type: 'rectangle';
  price1: number; time1: number;
  price2: number; time2: number;
}

export interface FibonacciDrawing {
  id: string;
  type: 'fibonacci';
  priceHigh: number; timeHigh: number;
  priceLow: number;  timeLow: number;
}

export type Drawing = TrendLineDrawing | HLineDrawing | RectangleDrawing | FibonacciDrawing;

interface DrawingState {
  activeTool: DrawingTool;
  // The cursor-group tool last picked from the dropdown — kept separate from
  // activeTool so the toolbar button icon survives switching to a drawing tool.
  lastCursorMode: CursorMode;
  // "Magic" cursor: while true, drawing tools snap new points to candle OHLC.
  magnetEnabled: boolean;
  drawings: Drawing[];
  selectedId: string | null;

  setTool: (tool: DrawingTool) => void;
  addDrawing: (drawing: Drawing) => void;
  deleteDrawing: (id: string) => void;
  selectDrawing: (id: string | null) => void;
  clearAll: () => void;
  loadDrawings: (drawings: Drawing[]) => void;
}

function isCursorMode(tool: DrawingTool): tool is CursorMode {
  return (CURSOR_MODES as readonly string[]).includes(tool);
}

export const useDrawingStore = create<DrawingState>((set) => ({
  activeTool: 'cross',
  lastCursorMode: 'cross',
  magnetEnabled: false,
  drawings: [],
  selectedId: null,

  setTool: (tool) =>
    set((s) => {
      const cursorGroup = isCursorMode(tool);
      // Re-clicking the active drawing tool deselects it back to the last cursor mode.
      const activeTool = !cursorGroup && s.activeTool === tool ? s.lastCursorMode : tool;
      return {
        activeTool,
        lastCursorMode: cursorGroup ? tool : s.lastCursorMode,
        magnetEnabled: cursorGroup ? tool === 'magic' : s.magnetEnabled,
      };
    }),
  addDrawing: (drawing) => set((s) => ({ drawings: [...s.drawings, drawing] })),
  deleteDrawing: (id) =>
    set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id), selectedId: null })),
  selectDrawing: (id) => set({ selectedId: id }),
  clearAll: () => set({ drawings: [], selectedId: null }),
  loadDrawings: (drawings) => set({ drawings }),
}));
