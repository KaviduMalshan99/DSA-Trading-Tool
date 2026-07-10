import type { IChartApi } from 'lightweight-charts';

/**
 * Composites lightweight-charts' own screenshot (candles/grid/axes) with every
 * overlay <canvas> layered on top of it (footprint, heatmap, SMC, drawings, ...)
 * into a single flattened canvas. The chart's own canvas lives inside the
 * element marked `data-tv-chart-root` and is skipped so it isn't drawn twice.
 */
export function captureChartSnapshot(chart: IChartApi, chartArea: HTMLElement): HTMLCanvasElement {
  const base = chart.takeScreenshot();
  const out = document.createElement('canvas');
  out.width = base.width;
  out.height = base.height;

  const ctx = out.getContext('2d');
  if (!ctx) return base;
  ctx.drawImage(base, 0, 0);

  const canvases = Array.from(chartArea.querySelectorAll('canvas'));
  for (const c of canvases) {
    if (c.closest('[data-tv-chart-root]')) continue;
    if (c.width === 0 || c.height === 0) continue;
    ctx.drawImage(c, 0, 0, out.width, out.height);
  }
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob() returned null'))), 'image/png');
  });
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
