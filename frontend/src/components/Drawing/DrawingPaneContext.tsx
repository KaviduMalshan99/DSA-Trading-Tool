import type { ReactNode } from 'react';
import { DrawingPaneContext, registerPane } from '../../store/drawingPanes';
import type { PaneKind } from '../../store/drawingStore';

export { usePane } from '../../store/drawingPanes';

/** Scopes the drawing components below it (canvas, style toolbar, settings
 * modals) to one pane's drawing store; read it with usePane(). */
export function DrawingPaneProvider({ paneId, kind, children }: { paneId: string; kind: PaneKind; children: ReactNode }) {
  return <DrawingPaneContext.Provider value={registerPane(paneId, kind)}>{children}</DrawingPaneContext.Provider>;
}
