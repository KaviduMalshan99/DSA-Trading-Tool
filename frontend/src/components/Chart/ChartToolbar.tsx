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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
      <TimeframeDropdown />

      <div className="w-px h-4 bg-[var(--border-color)] mx-1" />

      <div className="flex gap-1">
        {OVERLAYS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleOverlay(key)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              visibleOverlays.has(key)
                ? 'bg-emerald-700 text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
