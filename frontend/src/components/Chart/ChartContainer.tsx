import { useRef } from 'react';
import { type IChartApi } from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';
import { TradingChart } from './TradingChart';
import { ChartToolbar } from './ChartToolbar';
import { DeltaPanel } from '../Overlay/DeltaPanel';
import { HeatmapCanvas } from '../Overlay/HeatmapCanvas';
import { FootprintCanvas } from '../Overlay/FootprintCanvas';
import { VolumeProfile } from '../Overlay/VolumeProfile';
import { WhaleMarkers } from '../Overlay/WhaleMarkers';

export function ChartContainer() {
  const { visibleOverlays } = useChartStore();

  // Lifted ref: TradingChart populates it; DeltaPanel reads it for time-scale sync.
  const sharedChartRef = useRef<IChartApi | null>(null);

  return (
    <div className="flex flex-col h-full">
      <ChartToolbar />

      {/* Main candlestick area — 80% */}
      <div className="relative" style={{ flex: '4 4 0%', minHeight: 0 }}>
        <TradingChart sharedChartRef={sharedChartRef} />
        {visibleOverlays.has('heatmap')       && <HeatmapCanvas />}
        {visibleOverlays.has('footprint')     && <FootprintCanvas />}
        {visibleOverlays.has('volumeProfile') && <VolumeProfile />}
        {visibleOverlays.has('whaleMarkers')  && <WhaleMarkers />}
      </div>

      {/* Delta panel — 20%, separated by a thin border */}
      <div
        className="relative border-t border-[#21262d]"
        style={{ flex: '1 1 0%', minHeight: 0 }}
      >
        <DeltaPanel sharedChartRef={sharedChartRef} />
      </div>
    </div>
  );
}
