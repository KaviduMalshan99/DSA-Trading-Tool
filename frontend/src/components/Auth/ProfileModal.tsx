import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type FormEvent, type KeyboardEvent, type ReactNode,
} from 'react';
import { useAuthStore, type ProfileTab } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { api, ApiError, googleStartUrl, type AuthUser, type ProfilePatch } from '../../services/api';
import { COUNTRIES, countryByCode, type Country } from '../../data/countries';
import { Modal, ModalCloseButton } from '../UI/Modal';
import { Avatar, displayName } from './Avatar';
import {
  Banner, CheckIcon, FIELD_STYLES, FieldError, FieldLabel, GlobeIcon, GoogleGIcon, MailIcon, PasswordField,
  PhoneIcon, ShieldIcon, Spinner, StrengthMeter, TextField, UserIcon, primaryButtonClass, secondaryButtonClass,
} from './fields';

// ── Validation (mirrors backend/app/api/auth.py ProfileUpdateIn / ChangePasswordIn) ──

const NAME_MAX = 50;
const NAME_RE = /^[\p{L}\p{M} \-'’.]+$/u;
const HAS_LETTER_RE = /\p{L}/u;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const DEFAULT_COUNTRY = 'LK';

const normalizeName = (v: string) => v.trim().split(/\s+/).filter(Boolean).join(' ');

function nameError(value: string, label: string): string | undefined {
  const v = normalizeName(value);
  if (!v) return undefined; // empty clears the field
  if (Array.from(v).length > NAME_MAX) return `${label} must be at most ${NAME_MAX} characters`;
  if (!NAME_RE.test(v)) return `${label} may only contain letters, spaces, hyphens, apostrophes and periods`;
  if (!HAS_LETTER_RE.test(v)) return `${label} must contain at least one letter`;
  return undefined;
}

/** Local number -> E.164 using the country's dial code. A number typed with a leading + is taken as-is. */
function buildPhone(local: string, dial: string): string | null {
  const cleaned = local.replace(/[\s\-().]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return cleaned;
  return dial + cleaned.replace(/^0/, '');
}

/** Stored E.164 -> the local part for the given country, or the full number if it belongs elsewhere. */
function splitPhone(phone: string | null, country: Country | undefined): string {
  if (!phone) return '';
  if (country && phone.startsWith(country.dial)) return phone.slice(country.dial.length);
  return phone;
}

function apiMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  return 'Could not reach the server. Please try again.';
}

// ── Modal shell ───────────────────────────────────────────────────────────────

/** Rendered once from App. */
export function ProfileModal() {
  const open = useAuthStore((s) => s.profileOpen);
  const user = useAuthStore((s) => s.user);
  if (!open || !user) return null;
  return <ProfileDialog user={user} />;
}

const TABS: { key: ProfileTab; label: string; icon: ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <UserIcon size={16} /> },
  { key: 'security', label: 'Security', icon: <ShieldIcon size={16} /> },
];

function ProfileDialog({ user }: { user: AuthUser }) {
  const tab = useAuthStore((s) => s.profileTab);
  const openProfile = useAuthStore((s) => s.openProfile);
  const closeProfile = useAuthStore((s) => s.closeProfile);
  const uid = useId();
  const tabRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({ profile: null, security: null });

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: ProfileTab = tab === 'profile' ? 'security' : 'profile';
    openProfile(next);
    tabRefs.current[next]?.focus();
  };

  const header = (titleId: string) => (
    <div className="flex-shrink-0 px-5 pt-4" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">Account</h2>
        <ModalCloseButton onClose={closeProfile} />
      </div>
      <div role="tablist" aria-label="Account sections" className="flex gap-1 mt-2 -mb-px">
        {TABS.map((t) => {
          const selected = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => openProfile(t.key)}
              onKeyDown={onTabKeyDown}
              className={`flex items-center gap-1.5 px-3 h-9 text-xs font-medium border-b-2 outline-none focus-visible:bg-[var(--bg-hover)] rounded-t ${
                selected
                  ? 'border-[var(--accent)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal title="Account" onClose={closeProfile} width={520} header={header}>
      <style>{FIELD_STYLES}</style>
      {/* Both panels stay mounted so unsaved edits survive switching tabs. */}
      <div id={`${uid}-panel-profile`} role="tabpanel" aria-labelledby={`${uid}-tab-profile`} hidden={tab !== 'profile'}>
        <ProfilePanel user={user} />
      </div>
      <div id={`${uid}-panel-security`} role="tabpanel" aria-labelledby={`${uid}-tab-security`} hidden={tab !== 'security'}>
        <SecurityPanel user={user} />
      </div>
    </Modal>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

interface ProfileForm {
  firstName: string;
  lastName: string;
  country: string;
  phoneLocal: string;
}

function formFromUser(user: AuthUser): ProfileForm {
  const country = user.country ?? DEFAULT_COUNTRY;
  return {
    firstName: user.first_name ?? '',
    lastName: user.last_name ?? '',
    country,
    phoneLocal: splitPhone(user.phone, countryByCode(country)),
  };
}

interface ProfileErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

function ProfilePanel({ user }: { user: AuthUser }) {
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useToastStore((s) => s.addToast);
  const uid = useId();

  const [form, setForm] = useState<ProfileForm>(() => formFromUser(user));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const country = countryByCode(form.country);
  const dial = country?.dial ?? '';

  // The changes relative to what the server has. Country is included whenever
  // anything is saved while it is still unset, since the form shows the default.
  const patch = useMemo<ProfilePatch>(() => {
    const p: ProfilePatch = {};
    const first = normalizeName(form.firstName) || null;
    const last = normalizeName(form.lastName) || null;
    const phone = buildPhone(form.phoneLocal, dial);
    if (first !== user.first_name) p.first_name = first;
    if (last !== user.last_name) p.last_name = last;
    if (phone !== user.phone) p.phone = phone;
    if (form.country !== user.country) p.country = form.country;
    return p;
  }, [form, dial, user]);

  const baseline = useMemo(() => formFromUser(user), [user]);
  const dirty = (Object.keys(baseline) as (keyof ProfileForm)[]).some((k) => baseline[k] !== form[k]);

  const update = (key: keyof ProfileForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setServerError(null);
    if (key === 'firstName' || key === 'lastName') setErrors((e) => ({ ...e, [key]: undefined }));
    if (key === 'phoneLocal' || key === 'country') setErrors((e) => ({ ...e, phone: undefined }));
  };

  const validate = (): ProfileErrors => {
    const errs: ProfileErrors = {};
    // Only fields being changed: a name stored from Google that this form's rules
    // would reject must not block saving, say, a phone number.
    if ('first_name' in patch) errs.firstName = nameError(form.firstName, 'First name');
    if ('last_name' in patch) errs.lastName = nameError(form.lastName, 'Last name');
    if ('phone' in patch && patch.phone !== null && !E164_RE.test(patch.phone ?? '')) {
      errs.phone = 'Enter a valid phone number';
    }
    return Object.fromEntries(Object.entries(errs).filter(([, v]) => v)) as ProfileErrors;
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !dirty) return;
    const errs = validate();
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    if (Object.keys(patch).length === 0) {
      // Only formatting changed (e.g. spaces in the phone number) — nothing to send.
      setForm(formFromUser(user));
      return;
    }

    setSaving(true);
    try {
      const updated = await api.authUpdateProfile(patch);
      setUser(updated);
      setForm(formFromUser(updated));
      addToast('Profile saved', 'success');
    } catch (err) {
      // 401 is handled globally (session expired); everything else shows here.
      if (!(err instanceof ApiError && err.status === 401)) setServerError(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const viaGoogle = !!user.avatar_url;
  const memberSince = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const name = displayName(user);

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="px-5 py-5 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar user={user} size={64} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)] truncate" title={name || user.email}>
              {name || user.email}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <GoogleGIcon size={12} />
              {viaGoogle ? 'Photo from your Google account' : 'Sign in with Google to use your Google photo'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            id={`${uid}-first`}
            label="First name"
            autoComplete="given-name"
            maxLength={NAME_MAX + 10}
            value={form.firstName}
            onChange={(e) => update('firstName')(e.target.value)}
            error={errors.firstName}
          />
          <TextField
            id={`${uid}-last`}
            label="Last name"
            autoComplete="family-name"
            maxLength={NAME_MAX + 10}
            value={form.lastName}
            onChange={(e) => update('lastName')(e.target.value)}
            error={errors.lastName}
          />
        </div>

        <div>
          <FieldLabel htmlFor={`${uid}-country`}>Country</FieldLabel>
          <CountrySelect id={`${uid}-country`} value={form.country} onChange={update('country')} />
        </div>

        <div>
          <FieldLabel htmlFor={`${uid}-phone`} aside={<span className="text-[10px] text-[var(--text-muted)]">Optional</span>}>
            Phone
          </FieldLabel>
          <div className="cyc-field" data-invalid={!!errors.phone}>
            <PhoneIcon size={18} />
            <span className="text-[13px] text-[var(--text-muted)] tabular-nums pr-2" style={{ borderRight: '1px solid var(--border-color-softer)' }}>
              {dial || '+'}
            </span>
            <input
              id={`${uid}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="77 123 4567"
              value={form.phoneLocal}
              onChange={(e) => update('phoneLocal')(e.target.value)}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? `${uid}-phone-err` : undefined}
            />
          </div>
          <FieldError id={`${uid}-phone-err`} message={errors.phone} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            id={`${uid}-email`}
            label="Email"
            icon={<MailIcon size={18} />}
            value={user.email}
            readOnly
            title={user.email}
          />
          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">Member since</div>
            <div className="h-[38px] flex items-center text-[13px] text-[var(--text-muted)]">{memberSince}</div>
          </div>
        </div>

        {serverError && <Banner>{serverError}</Banner>}
      </div>

      <div
        className="sticky bottom-0 flex items-center justify-end gap-2 px-5 py-3"
        style={{ borderTop: '1px solid var(--border-color-softer)', background: 'var(--bg-panel-alt)' }}
      >
        {dirty && !saving && (
          <button
            type="button"
            onClick={() => { setForm(formFromUser(user)); setErrors({}); setServerError(null); }}
            className={secondaryButtonClass}
          >
            Discard
          </button>
        )}
        <button type="submit" disabled={!dirty || saving} className={primaryButtonClass}>
          {saving && <Spinner />}
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

// ── Country select (searchable) ───────────────────────────────────────────────

const LIST_MAX_HEIGHT = 240;

function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = countryByCode(value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const digits = q.replace(/^\+/, '');
    return COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(q)
      || c.code.toLowerCase() === q
      || (/^\d+$/.test(digits) && c.dial.slice(1).startsWith(digits)));
  }, [query]);

  // The list is position:fixed so the modal's scroll area can't clip it; it opens
  // upward when there isn't room below.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const popHeight = LIST_MAX_HEIGHT + 52;
    const below = window.innerHeight - r.bottom;
    setPos(below >= popHeight || below >= r.top
      ? { left: r.left, width: r.width, top: r.bottom + 4 }
      : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    // Any scroll or resize would detach the fixed list from its trigger.
    const onMove = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    setQuery('');
    const idx = COUNTRIES.findIndex((c) => c.code === value);
    setActive(Math.max(idx, 0));
    setOpen(true);
  };

  const pick = (c: Country | undefined) => {
    if (c) onChange(c.code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); break;
      case 'Enter': e.preventDefault(); pick(filtered[active]); break; // don't submit the form
      case 'Escape':
        // Close just the list, not the whole dialog.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab': setOpen(false); break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openList(); }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cyc-field w-full text-left"
      >
        <GlobeIcon size={18} />
        <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--text-primary)]">
          {selected?.name ?? 'Select a country'}
        </span>
        {selected && <span className="text-xs text-[var(--text-muted)] tabular-nums">{selected.dial}</span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-[var(--text-muted)]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && pos && (
        <div
          ref={popRef}
          className="fixed flex flex-col"
          style={{
            ...pos,
            zIndex: 1200,
            background: 'var(--bg-panel-alt)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div className="p-2" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-label="Search countries"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].code}` : undefined}
              aria-autocomplete="list"
              placeholder="Search country or code"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKeyDown}
              className="w-full h-8 px-2 rounded text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Countries" className="overflow-y-auto py-1" style={{ maxHeight: LIST_MAX_HEIGHT }}>
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--text-muted)]">No matches</li>
            )}
            {filtered.map((c, i) => (
              <li
                key={c.code}
                id={`${listId}-${c.code}`}
                data-index={i}
                role="option"
                aria-selected={c.code === value}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer ${
                  i === active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'
                }`}
              >
                <span className="flex-1 truncate">{c.name}</span>
                <span className={`tabular-nums ${i === active ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{c.dial}</span>
                <span className="w-3.5 flex-shrink-0">{c.code === value && <CheckIcon size={14} />}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────

function MethodRow({ icon, label, on, onText, offText }: {
  icon: ReactNode; label: string; on: boolean; onText: string; offText: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)]" style={{ background: 'var(--bg-app)' }}>
        {icon}
      </span>
      <span className="flex-1 text-[13px] text-[var(--text-primary)]">{label}</span>
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={on
          ? { color: '#26a641', background: 'rgba(38,166,65,0.12)' }
          : { color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
      >
        {on ? onText : offText}
      </span>
    </div>
  );
}

interface PasswordErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

function SecurityPanel({ user }: { user: AuthUser }) {
  const setUser = useAuthStore((s) => s.setUser);
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const addToast = useToastStore((s) => s.addToast);
  const uid = useId();

  const hasPassword = user.has_password;
  const googleConnected = user.google_linked || user.auth_provider === 'google';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

  const clearFeedback = () => { setServerError(null); setReauth(false); };

  const validate = (): PasswordErrors => {
    const errs: PasswordErrors = {};
    if (hasPassword && !current) errs.current = 'Enter your current password';
    if (!next) errs.next = 'Enter a new password';
    else if (next.length < PASSWORD_MIN) errs.next = `Password must be at least ${PASSWORD_MIN} characters`;
    else if (next.length > PASSWORD_MAX) errs.next = `Password must be at most ${PASSWORD_MAX} characters`;
    if (next && confirm !== next) errs.confirm = 'Passwords do not match';
    return errs;
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const errs = validate();
    setErrors(errs);
    clearFeedback();
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const updated = await api.authChangePassword(
        hasPassword ? { current_password: current, new_password: next } : { new_password: next },
      );
      setUser(updated);
      setCurrent('');
      setNext('');
      setConfirm('');
      addToast('Password updated. Other devices were signed out.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.detail === 'reauth_required') setReauth(true);
      else if (!(err instanceof ApiError && err.status === 401)) setServerError(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onLogoutAll = async () => {
    setLoggingOutAll(true);
    setLogoutAllError(null);
    try {
      await logoutAll(); // reloads the page on success
    } catch (err) {
      setLoggingOutAll(false);
      if (!(err instanceof ApiError && err.status === 401)) setLogoutAllError(apiMessage(err));
    }
  };

  return (
    <div className="px-5 py-5 flex flex-col gap-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Sign-in methods</h3>
        <div className="rounded-lg divide-y divide-[var(--border-color-softer)]" style={{ border: '1px solid var(--border-color-softer)' }}>
          <MethodRow icon={<MailIcon size={16} />} label="Email & password" on={hasPassword} onText="On" offText="Off" />
          <MethodRow icon={<GoogleGIcon size={16} />} label="Google" on={googleConnected} onText="Connected" offText="Not connected" />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
          {hasPassword ? 'Change password' : 'Set a password'}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {hasPassword
            ? 'Changing your password signs you out on every other device.'
            : 'A password lets you also log in with your email address. Other devices will be signed out.'}
        </p>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          {/* Lets password managers attach the new password to the right account. */}
          <input type="email" autoComplete="username" value={user.email} readOnly hidden />
          {hasPassword && (
            <PasswordField
              id={`${uid}-current`}
              label="Current password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setErrors((x) => ({ ...x, current: undefined })); clearFeedback(); }}
              error={errors.current}
            />
          )}
          <div>
            <PasswordField
              id={`${uid}-new`}
              label="New password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={next}
              onChange={(e) => { setNext(e.target.value); setErrors((x) => ({ ...x, next: undefined })); clearFeedback(); }}
              error={errors.next}
            />
            <StrengthMeter password={next} />
          </div>
          <PasswordField
            id={`${uid}-confirm`}
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); clearFeedback(); }}
            error={errors.confirm}
          />

          {reauth && (
            <Banner tone="info">
              <div>For security, please sign in with Google again, then set your password.</div>
              <button
                type="button"
                onClick={() => window.location.assign(googleStartUrl())}
                className="mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-panel-alt)] hover:bg-[var(--bg-hover)]"
                style={{ border: '1px solid var(--border-color)' }}
              >
                <GoogleGIcon size={14} />
                Sign in with Google
              </button>
            </Banner>
          )}
          {serverError && <Banner>{serverError}</Banner>}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving && <Spinner />}
              {saving ? 'Saving...' : hasPassword ? 'Update password' : 'Set password'}
            </button>
          </div>
        </form>
      </section>

      <section className="pt-5" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Sessions</h3>
        {!confirmingLogoutAll ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-[var(--text-muted)]">Signed in somewhere you don't recognize? End every session, including this one.</p>
            <button
              type="button"
              onClick={() => setConfirmingLogoutAll(true)}
              className={`${secondaryButtonClass} flex-shrink-0`}
              style={{ color: '#f85149', borderColor: 'rgba(248,81,73,0.5)' }}
            >
              Log out of all devices
            </button>
          </div>
        ) : (
          <div className="rounded-lg p-3 flex flex-col gap-3" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.35)' }}>
            <p className="text-xs text-[var(--text-secondary)]">
              You'll be signed out on every device, including this one. Unsynced changes here are uploaded first.
            </p>
            {logoutAllError && <Banner>{logoutAllError}</Banner>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConfirmingLogoutAll(false); setLogoutAllError(null); }}
                disabled={loggingOutAll}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void onLogoutAll(); }}
                disabled={loggingOutAll}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#da3633' }}
              >
                {loggingOutAll && <Spinner />}
                {loggingOutAll ? 'Signing out...' : 'Log out everywhere'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
