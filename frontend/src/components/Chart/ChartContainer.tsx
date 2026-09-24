import { useRef } from 'react';
import { type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';
import { useIndicatorStore } from '../../store/indicatorStore';
import { TradingChart } from './TradingChart';
import { ReplayEngine } from './ReplayEngine';
import { ChartToolbar } from './ChartToolbar';
import { ChartLoadingOverlay } from './ChartLoadingOverlay';
import { DeltaPanel } from '../Overlay/DeltaPanel';
import { RSIPanel } from '../Overlay/RSIPanel';
import { StochRSIPanel } from '../Overlay/StochRSIPanel';
import { FootprintCanvas } from '../Overlay/FootprintCanvas';
import { HeatmapCanvas } from '../Overlay/HeatmapCanvas';
import { VolumeProfile } from '../Overlay/VolumeProfile';
import { WhaleMarkers } from '../Overlay/WhaleMarkers';
import { SMCOverlay } from '../Overlay/SMCOverlay';
import { LevelsOverlay } from '../Overlay/LevelsOverlay';
import { VWAPOverlay } from '../Overlay/VWAPOverlay';
import { EMAOverlay } from '../Overlay/EMAOverlay';
import { BollingerOverlay } from '../Overlay/BollingerOverlay';
import { SessionBoxes } from '../Overlay/SessionBoxes';
import { StructureOverlay } from '../Overlay/StructureOverlay';
import { AbsorptionOverlay } from '../Overlay/AbsorptionOverlay';
import { ContextDashboard } from '../Overlay/ContextDashboard';
import { ExecutionDashboard } from '../Overlay/ExecutionDashboard';
import { TradeChecklist } from '../Overlay/TradeChecklist';
import { ClusterScanner } from '../Overlay/ClusterScanner';
import { DrawingToolbar } from '../Drawing/DrawingToolbar';
import { DrawingCanvas } from '../Drawing/DrawingCanvas';
import { DrawingStyleToolbar } from '../Drawing/DrawingStyleToolbar';
import { FavoritesToolbar } from '../Drawing/FavoritesToolbar';
import { SHOW_DELTA_PANEL } from '../../config/topBarVisibility';

export interface ChartContainerProps {
  /** Lifted up to App so Toolbar's snapshot button can read/composite the live chart. */
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  chartAreaRef:    React.RefObject<HTMLDivElement>;
}

export function ChartContainer({ sharedChartRef, sharedSeriesRef, chartAreaRef }: ChartContainerProps) {
  const visibleOverlays = useChartStore((s) => s.visibleOverlays);
  const activeIndicators = useIndicatorStore((s) => s.activeIndicators);
  const activeSubPanel   = useIndicatorStore((s) => s.activeSubPanel);
  // Either bottom panel (pro Delta panel or the student indicator sub-panel)
  // takes a 1-share slice under the chart; with neither, the chart gets it all.
  const hasBottomPanel = SHOW_DELTA_PANEL || activeSubPanel !== null;
  // The line-mode series is only shared between TradingChart and ReplayEngine
  // (both mounted here), so it's owned here rather than lifted to App.
  const sharedLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  return (
    <div className="flex flex-col h-full">
      <ChartToolbar />

      {/* Drawing toolbar + chart area side by side */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      <DrawingToolbar />

      <div className="flex flex-col flex-1 overflow-hidden">
      {/* Main candlestick area — 80% with a bottom panel, full height without */}
      <div ref={chartAreaRef} className="relative bg-[var(--bg-app)]" style={{ flex: hasBottomPanel ? '4 4 0%' : '1 1 0%', minHeight: 0 }}>
        <TradingChart
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
          sharedLineSeriesRef={sharedLineSeriesRef}
        />

        {/* Non-visual — mounted right after TradingChart so the shared refs
            are already populated by the time its effects run. Always on
            (not gated by visibleOverlays), so entering Replay works
            regardless of which overlays are toggled. */}
        <ReplayEngine
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
          sharedLineSeriesRef={sharedLineSeriesRef}
        />

        <ChartLoadingOverlay />

        {/* Heatmap: renders AFTER TradingChart so refs are populated (React effects run in DOM order).
            z-0 keeps it below TradingChart's z-10; transparent chart bg lets it show through. */}
        {visibleOverlays.has('heatmap') && (
          <HeatmapCanvas
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}

        {/* Session bands are background context, so they render first among the
            z-10 overlays — later siblings (zones, levels, drawings) layer above. */}
        {visibleOverlays.has('sessions') && (
          <SessionBoxes sharedChartRef={sharedChartRef} />
        )}

        {/* Canvas overlays — positioned absolutely over the chart */}
        {visibleOverlays.has('footprint') && (
          <FootprintCanvas
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('volumeProfile') && (
          <VolumeProfile
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('whaleMarkers') && (
          <WhaleMarkers
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('smc') && (
          <SMCOverlay
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('levels') && (
          <LevelsOverlay
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {/* VWAP owns a real line series on the shared chart, so it only needs
            the chart ref — no canvas, no price-coordinate math. */}
        {visibleOverlays.has('vwap') && (
          <VWAPOverlay sharedChartRef={sharedChartRef} />
        )}
        {/* Student indicators — gated by indicatorStore, independent of the
            pro overlay visibility config. Own line series, like VWAP. */}
        {activeIndicators.has('ema') && (
          <EMAOverlay sharedChartRef={sharedChartRef} />
        )}
        {activeIndicators.has('bollinger') && (
          <BollingerOverlay sharedChartRef={sharedChartRef} />
        )}
        {visibleOverlays.has('structure') && (
          <StructureOverlay
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('absorption') && (
          <AbsorptionOverlay
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}

        {/* Drawing canvas — always on top */}
        <DrawingCanvas
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
        />

        {/* Floating style toolbar for the selected drawing (TradingView-style) */}
        <DrawingStyleToolbar
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
        />

        {/* Floating, draggable strip of starred tools — viewport-fixed, so it
            can be dragged anywhere regardless of where it's mounted */}
        <FavoritesToolbar />

        {/* Market Context Dashboard — mounted after DrawingCanvas so its
            collapse button stays clickable regardless of the active drawing
            tool's pointer-events handling. */}
        {visibleOverlays.has('context') && <ContextDashboard />}
        {visibleOverlays.has('execution') && <ExecutionDashboard />}
        {visibleOverlays.has('checklist') && <TradeChecklist />}
        {visibleOverlays.has('scanner') && <ClusterScanner />}
      </div>

      {/* Indicator sub-panel (RSI / Stoch RSI; MACD later) — one at a time,
          chosen in the Indicators menu. Independent of SHOW_DELTA_PANEL. Keyed
          by indicator so a swap fully remounts (fresh chart, clean teardown). */}
      {activeSubPanel && (
        <div
          key={activeSubPanel}
          className="relative border-t border-[var(--border-color-soft)]"
          style={{ flex: '1 1 0%', minHeight: 0 }}
        >
          {activeSubPanel === 'rsi' && <RSIPanel sharedChartRef={sharedChartRef} />}
          {activeSubPanel === 'stochRsi' && <StochRSIPanel sharedChartRef={sharedChartRef} />}
        </div>
      )}

      {/* Delta panel — 20%. Gated by config/topBarVisibility.ts (off in the Stage 1 student view). */}
      {SHOW_DELTA_PANEL && (
        <div
          className="relative border-t border-[var(--border-color-soft)]"
          style={{ flex: '1 1 0%', minHeight: 0 }}
        >
          <DeltaPanel sharedChartRef={sharedChartRef} />
        </div>
      )}
      </div>{/* end flex-col wrapper */}
      </div>{/* end flex row (toolbar + chart) */}
    </div>
  );
}
