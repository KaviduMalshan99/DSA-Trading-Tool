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
