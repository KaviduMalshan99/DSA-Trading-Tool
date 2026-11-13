import { useRef } from 'react';
import { type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useIndicatorStore } from '../../store/indicatorStore';
import { useTimezoneStore } from '../../store/timezoneStore';
import { TradingChart } from './TradingChart';
import { ReplayEngine } from './ReplayEngine';
import { ChartToolbar } from './ChartToolbar';
import { ChartLoadingOverlay } from './ChartLoadingOverlay';
import { SubPanelSlot } from './SubPanelSlot';
import { EMAOverlay } from '../Overlay/EMAOverlay';
import { BollingerOverlay } from '../Overlay/BollingerOverlay';
import { DrawingToolbar } from '../Drawing/DrawingToolbar';
import { DrawingCanvas } from '../Drawing/DrawingCanvas';
import { DrawingPaneProvider } from '../Drawing/DrawingPaneContext';
import { PriceScaleButtons } from './PriceScaleButtons';
import { ChartContextMenu } from './ChartContextMenu';
import { DrawingStyleToolbar } from '../Drawing/DrawingStyleToolbar';
import { FavoritesToolbar } from '../Drawing/FavoritesToolbar';

export interface ChartContainerProps {
  /** Lifted up to App so Toolbar's snapshot button can read/composite the live chart. */
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  chartAreaRef:    React.RefObject<HTMLDivElement>;
}

export function ChartContainer({ sharedChartRef, sharedSeriesRef, chartAreaRef }: ChartContainerProps) {
  const activeIndicators = useIndicatorStore((s) => s.activeIndicators);
  const timezone         = useTimezoneStore((s) => s.timezone);
  // Chart column (chart area + bottom panels) — SubPanelSlot measures it to
  // turn divider drag distance into a height ratio.
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The line-mode series is only shared between TradingChart and ReplayEngine
  // (both mounted here), so it's owned here rather than lifted to App.
  const sharedLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  return (
    <div className="flex flex-col h-full">
      <ChartToolbar />

      {/* Drawing toolbar + chart area side by side */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      <DrawingToolbar />

      {/* Keyed by timezone: a zone change fully remounts the chart, overlays
          and sub-panels so every series recomputes with the new offset (see
          chartTime.ts). Toolbars sit outside and stay mounted. The remount
          resets the view to the latest candles (historical reload). */}
      <div key={timezone} ref={wrapperRef} className="flex flex-col flex-1 overflow-hidden">
      {/* Main candlestick area — takes whatever height the bottom panels leave */}
      <div ref={chartAreaRef} data-drawing-pane="main" className="relative bg-[var(--bg-app)]" style={{ flex: '1 1 0%', minHeight: 0 }}>
        <TradingChart
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
          sharedLineSeriesRef={sharedLineSeriesRef}
        />

        {/* Non-visual — mounted right after TradingChart so the shared refs
            are already populated by the time its effects run. Always on,
            so entering Replay works regardless of which indicators are active. */}
        <ReplayEngine
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
          sharedLineSeriesRef={sharedLineSeriesRef}
        />

        <ChartLoadingOverlay />

        {/* Indicators — gated by indicatorStore. Each owns its own line
            series on the shared chart. */}
        {activeIndicators.has('ema') && (
          <EMAOverlay sharedChartRef={sharedChartRef} />
        )}
        {activeIndicators.has('bollinger') && (
          <BollingerOverlay sharedChartRef={sharedChartRef} />
        )}

        <DrawingPaneProvider paneId="main" kind="price" chartRef={sharedChartRef} seriesRef={sharedSeriesRef}>
          {/* Drawing canvas — always on top */}
          <DrawingCanvas />

          {/* "A" (auto-scale) / "L" (log) buttons in the price-axis × time-axis
              corner — after DrawingCanvas and z-60 so they stay clickable while
              a drawing tool is active. */}
          <PriceScaleButtons chartRef={sharedChartRef} />

          {/* Floating style toolbar for the selected drawing (TradingView-style) */}
          <DrawingStyleToolbar />
        </DrawingPaneProvider>

        {/* Floating, draggable strip of starred tools — viewport-fixed, so it
            can be dragged anywhere regardless of where it's mounted */}
        <FavoritesToolbar />

        {/* Right-click menu (Copy/Paste, Remove tools/indicators, Reset chart, Settings) —
            listens for contextmenu on the chart column (main chart area + sub-panel
            slot) and opens over any drawing pane in it; renders portalled to body. */}
        <ChartContextMenu sharedChartRef={sharedChartRef} containerRef={wrapperRef} />
      </div>

      {/* Indicator sub-panel (RSI / Stoch RSI / MACD) with its resize divider —
          one at a time, chosen in the Indicators menu. Renders nothing when
          no sub-panel is active; owns its own store subscriptions so dragging
          doesn't re-render this tree. */}
      <SubPanelSlot wrapperRef={wrapperRef} sharedChartRef={sharedChartRef} />
      </div>{/* end flex-col wrapper */}
      </div>{/* end flex row (toolbar + chart) */}
    </div>
  );
}
