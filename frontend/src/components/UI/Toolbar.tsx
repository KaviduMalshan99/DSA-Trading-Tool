import { useEffect, useRef, useState } from 'react';
import type { IChartApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { captureChartSnapshot, canvasToBlob, downloadCanvas } from '../../utils/chartSnapshot';
import { ChartSettingsModal } from './ChartSettingsModal';

interface ToolbarProps {
  chartRef:     React.RefObject<IChartApi | null>;
  chartAreaRef: React.RefObject<HTMLDivElement>;
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function FullscreenEnterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function FullscreenExitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <path d="M9 3v3a2 2 0 0 1-2 2H4M15 3v3a2 2 0 0 0 2 2h3M9 21v-3a2 2 0 0 0-2-2H4M15 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const SNAPSHOT_ACTIONS = [
  { key: 'download', label: 'Download image' },
  { key: 'copy-image', label: 'Copy image' },
  { key: 'copy-link', label: 'Copy link' },
  { key: 'new-tab', label: 'Open in new tab' },
] as const;

function SnapshotMenu({ chartRef, chartAreaRef }: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeSymbol = useMarketStore((s) => s.activeSymbol);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const run = async (key: (typeof SNAPSHOT_ACTIONS)[number]['key']) => {
    setOpen(false);

    if (key === 'copy-link') {
      try { await navigator.clipboard.writeText(window.location.href); } catch { /* clipboard unavailable */ }
      return;
    }

    const chart = chartRef.current;
    const area  = chartAreaRef.current;
    if (!chart || !area) return;
    const canvas = captureChartSnapshot(chart, area);

    if (key === 'download') {
      downloadCanvas(canvas, `${activeSymbol}_${Date.now()}.png`);
    } else if (key === 'copy-image') {
      try {
        const blob = await canvasToBlob(canvas);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch { /* clipboard image write unsupported/blocked */ }
    } else if (key === 'new-tab') {
      try {
        const blob = await canvasToBlob(canvas);
        window.open(URL.createObjectURL(blob), '_blank');
      } catch { /* ignore */ }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Chart snapshot"
        className="w-9 h-9 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
      >
        <CameraIcon />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 py-1"
          style={{ background: 'var(--bg-panel-alt)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 168, zIndex: 1100 }}
        >
          <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Chart snapshot</div>
          {SNAPSHOT_ACTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => run(key)}
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? 'Exit full screen' : 'Full screen'}
      className="w-9 h-9 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
    >
      {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
    </button>
  );
}

export function Toolbar({ chartRef, chartAreaRef }: ToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-1 bg-[var(--bg-panel)] border-b border-[var(--border-color)] select-none">
      <div className="flex items-center gap-2">
        <span className="text-blue-400 font-bold text-sm tracking-wide">DSA</span>
        <span className="text-[var(--text-secondary)] font-semibold text-sm">Trading Tool</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <SnapshotMenu chartRef={chartRef} chartAreaRef={chartAreaRef} />
        <FullscreenButton />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="w-9 h-9 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <GearIcon />
        </button>
        <span>Real-Time Analytics Platform</span>
      </div>
      {settingsOpen && <ChartSettingsModal onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
