export interface DeltaBar {
  timestamp: number;
  buy_volume: number;
  sell_volume: number;
  delta: number;
  cumulative_delta: number;
}

export interface FootprintRow {
  price_level: number;
  buy_volume: number;
  sell_volume: number;
  delta: number;
}

export interface FootprintBar {
  timestamp: number;
  ohlc: { o: number; h: number; l: number; c: number };
  total_volume: number;
  imbalances: number[];
  rows: FootprintRow[];
}

export interface VolumeProfileNode {
  price: number;
  volume: number;
  buy_volume: number;
  sell_volume: number;
  is_poc: boolean;
  in_value_area: boolean;
}

export interface SMCZone {
  type: string;
  high: number;
  low: number;
  ts: number;
  strength: number;
  mitigated?: boolean;
}

export interface SMCData {
  order_blocks: SMCZone[];
  fair_value_gaps: SMCZone[];
}

export interface LevelsData {
  daily_open: number;
  pdh: number;
  pdl: number;
  decimals: number;
}

export interface VWAPPoint {
  time: number;   // candle open time (ms) — shift via toChartTime before charting
  vwap: number;
}

export interface VWAPData {
  points: VWAPPoint[];
  current: number;
  session_start: number;
  decimals: number;
}

export type SwingLabel = 'HH' | 'LH' | 'HL' | 'LL';
export type MarketTrend = 'up' | 'down' | 'range';

export interface SwingPoint {
  time: number;   // candle open time (ms) — shift via toChartTime before charting
  price: number;
  type: 'high' | 'low';
  /** null for the first swing of each type — nothing to compare it against. */
  label: SwingLabel | null;
}

export interface StructureData {
  swings: SwingPoint[];
  current_trend: MarketTrend;
  swing_strength: number;
  decimals: number;
}

export interface HeatmapData {
  timestamps: number[];
  price_levels: number[];
  matrix: number[][];
}
