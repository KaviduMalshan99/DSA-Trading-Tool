import { useMemo, type ReactNode, type RefObject } from 'react';
import type { IChartApi } from 'lightweight-charts';
import { DrawingPaneContext, registerPane, type DrawingSeries } from '../../store/drawingPanes';
import type { PaneKind } from '../../store/drawingStore';

export { usePane } from '../../store/drawingPanes';

/** Scopes the drawing components below it (canvas, style toolbar, settings
 * modals) to one pane's drawing store and the chart/series it plots against;
 * read it with usePane(). The element wrapping the pane's chart area must
 * carry data-drawing-pane={paneId} (DrawingCanvas bounds-checks against it). */
export function DrawingPaneProvider({ paneId, kind, chartRef, seriesRef, children }: {
  paneId: string;
  kind: PaneKind;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<DrawingSeries | null>;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ ...registerPane(paneId, kind), chartRef, seriesRef }),
    [paneId, kind, chartRef, seriesRef],
  );
  return <DrawingPaneContext.Provider value={value}>{children}</DrawingPaneContext.Provider>;
}
