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

export function ChartContainer() {
  const { visibleOverlays } = useChartStore();

  // Lifted refs: TradingChart populates them; overlays read them for
  // coordinate mapping and time-scale synchronisation.
  const sharedChartRef  = useRef<IChartApi | null>(null);
  const sharedSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  return (
    <div className="flex flex-col h-full">
      <ChartToolbar />

      {/* Main candlestick area — 80% */}
      <div className="relative" style={{ flex: '4 4 0%', minHeight: 0 }}>
        <TradingChart
          sharedChartRef={sharedChartRef}
          sharedSeriesRef={sharedSeriesRef}
        />

        {/* Canvas overlays — positioned absolutely over the chart */}
        {visibleOverlays.has('footprint') && (
          <FootprintCanvas
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('heatmap') && <HeatmapCanvas />}
        {visibleOverlays.has('volumeProfile') && (
          <VolumeProfile
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
          />
        )}
        {visibleOverlays.has('whaleMarkers') && <WhaleMarkers />}
      </div>

      {/* Delta panel — 20% */}
      <div
        className="relative border-t border-[#21262d]"
        style={{ flex: '1 1 0%', minHeight: 0 }}
      >
        <DeltaPanel sharedChartRef={sharedChartRef} />
      </div>
    </div>
  );
}
