import { useEffect, useState } from 'react';
import type { AuthUser } from '../../services/api';

// Mid-dark tones: white initials stay legible on them in both themes.
const PALETTE = ['#1d4ed8', '#6d28d9', '#be185d', '#0f766e', '#15803d', '#c2410c', '#0e7490', '#4f46e5'];

const ALNUM = /[\p{L}\p{N}]/u;

type AvatarUser = Pick<AuthUser, 'id' | 'email' | 'first_name' | 'last_name' | 'avatar_url'>;

export function initialsFor(user: AvatarUser): string {
  // Array.from splits by code point, so a non-BMP first letter isn't cut in half.
  const first = Array.from(user.first_name?.trim() ?? '')[0] ?? '';
  const last = Array.from(user.last_name?.trim() ?? '')[0] ?? '';
  if (first || last) return (first + last).toUpperCase();
  const local = user.email.split('@')[0] ?? '';
  const chars = Array.from(local).filter((c) => ALNUM.test(c)).slice(0, 2).join('');
  return (chars || '?').toUpperCase();
}

export function displayName(user: Pick<AuthUser, 'first_name' | 'last_name'>): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ');
}

interface Props {
  user: AvatarUser;
  size?: number;
}

export function Avatar({ user, size = 30 }: Props) {
  const url = user.avatar_url;
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        width={size}
        height={size}
        alt=""
        // Google's photo CDN rejects requests carrying a foreign Referer.
        referrerPolicy="no-referrer"
        decoding="async"
        className="rounded-full flex-shrink-0 object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="rounded-full flex-shrink-0 inline-flex items-center justify-center font-sans font-semibold text-white leading-none select-none"
      style={{
        width: size,
        height: size,
        background: PALETTE[Math.abs(user.id) % PALETTE.length],
        fontSize: Math.round(size * 0.4),
        letterSpacing: '0.02em',
      }}
    >
      {initialsFor(user)}
    </span>
  );
}
