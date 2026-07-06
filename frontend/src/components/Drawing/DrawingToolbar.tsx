import { useEffect, useRef, useState } from 'react';
import { useDrawingStore, CURSOR_MODES, type CursorMode, type DrawingTool } from '../../store/drawingStore';

interface ToolBtn {
  tool: DrawingTool;
  label: string;
  icon: React.ReactNode;
}

function CrossIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 0l16 12-7 1-4 8L4 0z" />
    </svg>
  );
}

function DemonstrationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MagicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 2l1.6 4.9L17.5 8.4l-4.9 1.6L11 15l-1.6-4.9L4.5 8.4l4.9-1.6L11 2z" />
      <path d="M18.5 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round">
      <path d="M18 13l-7 7H6l-3-3a2 2 0 0 1 0-2.8L13 4.2a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L18 13z" />
      <line x1="9" y1="21" x2="21" y2="21" />
    </svg>
  );
}

function TrendLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="4" cy="20" r="2" fill="currentColor" />
      <circle cx="20" cy="4" r="2" fill="currentColor" />
    </svg>
  );
}

function HLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <rect x="3" y="6" width="18" height="12" />
    </svg>
  );
}

function FibIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
      <line x1="3" y1="4"  x2="21" y2="4" />
      <line x1="3" y1="9"  x2="21" y2="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="3" y1="20" x2="21" y2="20" />
      <line x1="4" y1="4"  x2="4"  y2="20" strokeWidth="1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

const CURSOR_ICON: Record<CursorMode, React.ReactNode> = {
  cross: <CrossIcon />,
  dot: <DotIcon />,
  arrow: <ArrowIcon />,
  demonstration: <DemonstrationIcon />,
  magic: <MagicIcon />,
  eraser: <EraserIcon />,
};

const CURSOR_ITEMS: { mode: CursorMode; label: string }[] = [
  { mode: 'cross', label: 'Cross' },
  { mode: 'dot', label: 'Dot' },
  { mode: 'arrow', label: 'Arrow' },
  { mode: 'demonstration', label: 'Demonstration' },
  { mode: 'magic', label: 'Magic' },
  { mode: 'eraser', label: 'Eraser' },
];

const TOOLS: ToolBtn[] = [
  { tool: 'trendline',  label: 'Trend Line',            icon: <TrendLineIcon /> },
  { tool: 'hline',      label: 'Horizontal Line',       icon: <HLineIcon /> },
  { tool: 'rectangle',  label: 'Rectangle',             icon: <RectIcon /> },
  { tool: 'fibonacci',  label: 'Fibonacci Retracement', icon: <FibIcon /> },
];

export function DrawingToolbar() {
  const { activeTool, lastCursorMode, setTool, selectedId, deleteDrawing } = useDrawingStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const cursorGroupRef = useRef<HTMLDivElement>(null);

  const isCursorGroupActive = (CURSOR_MODES as readonly string[]).includes(activeTool);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onOutsideMouseDown = (e: MouseEvent) => {
      if (cursorGroupRef.current && !cursorGroupRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideMouseDown);
    return () => document.removeEventListener('mousedown', onOutsideMouseDown);
  }, [dropdownOpen]);

  return (
    <div className="flex flex-col items-center gap-1 py-2 px-1 bg-[#161b22] border-r border-[#21262d] select-none"
         style={{ width: 40 }}>
      <div className="relative" ref={cursorGroupRef}>
        <button
          title="Cursor"
          onClick={() => {
            if (!isCursorGroupActive) setTool(lastCursorMode);
            setDropdownOpen((v) => !v);
          }}
          className={`
            w-8 h-8 flex items-center justify-center rounded transition-colors
            ${isCursorGroupActive
              ? 'bg-[#2196F3] text-white'
              : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}
          `}
        >
          {CURSOR_ICON[lastCursorMode]}
        </button>

        {dropdownOpen && (
          <div
            className="absolute left-full top-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 180,
              background: '#1E222D',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {CURSOR_ITEMS.map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => { setTool(mode); setDropdownOpen(false); }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                  ${activeTool === mode ? 'text-white' : 'text-[#d1d4dc]'}
                  hover:bg-[#2196F3] hover:text-white
                `}
              >
                <span className="flex-shrink-0">{CURSOR_ICON[mode]}</span>
                <span className="flex-1">{label}</span>
                {activeTool === mode && <span className="text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-6 border-t border-[#21262d] my-1" />

      {TOOLS.map(({ tool, label, icon }) => (
        <button
          key={tool}
          title={label}
          onClick={() => setTool(tool)}
          className={`
            w-8 h-8 flex items-center justify-center rounded transition-colors
            ${activeTool === tool
              ? 'bg-[#2196F3] text-white'
              : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'}
          `}
        >
          {icon}
        </button>
      ))}

      <div className="w-6 border-t border-[#21262d] my-1" />

      <button
        title="Delete selected"
        disabled={!selectedId}
        onClick={() => selectedId && deleteDrawing(selectedId)}
        className={`
          w-8 h-8 flex items-center justify-center rounded transition-colors
          ${selectedId
            ? 'text-[#f85149] hover:bg-[#21262d]'
            : 'text-[#30363d] cursor-not-allowed'}
        `}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
