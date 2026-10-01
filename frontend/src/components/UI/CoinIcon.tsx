import { useEffect, useState } from 'react';
import { baseAsset, coinIconUrl, colorForSymbol } from '../../utils/coin';

// Bases whose logo failed to load — shared across all instances so we never
// re-request a known-missing icon.
const failedBases = new Set<string>();

interface Props {
  symbol: string;
  size?: number;
}

export function CoinIcon({ symbol, size = 18 }: Props) {
  const base = baseAsset(symbol);
  const [failed, setFailed] = useState(() => failedBases.has(base));

  useEffect(() => {
    setFailed(failedBases.has(base));
  }, [symbol, base]);

  if (failed || failedBases.has(base)) {
    return (
      <div
        className="rounded-full flex-shrink-0 flex items-center justify-center font-sans font-bold text-white leading-none"
        style={{
          width: size,
          height: size,
          background: colorForSymbol(base),
          fontSize: Math.round(size * 0.4),
        }}
      >
        {base.slice(0, size >= 20 ? 3 : 2)}
      </div>
    );
  }

  return (
    <img
      src={coinIconUrl(base)}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      alt=""
      className="rounded-full flex-shrink-0 object-cover"
      style={{ width: size, height: size }}
      onError={() => {
        failedBases.add(base);
        setFailed(true);
      }}
    />
  );
}
