import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useChartStore } from '../../store/chartStore';
import type { AuthUser } from '../../services/api';
import { Avatar, displayName } from './Avatar';
import { GoogleGIcon, LogoutIcon, MailIcon, SettingsIcon, ShieldIcon, UserIcon } from './fields';

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  run: () => void;
  danger?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
}

/** Toolbar account button (avatar) with its dropdown menu. Only rendered when logged in. */
export function AccountMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const openProfile = useAuthStore((s) => s.openProfile);
  const logout = useAuthStore((s) => s.logout);

  const items: MenuItem[] = [
    { key: 'profile', label: 'Profile', icon: <UserIcon size={16} />, run: () => openProfile('profile') },
    { key: 'security', label: 'Security', icon: <ShieldIcon size={16} />, run: () => openProfile('security') },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon size={16} />, run: () => useChartStore.getState().setSettingsOpen(true) },
    { key: 'logout', label: 'Log out', icon: <LogoutIcon size={16} />, run: () => { void logout(); }, danger: true, divider: true },
  ];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  const openMenu = (index: number) => {
    setActive(index);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (item: MenuItem) => {
    // Focus goes back to the trigger first, so a dialog opened by the item
    // returns focus there when it closes.
    close();
    item.run();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openMenu(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      openMenu(items.length - 1);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keep keys away from the window-level chart/drawing shortcuts.
    e.stopPropagation();
    const n = items.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((i) => (i + 1) % n); break;
      case 'ArrowUp': e.preventDefault(); setActive((i) => (i - 1 + n) % n); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(n - 1); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': setOpen(false); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(items[active]);
        break;
    }
  };

  const name = displayName(user);
  const viaGoogle = user.auth_provider === 'google';

  return (
    <div className="relative" ref={rootRef}>
      <style>{`
        @keyframes tfDropdown {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @media (prefers-reduced-motion: reduce) { .cyc-account-menu { animation: none !important; } }
      `}</style>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu(0))}
        onKeyDown={onTriggerKeyDown}
        title={user.email}
        aria-label={`Account: ${user.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex items-center justify-center w-[34px] h-[34px] rounded-full hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-panel)]"
        style={open ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
      >
        <Avatar user={user} size={30} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="cyc-account-menu absolute top-full right-0 mt-1.5 py-1"
          style={{
            background: 'var(--bg-panel-alt)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            width: 248,
            zIndex: 1100,
            animation: 'tfDropdown 120ms ease-out',
          }}
        >
          <div className="flex items-center gap-3 px-3 pt-2 pb-3" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
            <Avatar user={user} size={40} />
            <div className="min-w-0 flex-1">
              {name && (
                <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate" title={name}>{name}</div>
              )}
              <div className={`truncate ${name ? 'text-[11px] text-[var(--text-muted)]' : 'text-xs text-[var(--text-primary)]'}`} title={user.email}>
                {user.email}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                {viaGoogle ? <GoogleGIcon size={11} /> : <MailIcon size={11} />}
                {viaGoogle ? 'Signed in with Google' : 'Email account'}
              </div>
            </div>
          </div>

          <div className="pt-1">
            {items.map((item, i) => (
              <div key={item.key}>
                {item.divider && <div className="my-1" style={{ borderTop: '1px solid var(--border-color-softer)' }} />}
                <button
                  ref={(el) => { itemRefs.current[i] = el; }}
                  type="button"
                  role="menuitem"
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left outline-none ${
                    i === active
                      ? 'bg-[var(--accent)] text-white'
                      : item.danger ? 'text-[#f85149]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <span className={i === active ? '' : 'text-[var(--text-muted)]'} style={item.danger && i !== active ? { color: '#f85149' } : undefined}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
