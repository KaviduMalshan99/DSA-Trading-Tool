import { CrosshairMode } from 'lightweight-charts';
import type { Theme } from '../../store/themeStore';

// Mirrors TradingChart.tsx's chartThemeOptions — native lightweight-charts
// canvas colors can't read CSS custom properties, so we hardcode the
// per-theme hex pairs that match the design tokens instead. Shared by the
// sub-panel charts under the main chart (RSI, MACD, StochRSI).
export function subChartThemeOptions(theme: Theme) {
  const grid = theme === 'dark' ? '#161b22' : '#e0e3eb';
  const gridHorz = theme === 'dark' ? '#1a2030' : '#e0e3eb';
  const text = theme === 'dark' ? '#c9d1d9' : '#4b5563';
  const border = theme === 'dark' ? '#21262d' : '#d1d4dc';
  const crosshair = theme === 'dark' ? '#3b82f6' : '#2196f3';
  const crosshairLabelBg = theme === 'dark' ? '#1e3a5f' : '#d6e8fb';
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: text,
    },
    grid: {
      vertLines: { color: grid },
      horzLines: { color: gridHorz },
    },
    crosshair: {
      // Follow the pointer freely — Magnet (the default) snaps onto the series value.
      mode: CrosshairMode.Normal,
      vertLine: { color: crosshair, labelBackgroundColor: crosshairLabelBg },
      horzLine: { color: crosshair, labelBackgroundColor: crosshairLabelBg },
    },
    leftPriceScale: { borderColor: border },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
  };
}
