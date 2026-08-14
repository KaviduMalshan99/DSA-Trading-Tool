interface Props {
  open: boolean;
  onToggle: () => void;
  domOpen: boolean;
  onToggleDom: () => void;
  tapeOpen: boolean;
  onToggleTape: () => void;
}

function WatchlistIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="8" y1="4" x2="8" y2="20" />
      <line x1="11.5" y1="9" x2="17.5" y2="9" />
      <line x1="11.5" y1="13" x2="17.5" y2="13" />
      <line x1="11.5" y1="17" x2="15.5" y2="17" />
    </svg>
  );
}

function DomIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="10" x2="16" y2="10" />
      <line x1="4" y1="14" x2="18" y2="14" />
      <line x1="4" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function TapeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="6" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <line x1="10" y1="7" x2="20" y2="7" />
      <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <line x1="10" y1="12" x2="17" y2="12" />
      <circle cx="6" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <line x1="10" y1="17" x2="19" y2="17" />
    </svg>
  );
}

export function SidebarRail({ open, onToggle, domOpen, onToggleDom, tapeOpen, onToggleTape }: Props) {
  return (
    <div className="w-12 flex flex-col items-center py-2 gap-1 bg-[var(--bg-app)] border-l border-[var(--border-color)] flex-shrink-0">
      <button
        onClick={onToggle}
        title="Watchlist"
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
          open ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        <WatchlistIcon />
      </button>
      <button
        onClick={onToggleDom}
        title="DOM (Depth of Market)"
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
          domOpen ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        <DomIcon />
      </button>
      <button
        onClick={onToggleTape}
        title="Tape (Time & Sales)"
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
          tapeOpen ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        <TapeIcon />
      </button>
    </div>
  );
}
