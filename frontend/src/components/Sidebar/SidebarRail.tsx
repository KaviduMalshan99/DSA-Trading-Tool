interface Props {
  open: boolean;
  onToggle: () => void;
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

export function SidebarRail({ open, onToggle }: Props) {
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
    </div>
  );
}
