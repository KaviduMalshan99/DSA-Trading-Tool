import type { IconName } from '../siteConfig';

/** Generic outline icons (inline SVG, one stroke width). */

const PATHS: Record<
  IconName | 'live' | 'chat' | 'mail' | 'phone' | 'pin' | 'clock' | 'check' | 'calendar' | 'lock' | 'globe' | 'menu' | 'close' | 'alert' | 'info' | 'arrow'
  | 'facebook' | 'youtube' | 'instagram' | 'tiktok',
  string
> = {
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  page: 'M4 4h16v16H4zM4 9h16M9 9v11',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  megaphone: 'M3 10v4h4l7 5V5L7 10H3zM18 8a5 5 0 0 1 0 8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.6',
  record: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z',
  certificate: 'M4 3h16v12H4zM8 7h8M8 11h5M14 15l-1 6 3-2 3 2-1-6',
  live: 'M2 7h13v10H2zM15 11l7-4v10l-7-4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.1A8 8 0 1 1 21 12z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  pin: 'M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  check: 'M4 12l5 5L20 6',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v6M12 16.5v.5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  // Simple outline social glyphs (same stroke style as the rest).
  facebook: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM16 8h-2a2 2 0 0 0-2 2v11M9.5 13H15',
  youtube: 'M6 5h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4zM10 9.5l4.5 2.5-4.5 2.5z',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  tiktok: 'M14 3v11.5a4.5 4.5 0 1 1-4.5-4.5M14 3a5 5 0 0 0 5 5',
};

export type AnyIcon = keyof typeof PATHS;

export function Icon({ name, size = 24, className }: { name: AnyIcon; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Brand mark: three rising bars on an accent tile. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="8" y="17" width="4" height="8" rx="1" fill="#fff" />
      <rect x="14" y="12" width="4" height="13" rx="1" fill="#fff" />
      <rect x="20" y="7" width="4" height="18" rx="1" fill="#fff" />
    </svg>
  );
}

/** Neutral light-grey panel with a simple chart icon, used until hero.jpg exists. */
export function ImagePlaceholder({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className="media-ph"
    >
      <rect width="400" height="300" fill="#eef2f7" />
      <g fill="none" stroke="#cbd5e1" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M150 110v80h100" />
        <path d="M166 172l24-26 18 16 34-38" />
      </g>
    </svg>
  );
}
