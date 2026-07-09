import { useEffect, useRef, useState } from 'react';
import { useDrawingStore } from '../../store/drawingStore';
import { ALL_TOOL_ICON, ALL_TOOL_LABEL } from './DrawingToolbar';

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="8" cy="6" r="1.6" /><circle cx="16" cy="6" r="1.6" />
      <circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" />
      <circle cx="8" cy="18" r="1.6" /><circle cx="16" cy="18" r="1.6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

const DEFAULT_POS = { x: 280, y: 12 };

// TradingView-style floating "Favorites" strip — every tool starred from a
// dropdown's options list shows up here as a one-click shortcut. It's a free
// floating bar (not docked to the sidebar) so it can be dragged anywhere over
// the chart, same as TradingView's; position persists in the drawing store.
export function FavoritesToolbar() {
  const {
    favoriteTools, favoritesBarOpen, favoritesBarPos, setFavoritesBarPos, toggleFavoritesBar,
    activeTool, setTool,
  } = useDrawingStore();
  const [dragPos, setDragPos] = useState(favoritesBarPos ?? DEFAULT_POS);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    if (favoritesBarPos) setDragPos(favoritesBarPos);
  }, [favoritesBarPos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const x = Math.max(4, Math.min(e.clientX - offsetRef.current.dx, window.innerWidth - 48));
      const y = Math.max(4, Math.min(e.clientY - offsetRef.current.dy, window.innerHeight - 40));
      setDragPos({ x, y });
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      setDragPos((p) => { setFavoritesBarPos(p); return p; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setFavoritesBarPos]);

  if (!favoritesBarOpen || favoriteTools.length === 0) return null;

  const onGripMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    offsetRef.current = { dx: e.clientX - dragPos.x, dy: e.clientY - dragPos.y };
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  };

  return (
    <div
      data-drawing-overlay="favorites-bar"
      className="fixed flex items-center gap-0.5 py-1 px-1 select-none"
      style={{
        left: dragPos.x,
        top: dragPos.y,
        zIndex: 80,
        background: '#161b22',
        border: '1px solid #21262d',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
      }}
    >
      <div
        onMouseDown={onGripMouseDown}
        title="Drag to move"
        className="w-5 h-9 flex items-center justify-center cursor-grab text-[#8b949e] hover:text-white"
      >
        <GripIcon />
      </div>

      <div className="w-px h-5 bg-[#21262d] mx-0.5" />

      {favoriteTools.map((tool) => (
        <button
          key={tool}
          title={ALL_TOOL_LABEL[tool] ?? tool}
          onClick={() => setTool(tool)}
          className={`
            w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${activeTool === tool
              ? 'bg-[#2196F3] text-white'
              : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}
          `}
        >
          {ALL_TOOL_ICON[tool]}
        </button>
      ))}

      <div className="w-px h-5 bg-[#21262d] mx-0.5" />

      <button
        title="Close Favorites Toolbar"
        onClick={toggleFavoritesBar}
        className="w-6 h-6 flex items-center justify-center rounded text-[#8b949e] hover:text-white hover:bg-[#21262d]"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
