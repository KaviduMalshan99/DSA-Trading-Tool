import { useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useAlertsStore, type Alert, type AlertType, type AlertSideFilter, type LevelKind, type NewAlertInput } from '../../store/alertsStore';
import { formatPrice } from '../../utils/priceFormat';

interface Props {
  onClose: () => void;
}

const TYPE_OPTIONS: { value: AlertType; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'whale', label: 'Whale' },
  { value: 'absorption', label: 'Absorption' },
  { value: 'delta', label: 'Delta' },
  { value: 'level', label: 'Level' },
];

const SIDE_OPTIONS: { value: AlertSideFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
];

const LEVEL_OPTIONS: { value: LevelKind; label: string }[] = [
  { value: 'pdh', label: 'PDH' },
  { value: 'pdl', label: 'PDL' },
  { value: 'daily_open', label: 'Daily Open' },
];

function describeAlert(alert: Alert): string {
  switch (alert.type) {
    case 'price':
      return `Price ${alert.direction} ${formatPrice(alert.targetPrice)}`;
    case 'whale':
      return `Whale ${alert.side === 'any' ? '' : `${alert.side} `}≥ ${
        alert.minNotional >= 1_000_000 ? `$${(alert.minNotional / 1_000_000).toFixed(2)}M` : `$${(alert.minNotional / 1_000).toFixed(0)}K`
      }`;
    case 'absorption':
      return `${alert.side === 'any' ? 'Any' : alert.side === 'buy' ? 'Buy' : 'Sell'} absorption`;
    case 'delta':
      return `Large ${alert.side === 'any' ? '' : `${alert.side} `}delta swing`;
    case 'level':
      return `Touch ${alert.level === 'pdh' ? 'PDH' : alert.level === 'pdl' ? 'PDL' : 'Daily Open'}`;
  }
}

function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded" style={{ background: 'var(--bg-app)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="flex-1 px-2 py-1 rounded text-[11px] font-medium"
          style={{
            background: value === o.value ? 'var(--accent)' : 'transparent',
            color: value === o.value ? '#ffffff' : 'var(--text-muted)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AlertsManager({ onClose }: Props) {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const currentPrice = useMarketStore((s) => s.candles.at(-1)?.c ?? null);

  const { alerts, addAlert, removeAlert, toggleAlert, soundEnabled, setSoundEnabled } = useAlertsStore();

  const [type, setType] = useState<AlertType>('price');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState('');
  const [minNotional, setMinNotional] = useState('500000');
  const [side, setSide] = useState<AlertSideFilter>('any');
  const [level, setLevel] = useState<LevelKind>('pdh');
  const [rearm, setRearm] = useState(false);

  const handleAdd = () => {
    let input: NewAlertInput;
    if (type === 'price') {
      const price = parseFloat(targetPrice);
      if (!Number.isFinite(price) || price <= 0) return;
      input = { type: 'price', direction, targetPrice: price, rearm };
    } else if (type === 'whale') {
      const notional = parseFloat(minNotional);
      if (!Number.isFinite(notional) || notional <= 0) return;
      input = { type: 'whale', minNotional: notional, side, rearm };
    } else if (type === 'absorption') {
      input = { type: 'absorption', side, rearm };
    } else if (type === 'delta') {
      input = { type: 'delta', side, rearm };
    } else {
      input = { type: 'level', level, rearm };
    }
    addAlert(activeSymbol, input);
    setTargetPrice('');
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        style={{ width: 420, maxHeight: '85vh', background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          <span className="text-[var(--text-secondary)] font-semibold text-base">Alerts</span>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
          {/* ── Create form ── */}
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">
            New alert · {activeSymbol}{currentPrice !== null && <span className="normal-case"> · now {formatPrice(currentPrice)}</span>}
          </div>

          <div className="mb-3">
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
          </div>

          <div className="flex flex-col gap-2 mb-3">
            {type === 'price' && (
              <div className="grid grid-cols-2 gap-2">
                <Segmented options={[{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }]} value={direction} onChange={setDirection} />
                <input
                  type="number"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="Target price"
                  className="px-2 py-1.5 rounded text-sm font-mono text-[var(--text-primary)] outline-none"
                  style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
                />
              </div>
            )}

            {type === 'whale' && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={minNotional}
                  onChange={(e) => setMinNotional(e.target.value)}
                  placeholder="Min notional ($)"
                  className="px-2 py-1.5 rounded text-sm font-mono text-[var(--text-primary)] outline-none"
                  style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
                />
                <Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} />
              </div>
            )}

            {(type === 'absorption' || type === 'delta') && (
              <Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} />
            )}

            {type === 'level' && (
              <Segmented options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
            )}

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={rearm} onChange={(e) => setRearm(e.target.checked)} />
              Re-arm (fire again after the condition resets, instead of one-shot)
            </label>
          </div>

          <button
            onClick={handleAdd}
            className="w-full px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] mb-4"
          >
            Add Alert
          </button>

          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
            <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
            Play a sound when an alert fires
          </label>

          {/* ── Active alerts list ── */}
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">
            Your alerts {alerts.length > 0 && `(${alerts.length})`}
          </div>

          {alerts.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] italic">No alerts yet.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {alerts.map((alert) => {
                const inactive = alert.symbol !== activeSymbol;
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                    style={{ background: 'var(--bg-app)', opacity: alert.enabled ? 1 : 0.55 }}
                  >
                    <input
                      type="checkbox"
                      checked={alert.enabled}
                      onChange={() => toggleAlert(alert.id)}
                      title={alert.enabled ? 'Enabled' : 'Disabled'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--text-primary)] font-mono truncate">{describeAlert(alert)}</div>
                      <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                        <span>{alert.symbol}</span>
                        <span>·</span>
                        <span>{alert.rearm ? 'Re-arm' : 'One-shot'}</span>
                        {inactive && <span className="text-[#d29922]">· inactive (switch symbol)</span>}
                        {alert.triggered && alert.lastFiredAt && (
                          <span>· fired {new Date(alert.lastFiredAt).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeAlert(alert.id)}
                      className="text-[var(--text-muted)] hover:text-[#f85149] text-sm leading-none flex-shrink-0"
                      title="Delete alert"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-4 py-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
          <button onClick={onClose} className="px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
