import { useEffect, useRef } from 'react';
import { useMarketStore } from '../../store/marketStore';

export function HeatmapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const symbol = useMarketStore((s) => s.activeSymbol);

  useEffect(() => {
    // Heatmap rendering logic will be wired here once
    // the backend delivers heatmap data via WebSocket.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Placeholder gradient to indicate overlay is active
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(255,50,50,0.05)');
    gradient.addColorStop(1, 'rgba(50,255,100,0.05)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [symbol]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
