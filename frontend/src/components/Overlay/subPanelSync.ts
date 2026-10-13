/**
 * Two-way logical-range link between the main chart and the active indicator
 * sub-panel (RSI / Stoch RSI / MACD), so the panel scrolls and zooms like the
 * main chart and dragging it pans the main chart too.
 *
 * DeltaPanel stays one-way for the reason documented there: lightweight-charts
 * applies setVisibleLogicalRange on its next animation frame and fires the
 * range-change event then (or synchronously, from inside a later
 * getVisibleLogicalRange), so a same-tick flag alone can't catch the echo.
 * This link uses three layers:
 *  1. `syncing` — a shared re-entrancy flag set around every programmatic
 *     read+write below, which catches the synchronous echoes.
 *  2. An epsilon compare — the async echo arrives carrying the range we just
 *     wrote, which the other side already holds, so it's dropped.
 *  3. Panel → main forwarding only while the pointer is over (or pressed on)
 *     the panel, so the panel's own setData / resize refits never drive the
 *     main chart. The main chart stays the authority: it clamps whatever it
 *     receives and pushes the result back.
 */

import type { IChartApi, LogicalRange } from 'lightweight-charts';

const EPSILON = 1e-6;

/** Scroll/zoom options shared by every sub-panel (same as the main chart's defaults). */
export const SUB_PANEL_INTERACTION = {
  handleScroll: true,
  handleScale: {
    axisPressedMouseMove: { time: true, price: true },
    axisDoubleClickReset: { time: true, price: true },
    mouseWheel: true,
    pinch: true,
  },
} as const;

let syncing = false;
let activeSubPanelChart: IChartApi | null = null;

/** The mounted sub-panel's chart, if any (used by Reset chart). */
export const getActiveSubPanelChart = () => activeSubPanelChart;

const sameRange = (a: LogicalRange, b: LogicalRange) =>
  Math.abs(a.from - b.from) < EPSILON && Math.abs(a.to - b.to) < EPSILON;

function setRangeGuarded(target: IChartApi, range: LogicalRange) {
  if (syncing) return;
  syncing = true;
  try {
    const current = target.timeScale().getVisibleLogicalRange();
    if (current && sameRange(current, range)) return;
    target.timeScale().setVisibleLogicalRange(range);
  } finally {
    syncing = false;
  }
}

/**
 * Link `panel` to the main chart in `sharedChartRef`. `onMainRange` runs after
 * every main-chart range change (the panels re-match their axis width there).
 * Returns the teardown; call it before `panel.remove()`.
 */
export function linkSubPanel(
  sharedChartRef: React.RefObject<IChartApi | null>,
  panel: IChartApi,
  container: HTMLElement,
  onMainRange: () => void,
) {
  const mainChart = sharedChartRef.current;
  activeSubPanelChart = panel;

  let hovering = false;
  let pressed  = false;
  const onEnter = () => { hovering = true; };
  const onLeave = () => { hovering = false; };
  const onDown  = () => { pressed = true; };
  const onUp    = () => { pressed = false; };
  container.addEventListener('pointerenter', onEnter);
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  const onMain = (range: LogicalRange | null) => {
    if (!range) return;
    setRangeGuarded(panel, range);
    onMainRange();
  };
  const onPanel = (range: LogicalRange | null) => {
    if (!range || !mainChart || !(hovering || pressed)) return;
    setRangeGuarded(mainChart, range);
  };

  mainChart?.timeScale().subscribeVisibleLogicalRangeChange(onMain);
  panel.timeScale().subscribeVisibleLogicalRangeChange(onPanel);

  return () => {
    container.removeEventListener('pointerenter', onEnter);
    container.removeEventListener('pointerleave', onLeave);
    container.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    panel.timeScale().unsubscribeVisibleLogicalRangeChange(onPanel);
    // If TradingChart unmounted first its chart.remove() already disposed
    // the main chart — don't touch it (same guard as EMAOverlay).
    if (mainChart && sharedChartRef.current === mainChart) {
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onMain);
    }
    if (activeSubPanelChart === panel) activeSubPanelChart = null;
  };
}
