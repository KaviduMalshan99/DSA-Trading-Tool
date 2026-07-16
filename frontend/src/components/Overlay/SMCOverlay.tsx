/**
 * SMCOverlay — canvas overlay drawing Smart Money Concept zones.
 *
 * Order Blocks: one-candle-wide rectangle at the OB candle (green = bullish, red = bearish).
 * Fair Value Gaps: rectangle spanning the 3-candle gap window (c1 open → c3 close), matching
 * the backend's detection window, in a neutral colour since direction isn't exposed by the API.
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { intervalToSecs } from '../../utils/interval';
import { toChartTimeSeconds } from '../../utils/chartTime';
import { api } from '../../services/api';
import type { SMCData, SMCZone } from '../../types/analytics';

const POLL_MS = 5_000;

export interface SMCOverlayProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

type LWTime = import('lightweight-charts').Time;

export function SMCOverlay({ sharedChartRef, sharedSeriesRef }: SMCOverlayProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const dataRef      = useRef<SMCData | null>(null);

  const { activeSymbol, activeInterval } = useMarketStore();

  const drawFnRef = useRef<() => void>(() => {});
  drawFnRef.current = () => {
    const canvas = canvasRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    const data   = dataRef.current;
    if (!canvas || !chart || !series || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const intervalSecs = intervalToSecs(activeInterval);
    const timeScale     = chart.timeScale();

    const timeToX = (sec: number): number | null => {
      const raw = timeScale.timeToCoordinate(sec as unknown as LWTime);
      return raw === null ? null : (raw as unknown as number);
    };

    const drawZone = (
      zone: SMCZone,
      fromSec: number,
      toSec: number,
      fillStyle: string,
      strokeStyle: string,
      dashed: boolean,
      label: string,
    ) => {
      const topRaw    = series.priceToCoordinate(zone.high);
      const bottomRaw = series.priceToCoordinate(zone.low);
      if (topRaw === null || bottomRaw === null) return;
      const topY    = topRaw as unknown as number;
      const bottomY = bottomRaw as unknown as number;
      const boxH    = Math.max(1, bottomY - topY);

      let leftX  = timeToX(fromSec);
      let rightX = timeToX(toSec);
      if (leftX === null && rightX === null) return;
      if (leftX === null) leftX = 0;
      if (rightX === null) rightX = W;
      if (rightX <= 0 || leftX >= W) return; // fully off-screen

      const boxW = rightX - leftX;
      if (boxW <= 0) return;

      ctx.fillStyle = fillStyle;
      ctx.fillRect(leftX, topY, boxW, boxH);

      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1;
      if (dashed) ctx.setLineDash([4, 3]);
      ctx.strokeRect(leftX, topY, boxW, boxH);
      ctx.setLineDash([]);

      if (boxW > 24 && boxH > 12) {
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = strokeStyle;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, leftX + 3, topY + 2);
      }
    };

    for (const ob of data.order_blocks) {
      const openSec  = toChartTimeSeconds(ob.ts);
      const closeSec = openSec + intervalSecs;
      const bullish  = ob.type === 'order_block_bullish';
      const alpha    = 0.10 + ob.strength * 0.12;
      drawZone(
        ob,
        openSec,
        closeSec,
        bullish ? `rgba(0,255,136,${alpha})` : `rgba(255,68,68,${alpha})`,
        bullish ? 'rgba(0,255,136,0.55)' : 'rgba(255,68,68,0.55)',
        false,
        'OB',
      );
    }

    for (const fvg of data.fair_value_gaps) {
      const c2OpenSec = toChartTimeSeconds(fvg.ts);
      const fromSec   = c2OpenSec - intervalSecs;
      const toSec     = c2OpenSec + intervalSecs * 2;
      const alpha     = 0.08 + fvg.strength * 0.10;
      drawZone(
        fvg,
        fromSec,
        toSec,
        `rgba(147,112,219,${alpha})`,
        'rgba(147,112,219,0.55)',
        true,
        'FVG',
      );
    }
  };

  const scheduleDraw = useRef(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawFnRef.current());
  }).current;

  // ── Chart event subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;
    const onUpdate = () => scheduleDraw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onUpdate);
    chart.subscribeCrosshairMove(onUpdate);
    scheduleDraw();
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onUpdate);
      chart.unsubscribeCrosshairMove(onUpdate);
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      scheduleDraw();
    });
    ro.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // ── Poll REST endpoint (no SMC websocket stream exists) ───────────────────
  useEffect(() => {
    dataRef.current = null;
    let stopped = false;

    async function fetchZones() {
      try {
        const data = await api.getSMCZones(activeSymbol, activeInterval);
        if (!stopped) {
          dataRef.current = data;
          scheduleDraw();
        }
      } catch { /* no candle data yet — keep last-known zones */ }
    }

    fetchZones();
    const timer = setInterval(fetchZones, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeSymbol, activeInterval, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ background: 'transparent' }} />
    </div>
  );
}
