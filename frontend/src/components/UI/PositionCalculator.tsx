import { useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { usePositionCalcStore } from '../../store/positionCalcStore';
import { decimalsForPrice } from '../../utils/priceFormat';

type Direction = 'long' | 'short';

interface Props {
  onClose: () => void;
}

function num(s: string): number {
  return parseFloat(s);
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(n: number): string {
  const abs = Math.abs(n);
  const decimals =
    abs === 0 ? 2 :
    abs >= 1000 ? 2 :
    abs >= 1 ? 4 :
    Math.min(8, Math.max(4, -Math.floor(Math.log10(abs)) + 4));
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPriceInput(n: number): string {
  const decimals = decimalsForPrice(n);
  return n.toFixed(decimals);
}

function NumberField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded text-sm font-mono text-[var(--text-primary)] outline-none"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
      />
    </label>
  );
}

function ResultRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-[var(--text-muted)]">{label}{hint && <span className="ml-1 opacity-70">({hint})</span>}</span>
      <span className="text-sm font-mono text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

export function PositionCalculator({ onClose }: Props) {
  const { accountBalance, riskPercent, setPersisted } = usePositionCalcStore();
  const candles = useMarketStore((s) => s.candles);

  const [balanceStr, setBalanceStr] = useState(String(accountBalance));
  const [riskStr, setRiskStr] = useState(String(riskPercent));
  const [direction, setDirection] = useState<Direction>('long');
  const [entryStr, setEntryStr] = useState(() => {
    const last = candles.at(-1);
    return last ? formatPriceInput(last.c) : '';
  });
  const [stopStr, setStopStr] = useState('');
  const [targetStr, setTargetStr] = useState('');

  const balance  = num(balanceStr);
  const riskPct  = num(riskStr);
  const entry    = num(entryStr);
  const stop     = num(stopStr);
  const hasTarget = targetStr.trim() !== '';
  const target   = hasTarget ? num(targetStr) : NaN;

  const inputsValid =
    Number.isFinite(balance) && balance > 0 &&
    Number.isFinite(riskPct) && riskPct > 0 &&
    Number.isFinite(entry) && entry > 0 &&
    Number.isFinite(stop) && stop > 0 &&
    entry !== stop;

  const dollarRisk    = inputsValid ? balance * (riskPct / 100) : null;
  const riskPerUnit   = inputsValid ? Math.abs(entry - stop) : null;
  const positionSize  = inputsValid && riskPerUnit! > 0 ? dollarRisk! / riskPerUnit! : null;
  const positionValue = positionSize !== null ? positionSize * entry : null;

  const targetValid = hasTarget && Number.isFinite(target) && target > 0 && target !== entry;
  const rr = inputsValid && targetValid ? Math.abs(target - entry) / riskPerUnit! : null;
  const potentialProfit = positionSize !== null && targetValid ? positionSize * Math.abs(target - entry) : null;

  const stopOnWrongSide = inputsValid && (
    (direction === 'long' && stop >= entry) ||
    (direction === 'short' && stop <= entry)
  );
  const targetOnWrongSide = targetValid && (
    (direction === 'long' && target <= entry) ||
    (direction === 'short' && target >= entry)
  );

  const commitBalance = () => {
    const v = num(balanceStr);
    if (Number.isFinite(v) && v > 0) setPersisted({ accountBalance: v });
  };
  const commitRisk = () => {
    const v = num(riskStr);
    if (Number.isFinite(v) && v > 0) setPersisted({ riskPercent: v });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        style={{ width: 380, maxHeight: '85vh', background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          <span className="text-[var(--text-secondary)] font-semibold text-base">Position Calculator</span>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
          <div className="flex items-center gap-1 p-0.5 rounded mb-4" style={{ background: 'var(--bg-app)' }}>
            {(['long', 'short'] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className="flex-1 px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: direction === d ? (d === 'long' ? '#089981' : '#F23645') : 'transparent',
                  color: direction === d ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                {d === 'long' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <NumberField label="Account Balance ($)" value={balanceStr} onChange={setBalanceStr} />
            <NumberField label="Risk per Trade (%)" value={riskStr} onChange={setRiskStr} />
          </div>

          <div className="grid grid-cols-1 gap-3 mb-1">
            <NumberField label="Entry Price" value={entryStr} onChange={setEntryStr} />
            <NumberField label="Stop-Loss Price" value={stopStr} onChange={setStopStr} />
            {stopOnWrongSide && (
              <div className="text-xs -mt-2" style={{ color: '#F23645' }}>
                Stop should be {direction === 'long' ? 'below' : 'above'} entry for a {direction === 'long' ? 'Long' : 'Short'}.
              </div>
            )}
            <NumberField label="Target Price (optional)" value={targetStr} onChange={setTargetStr} placeholder="for RR" />
            {targetOnWrongSide && (
              <div className="text-xs -mt-2" style={{ color: '#d29922' }}>
                Target is on the wrong side of entry for a {direction === 'long' ? 'Long' : 'Short'} — RR may be misleading.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Results</div>
            <ResultRow label="Dollar Risk"    value={dollarRisk !== null ? `$${formatMoney(dollarRisk)}` : '—'} />
            <ResultRow label="Risk / Unit"    value={riskPerUnit !== null ? `$${formatMoney(riskPerUnit)}` : '—'} />
            <ResultRow label="Position Size"  value={positionSize !== null ? formatQty(positionSize) : '—'} hint="units" />
            <ResultRow label="Position Value" value={positionValue !== null ? `$${formatMoney(positionValue)}` : '—'} />
            <ResultRow label="Risk / Reward"  value={rr !== null ? `1 : ${rr.toFixed(2)}` : '—'} />
            <ResultRow label="Potential Profit" value={potentialProfit !== null ? `$${formatMoney(potentialProfit)}` : '—'} />
            <ResultRow label="Potential Loss" value={dollarRisk !== null ? `$${formatMoney(dollarRisk)}` : '—'} hint="at stop" />
          </div>
        </div>

        <div className="flex items-center justify-end px-4 py-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
          <button
            onClick={() => { commitBalance(); commitRisk(); onClose(); }}
            className="px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
