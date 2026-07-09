import { useRef } from 'react';
import { type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';
import { TradingChart } from './TradingChart';
import { ChartToolbar } from './ChartToolbar';
import { DeltaPanel } from '../Overlay/DeltaPanel';
import { FootprintCanvas } from '../Overlay/FootprintCanvas';
import { HeatmapCanvas } from '../Overlay/HeatmapCanvas';
import { VolumeProfile } from '../Overlay/VolumeProfile';
import { WhaleMarkers } from '../Overlay/WhaleMarkers';
import { DrawingToolbar } from '../Drawing/DrawingToolbar';
import { DrawingCanvas } from '../Drawing/DrawingCanvas';
import { DrawingStyleToolbar } from '../Drawing/DrawingStyleToolbar';
import { FavoritesToolbar } from '../Drawing/FavoritesToolbar';

export function ChartContainer() {
  const { visibleOverlays } = useChartStore();

  // Lifted refs: TradingChart populates them; overlays read them for
  // coordinate mapping and time-scale synchronisation.
  const sharedChartRef  = useRef<IChartApi | null>(null);
  const sharedSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  return (
    <div className="flex flex-col h-full">
      <ChartToolbar />

      {/* Drawing toolbar + chart area side by side */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      <DrawingToolbar />

      <div className="flex flex-col flex-1 overflow-hidden">
      {/* Main candlestick area — 80% */}
      <div className="relative bg-[#0d1117]" style={{ flex: '4 4 0%', minHeight: 0 }}>
        <TradingChart
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
        />

        {/* Heatmap: renders AFTER TradingChart so refs are populated (React effects run in DOM order).
            z-0 keeps it below TradingChart's z-10; transparent chart bg lets it show through. */}
        {visibleOverlays.has('heatmap') && (
          <HeatmapCanvas
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
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
      </div>

      {/* Delta panel — 20% */}
      <div
        className="relative border-t border-[#21262d]"
        style={{ flex: '1 1 0%', minHeight: 0 }}
      >
        <DeltaPanel sharedChartRef={sharedChartRef} />
      </div>
      </div>{/* end flex-col wrapper */}
      </div>{/* end flex row (toolbar + chart) */}
    </div>
  );
}
