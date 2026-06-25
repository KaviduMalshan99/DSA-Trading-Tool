import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useMarketStore } from '../../store/marketStore';
import type { VolumeProfileNode } from '../../types/analytics';

export function VolumeProfile() {
  const symbol = useMarketStore((s) => s.activeSymbol);
  const [nodes, setNodes] = useState<VolumeProfileNode[]>([]);

  useEffect(() => {
    api.getVolumeProfile(symbol).then(setNodes).catch(console.error);
  }, [symbol]);

  if (!nodes.length) return null;

  const maxVol = Math.max(...nodes.map((n) => n.volume));

  return (
    <div className="absolute right-0 top-0 h-full w-16 pointer-events-none flex flex-col justify-end">
      {nodes.map((node) => (
        <div
          key={node.price}
          title={`${node.price} — Vol: ${node.volume.toFixed(2)}`}
          className="relative flex items-center"
          style={{ height: `${100 / nodes.length}%` }}
        >
          <div
            className={`h-[2px] ${
              node.is_poc
                ? 'bg-yellow-400'
                : node.in_value_area
                ? 'bg-blue-400 opacity-70'
                : 'bg-gray-600 opacity-40'
            }`}
            style={{ width: `${(node.volume / maxVol) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}
