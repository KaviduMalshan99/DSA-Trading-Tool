import { useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Toolbar } from './components/UI/Toolbar';
import { StatusBar } from './components/UI/StatusBar';
import { SymbolList } from './components/Sidebar/SymbolList';
import { MarketInfo } from './components/Sidebar/MarketInfo';
import { SidebarRail } from './components/Sidebar/SidebarRail';
import { ChartContainer } from './components/Chart/ChartContainer';
import { WhaleTicker } from './components/Overlay/WhaleTicker';
import { useChartStore } from './store/chartStore';

export default function App() {
  const whaleActive = useChartStore((s) => s.visibleOverlays.has('whaleMarkers'));
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  // Lifted so the header's snapshot button can reach the live chart + its overlays.
  const sharedChartRef  = useRef<IChartApi | null>(null);
  const sharedSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartAreaRef    = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-white overflow-hidden">
      <Toolbar chartRef={sharedChartRef} chartAreaRef={chartAreaRef} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <ChartContainer
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
            chartAreaRef={chartAreaRef}
          />
        </main>
        {watchlistOpen && (
          <aside className="w-52 flex flex-col flex-shrink-0">
            <MarketInfo />
            {/* overflow-hidden + min-h-0 constrains SymbolList so WhaleTicker fits below */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <SymbolList />
            </div>
            {whaleActive && <WhaleTicker />}
          </aside>
        )}
        <SidebarRail open={watchlistOpen} onToggle={() => setWatchlistOpen((v) => !v)} />
      </div>
      <StatusBar />
    </div>
  );
}
