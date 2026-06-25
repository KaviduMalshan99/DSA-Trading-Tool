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

export interface HeatmapData {
  timestamps: number[];
  price_levels: number[];
  matrix: number[][];
}
