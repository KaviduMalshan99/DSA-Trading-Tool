import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useMarketStore } from '../../store/marketStore';
import type { FootprintBar } from '../../types/analytics';

export function FootprintCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const symbol = useMarketStore((s) => s.activeSymbol);
  const interval = useMarketStore((s) => s.activeInterval);
  const [data, setData] = useState<FootprintBar | null>(null);

  useEffect(() => {
    api.getFootprint(symbol, interval).then(setData).catch(console.error);
    const id = setInterval(() => {
      api.getFootprint(symbol, interval).then(setData).catch(console.error);
    }, 5000);
    return () => clearInterval(id);
  }, [symbol, interval]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Minimal footprint rendering — full implementation in Sprint 3
    data.rows.slice(0, 20).forEach((row, i) => {
      const y = (i / 20) * canvas.height;
      const buyWidth = (row.buy_volume / (data.total_volume || 1)) * canvas.width * 0.5;
      const sellWidth = (row.sell_volume / (data.total_volume || 1)) * canvas.width * 0.5;

      ctx.fillStyle = 'rgba(38,166,65,0.6)';
      ctx.fillRect(0, y, buyWidth, 8);
      ctx.fillStyle = 'rgba(248,81,73,0.6)';
      ctx.fillRect(canvas.width - sellWidth, y, sellWidth, 8);
    });
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
