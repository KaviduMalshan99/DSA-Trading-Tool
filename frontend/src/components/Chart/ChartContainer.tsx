import { useCandles } from '../../hooks/useCandles';
import { useMarketSocket } from '../../hooks/useMarketSocket';
import { useChartStore } from '../../store/chartStore';
import { TradingChart } from './TradingChart';
import { ChartToolbar } from './ChartToolbar';
import { HeatmapCanvas } from '../Overlay/HeatmapCanvas';
import { FootprintCanvas } from '../Overlay/FootprintCanvas';
import { VolumeProfile } from '../Overlay/VolumeProfile';
import { WhaleMarkers } from '../Overlay/WhaleMarkers';

export function ChartContainer() {
  useCandles();
  useMarketSocket();
  const { visibleOverlays } = useChartStore();

  return (
    <div className="flex flex-col h-full">
      <ChartToolbar />
      <div className="relative flex-1">
        <TradingChart />
        {visibleOverlays.has('heatmap') && <HeatmapCanvas />}
        {visibleOverlays.has('footprint') && <FootprintCanvas />}
        {visibleOverlays.has('volumeProfile') && <VolumeProfile />}
        {visibleOverlays.has('whaleMarkers') && <WhaleMarkers />}
      </div>
    </div>
  );
}
