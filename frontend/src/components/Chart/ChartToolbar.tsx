import { useChartStore, type OverlayType } from '../../store/chartStore';
import { TimeframeDropdown } from '../UI/TimeframeDropdown';

const OVERLAYS: { key: OverlayType; label: string }[] = [
  { key: 'heatmap',       label: 'Heatmap'     },
  { key: 'footprint',     label: 'Footprint'   },
  { key: 'volumeProfile', label: 'Vol Profile' },
  { key: 'whaleMarkers',  label: 'Whales'      },
  { key: 'smc',           label: 'SMC'         },
];

export function ChartToolbar() {
  const { visibleOverlays, toggleOverlay } = useChartStore();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
      <TimeframeDropdown />

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
