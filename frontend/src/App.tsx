import { Toolbar } from './components/UI/Toolbar';
import { StatusBar } from './components/UI/StatusBar';
import { SymbolList } from './components/Sidebar/SymbolList';
import { MarketInfo } from './components/Sidebar/MarketInfo';
import { ChartContainer } from './components/Chart/ChartContainer';
import { WhaleTicker } from './components/Overlay/WhaleTicker';
import { useChartStore } from './store/chartStore';

export default function App() {
  const whaleActive = useChartStore((s) => s.visibleOverlays.has('whaleMarkers'));

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-white overflow-hidden">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 flex flex-col flex-shrink-0">
          <MarketInfo />
          {/* overflow-hidden + min-h-0 constrains SymbolList so WhaleTicker fits below */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <SymbolList />
          </div>
          {whaleActive && <WhaleTicker />}
        </aside>
        <main className="flex-1 overflow-hidden">
          <ChartContainer />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
