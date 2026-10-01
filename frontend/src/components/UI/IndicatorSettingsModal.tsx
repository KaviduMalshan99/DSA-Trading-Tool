import { useRef, useState } from 'react';
import {
  useIndicatorConfigStore,
  type IndicatorConfigKey,
  type IndicatorConfigs,
} from '../../store/indicatorConfigStore';
import { MiniColorSwatch, MiniWidthPicker } from '../Drawing/drawingStyleShared';

interface Props {
  indicatorKey: IndicatorConfigKey;
  onClose: () => void;
}

type Tab = 'inputs' | 'style';

const TITLES: Record<IndicatorConfigKey, string> = {
  ema: 'EMA',
  bollinger: 'Bollinger Bands',
  rsi: 'RSI',
  stochRsi: 'Stochastic RSI',
  macd: 'MACD',
};

/**
 * Number input that keeps its own text while typing (so "2" on the way to
 * "200" doesn't snap back) and commits on blur/Enter. Invalid text is discarded
 * and the field reverts to the stored value: by default it must be an integer
 * >= 1; with `decimal` any finite number > 0 is accepted.
 */
function PeriodInput({ value, onCommit, decimal = false }: { value: number; onCommit: (v: number) => void; decimal?: boolean }) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  // Resync the mirror when the stored value changes from outside (Reset).
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }

  const commit = () => {
    const n = Number(text.trim());
    const valid = decimal ? Number.isFinite(n) && n > 0 : Number.isInteger(n) && n >= 1;
    if (valid) {
      if (n !== value) onCommit(n);
      setText(String(n));
    } else {
      setText(String(value));
    }
  };

  return (
    <input
      type="number"
      min={decimal ? 0 : 1}
      step={decimal ? 0.1 : 1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className="w-20 px-2 py-1 rounded text-sm select-text text-[var(--text-primary)] border border-[var(--border-color)] focus:outline-none focus:ring-1 focus:ring-blue-500"
      style={{ background: 'var(--bg-app)' }}
    />
  );
}

function EMAInputs() {
  const periods  = useIndicatorConfigStore((s) => s.configs.ema.periods);
  const setParams = useIndicatorConfigStore((s) => s.setParams);
  return (
    <div className="flex flex-col gap-3">
      {periods.map((p, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-secondary)]">Length {i + 1}</span>
          <PeriodInput
            value={p}
            onCommit={(v) => setParams('ema', { periods: periods.map((x, j) => (j === i ? v : x)) })}
          />
        </div>
      ))}
    </div>
  );
}

function EMAStyle() {
  const cfg     = useIndicatorConfigStore((s) => s.configs.ema);
  const setLine = useIndicatorConfigStore((s) => s.setLine);
  return (
    <div className="flex flex-col gap-3">
      {cfg.lines.map((line, i) => (
        <div key={i} className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={line.visible}
              onChange={(e) => setLine('ema', i, { visible: e.target.checked })}
            />
            EMA {cfg.periods[i]}
          </label>
          <div className="flex items-center gap-2">
            <MiniColorSwatch color={line.color} onChange={(c) => setLine('ema', i, { color: c })} />
            <MiniWidthPicker width={line.width} onChange={(w) => setLine('ema', i, { width: w })} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BollingerInputs() {
  const period    = useIndicatorConfigStore((s) => s.configs.bollinger.period);
  const mult      = useIndicatorConfigStore((s) => s.configs.bollinger.mult);
  const setParams = useIndicatorConfigStore((s) => s.setParams);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">Length</span>
        <PeriodInput value={period} onCommit={(v) => setParams('bollinger', { period: v })} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">StdDev multiplier</span>
        <PeriodInput decimal value={mult} onCommit={(v) => setParams('bollinger', { mult: v })} />
      </div>
    </div>
  );
}

// Row labels in configs.bollinger.lines order: middle, upper, lower.
const BB_LINE_LABELS = ['Basis', 'Upper', 'Lower'] as const;

function BollingerStyle() {
  const lines   = useIndicatorConfigStore((s) => s.configs.bollinger.lines);
  const setLine = useIndicatorConfigStore((s) => s.setLine);
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => (
        <div key={BB_LINE_LABELS[i]} className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={line.visible}
              onChange={(e) => setLine('bollinger', i, { visible: e.target.checked })}
            />
            {BB_LINE_LABELS[i]}
          </label>
          <div className="flex items-center gap-2">
            <MiniColorSwatch color={line.color} onChange={(c) => setLine('bollinger', i, { color: c })} />
            <MiniWidthPicker width={line.width} onChange={(w) => setLine('bollinger', i, { width: w })} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function IndicatorSettingsModal({ indicatorKey, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('inputs');
  // Snapshot taken once, on mount — Cancel restores it so live-previewed
  // edits don't stick if the user backs out.
  const originalRef = useRef<IndicatorConfigs[IndicatorConfigKey]>(
    useIndicatorConfigStore.getState().configs[indicatorKey],
  );

  const handleCancel = () => {
    useIndicatorConfigStore.getState().setConfig(indicatorKey, originalRef.current);
    onClose();
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'inputs', label: 'Inputs' },
    { value: 'style', label: 'Style' },
  ];

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
          <span className="text-[var(--text-secondary)] font-semibold text-base">{TITLES[indicatorKey]}</span>
          <button onClick={handleCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        <div className="flex gap-4 px-4" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          {tabs.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className="py-2 text-sm border-b-2 -mb-px"
              style={{
                borderColor: tab === value ? 'var(--accent)' : 'transparent',
                color: tab === value ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* No overflow-y-auto here: an overflow-scrolling ancestor clips absolutely-
            positioned children like the color-swatch popover, so with only a few
            short rows we let this size to content instead. */}
        <div className="p-4" style={{ flex: 1, overflow: 'visible' }}>
          {indicatorKey === 'ema' ? (
            tab === 'inputs' ? <EMAInputs /> : <EMAStyle />
          ) : indicatorKey === 'bollinger' ? (
            tab === 'inputs' ? <BollingerInputs /> : <BollingerStyle />
          ) : (
            <div className="text-sm text-[var(--text-muted)]">Settings for this indicator are coming soon.</div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
          <button
            onClick={() => useIndicatorConfigStore.getState().resetIndicator(indicatorKey)}
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
