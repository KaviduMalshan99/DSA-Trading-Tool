import { useMarketStore } from '../../store/marketStore';
import { useChartStore, type OverlayType } from '../../store/chartStore';
import type { CandleInterval } from '../../types/market';

const INTERVALS: CandleInterval[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

const OVERLAYS: { key: OverlayType; label: string }[] = [
  { key: 'heatmap', label: 'Heatmap' },
  { key: 'footprint', label: 'Footprint' },
  { key: 'volumeProfile', label: 'Vol Profile' },
  { key: 'whaleMarkers', label: 'Whales' },
  { key: 'smc', label: 'SMC' },
];

export function ChartToolbar() {
  const { activeInterval, setInterval } = useMarketStore();
  const { visibleOverlays, toggleOverlay } = useChartStore();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
      <div className="flex gap-1">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              activeInterval === iv
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            {iv}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-[#30363d] mx-1" />

      <div className="flex gap-1">
        {OVERLAYS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleOverlay(key)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              visibleOverlays.has(key)
                ? 'bg-emerald-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
