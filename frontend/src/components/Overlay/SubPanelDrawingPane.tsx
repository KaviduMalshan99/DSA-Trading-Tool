import type { RefObject } from 'react';
import type { IChartApi } from 'lightweight-charts';
import type { DrawingSeries } from '../../store/drawingPanes';
import type { PaneKind } from '../../store/drawingStore';
import { DrawingPaneProvider } from '../Drawing/DrawingPaneContext';
import { DrawingCanvas } from '../Drawing/DrawingCanvas';
import { DrawingStyleToolbar } from '../Drawing/DrawingStyleToolbar';
import { PriceScaleButtons } from '../Chart/PriceScaleButtons';

/**
 * A sub-panel's drawing pane: canvas, "A" button and floating style toolbar
 * (with its settings host), scoped to the panel's chart. Render it inside the
 * panel's positioned root, which must carry data-drawing-pane={paneId}, and
 * only once the panel's chart exists (chartReady) — the panel creates its
 * chart in its own effect, which runs after its children's effects, so a
 * canvas mounted alongside it would subscribe to a chart that isn't there yet.
 *
 * `seriesRef` is the series drawings are plotted against: one that is never
 * hidden and sits on the panel's right price scale (hidden series drop out of
 * price mapping).
 */
export function SubPanelDrawingPane({ paneId, kind, chartRef, seriesRef, sharedChartRef }: {
  paneId: string;
  kind: PaneKind;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<DrawingSeries | null>;
  /** The main chart — the panel mirrors its visible range (subPanelSync). */
  sharedChartRef: RefObject<IChartApi | null>;
}) {
  return (
    <DrawingPaneProvider paneId={paneId} kind={kind} chartRef={chartRef} seriesRef={seriesRef} timeSourceRef={sharedChartRef}>
      <DrawingCanvas />
      {/* "A" (auto-scale) in the price-axis × time-axis corner, as on the main
          chart — after DrawingCanvas and z-60 so it stays clickable while a
          drawing tool is active. */}
      <PriceScaleButtons chartRef={chartRef} showLog={false} />
      <DrawingStyleToolbar />
    </DrawingPaneProvider>
  );
}
