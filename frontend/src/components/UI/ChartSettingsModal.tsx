import { useRef } from 'react';
import { useCandleStyleStore, type CandleStyle } from '../../store/candleStyleStore';
import { useThemeStore, type Theme } from '../../store/themeStore';
import { MiniColorSwatch } from '../Drawing/drawingStyleShared';

function ThemeRow() {
  const { theme, setTheme } = useThemeStore();
  const options: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--text-secondary)]">Theme</span>
      <div className="flex items-center gap-1 p-0.5 rounded" style={{ background: 'var(--bg-app)' }}>
        {options.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className="px-3 py-1 rounded text-xs"
            style={{
              background: theme === value ? 'var(--accent)' : 'transparent',
              color: theme === value ? '#ffffff' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

function CandleRow({
  label, checked, onCheck, upColor, downColor, onUp, onDown,
}: {
  label: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  upColor: string;
  downColor: string;
  onUp: (c: string) => void;
  onDown: (c: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <MiniColorSwatch color={upColor} onChange={onUp} />
        <MiniColorSwatch color={downColor} onChange={onDown} />
      </div>
    </div>
  );
}

export function ChartSettingsModal({ onClose }: Props) {
  const { setStyle, ...style } = useCandleStyleStore();
  // Snapshot taken once, when the modal mounts — Cancel restores this so
  // live-previewed edits don't stick if the user backs out.
  const originalRef = useRef<CandleStyle>({
    upColor: style.upColor,
    downColor: style.downColor,
    borderUpColor: style.borderUpColor,
    borderDownColor: style.borderDownColor,
    wickUpColor: style.wickUpColor,
    wickDownColor: style.wickDownColor,
    bodyVisible: style.bodyVisible,
    bordersVisible: style.bordersVisible,
    wickVisible: style.wickVisible,
  });

  const handleCancel = () => {
    setStyle(originalRef.current);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="flex flex-col"
        style={{ width: 440, maxHeight: '80vh', background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          <span className="text-[var(--text-secondary)] font-semibold text-base">Settings</span>
          <button onClick={handleCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        {/* No overflow-y-auto here: an overflow-scrolling ancestor clips absolutely-
            positioned children like the color-swatch popover below, so with only
            a few short rows we let this size to content instead. */}
        <div className="p-4" style={{ flex: 1, overflow: 'visible' }}>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-3">Appearance</div>
          <div className="mb-5">
            <ThemeRow />
          </div>

          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-3">Candles</div>
          <div className="flex flex-col gap-3">
            <CandleRow
              label="Body" checked={style.bodyVisible} onCheck={(v) => setStyle({ bodyVisible: v })}
              upColor={style.upColor} downColor={style.downColor}
              onUp={(c) => setStyle({ upColor: c })} onDown={(c) => setStyle({ downColor: c })}
            />
            <CandleRow
              label="Borders" checked={style.bordersVisible} onCheck={(v) => setStyle({ bordersVisible: v })}
              upColor={style.borderUpColor} downColor={style.borderDownColor}
              onUp={(c) => setStyle({ borderUpColor: c })} onDown={(c) => setStyle({ borderDownColor: c })}
            />
            <CandleRow
              label="Wick" checked={style.wickVisible} onCheck={(v) => setStyle({ wickVisible: v })}
              upColor={style.wickUpColor} downColor={style.wickDownColor}
              onUp={(c) => setStyle({ wickUpColor: c })} onDown={(c) => setStyle({ wickDownColor: c })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
          <button
            onClick={() => { useCandleStyleStore.getState().resetStyle(); }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Reset to default
          </button>
          <div className="flex gap-2">
            <button onClick={handleCancel} className="px-4 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]">
              Cancel
            </button>
            <button onClick={onClose} className="px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
