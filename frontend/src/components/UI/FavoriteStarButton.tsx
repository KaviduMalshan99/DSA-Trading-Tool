// Shared favorite-star icons + toggle button, used by the drawing-tool flyouts
// (DrawingToolbar) and the Timeframe dropdown — one definition of the star.

export function StarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6-6-3.4-6 3.4 1.4-6.6-5-4.6 6.7-.7L12 2.5Z" />
    </svg>
  );
}

export function StarFilledIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6-6-3.4-6 3.4 1.4-6.6-5-4.6 6.7-.7L12 2.5Z" />
    </svg>
  );
}

// A star kept as its own button (never nested inside a row's select button),
// stopping propagation so toggling a favorite doesn't also select the row.
export function FavoriteStarButton({
  favorite, onToggle, className = '',
}: {
  favorite: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`flex-shrink-0 w-6 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#FFC107] ${className}`}
    >
      {favorite ? <StarFilledIcon /> : <StarIcon />}
    </button>
  );
}
