import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { ApiError, googleStartUrl } from '../../services/api';
import { Modal, ModalCloseButton } from '../UI/Modal';
import {
  Banner, FIELD_STYLES, GoogleButton, MailIcon, PasswordField, Spinner, StrengthMeter, TextField,
  primaryButtonClass,
} from './fields';

// Mirrors backend RegisterIn: EmailStr + password length 8–72.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'An account with this email already exists';
    return err.detail;
  }
  // fetch() rejects with a TypeError when the server is unreachable.
  return 'Could not reach the server. Please try again.';
}

/** The app's mark: three rising candlesticks on an accent tile. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="var(--accent)" />
      <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
        <path d="M8 11v11" opacity="0.6" />
        <path d="M14 8v12" opacity="0.8" />
        <path d="M20 5v11" />
      </g>
      <g fill="#fff">
        <rect x="6.25" y="14" width="3.5" height="5" rx="0.9" opacity="0.6" />
        <rect x="12.25" y="10.5" width="3.5" height="6" rx="0.9" opacity="0.8" />
        <rect x="18.25" y="7" width="3.5" height="6.5" rx="0.9" />
      </g>
    </svg>
  );
}

/** Low-contrast candles + price line behind the header; purely decorative. */
function HeaderPattern() {
  const candles = [
    [18, 46, 58, 52, 40], [36, 40, 56, 44, 50], [54, 30, 50, 34, 44], [72, 34, 52, 46, 40],
    [90, 22, 44, 26, 38], [108, 18, 38, 30, 22], [126, 10, 32, 14, 26], [144, 14, 30, 26, 18],
  ]; // [x, wickTop, wickBottom, open, close]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 70"
      preserveAspectRatio="xMaxYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.14 }}
    >
      <polyline
        points="0,62 18,52 36,47 54,38 72,42 90,30 108,26 126,18 144,20 160,8"
        fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round"
      />
      {candles.map(([x, top, bottom, open, close]) => {
        const up = close < open;
        const color = up ? '#26a641' : '#f85149';
        return (
          <g key={x} transform="translate(0, 4)">
            <line x1={x} x2={x} y1={top} y2={bottom} stroke={color} strokeWidth="1" />
            <rect x={x - 3} y={Math.min(open, close)} width="6" height={Math.max(Math.abs(open - close), 2)} fill={color} rx="1" />
          </g>
        );
      })}
    </svg>
  );
}

/** Rendered once from App; mounts its form only while open so fields reset on every open. */
export function AuthModal() {
  const open = useAuthStore((s) => s.authModalOpen);
  return open ? <AuthDialog /> : null;
}

function AuthDialog() {
  const mode = useAuthStore((s) => s.authModalMode);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const closeAuthModal = useAuthStore((s) => s.closeAuthModal);
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const modalError = useAuthStore((s) => s.authModalError);
  const clearModalError = useAuthStore((s) => s.clearAuthModalError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const isSignup = mode === 'signup';

  // Modal focuses the first input on open; this re-focuses it on a mode switch.
  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  // Coming back via the browser's Back button can restore this page from bfcache
  // with the Google button still disabled — re-enable it.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) setRedirecting(false); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const switchMode = (next: 'login' | 'signup') => {
    if (next === mode || submitting) return;
    setFieldErrors({});
    setFormError(null);
    setConfirm('');
    // Opening without an error clears any banner.
    openAuthModal(next);
  };

  const startGoogle = () => {
    if (redirecting) return;
    setRedirecting(true);
    window.location.assign(googleStartUrl());
  };

  // Typing dismisses the store-level banner (e.g. a failed Google sign-in).
  const onEdit = (setter: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (modalError) clearModalError();
  };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    const trimmed = email.trim();
    if (!trimmed) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(trimmed)) errs.email = 'Enter a valid email address';

    if (!password) errs.password = 'Password is required';
    else if (isSignup && password.length < PASSWORD_MIN) errs.password = `Password must be at least ${PASSWORD_MIN} characters`;
    else if (isSignup && password.length > PASSWORD_MAX) errs.password = `Password must be at most ${PASSWORD_MAX} characters`;

    if (isSignup && confirm !== password) errs.confirm = 'Passwords do not match';
    return errs;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate();
    setFieldErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      await (isSignup ? signup : login)(email.trim(), password);
      // Unmounting on close discards the field state, which clears the form.
      closeAuthModal();
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const header = (titleId: string) => (
    <div
      className="relative px-6 pt-5 pb-5 overflow-hidden flex-shrink-0"
      style={{
        background: 'linear-gradient(180deg, rgba(33,150,243,0.10) 0%, rgba(33,150,243,0) 100%)',
        borderBottom: '1px solid var(--border-color-softer)',
      }}
    >
      <HeaderPattern />
      <ModalCloseButton onClose={closeAuthModal} className="absolute top-3 right-3" />
      <div className="relative flex items-center gap-2">
        <LogoMark size={26} />
        <span className="text-sm font-bold tracking-wide text-[var(--text-primary)]">Check Your Chart</span>
      </div>
      <h2 id={titleId} className="relative mt-4 text-xl font-semibold text-[var(--text-primary)]">
        {isSignup ? 'Create your free account' : 'Welcome back'}
      </h2>
      <p className="relative mt-1 text-xs text-[var(--text-muted)]">
        {isSignup
          ? 'Keep your watchlist, drawings and alerts on every device.'
          : 'Log in to pick up your charts where you left them.'}
      </p>
    </div>
  );

  return (
    <Modal title={isSignup ? 'Create account' : 'Log in'} onClose={closeAuthModal} width={400} header={header}>
      <style>{FIELD_STYLES}</style>
      <form onSubmit={handleSubmit} noValidate className="px-6 pt-5 pb-6 flex flex-col gap-4">
        <div
          className="grid grid-cols-2 p-1 rounded-lg text-xs font-medium"
          style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)' }}
          role="group"
          aria-label="Account"
        >
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              disabled={submitting}
              className={`h-8 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                mode === m
                  ? 'text-[var(--text-primary)] bg-[var(--bg-panel-alt)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              style={mode === m ? { boxShadow: '0 1px 3px rgba(0,0,0,0.25)' } : undefined}
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        {modalError && <Banner>{modalError}</Banner>}

        <GoogleButton onClick={startGoogle} disabled={redirecting || submitting} busy={redirecting} />

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--text-muted)]" aria-hidden="true">
          <div className="flex-1" style={{ borderTop: '1px solid var(--border-color-softer)' }} />
          or
          <div className="flex-1" style={{ borderTop: '1px solid var(--border-color-softer)' }} />
        </div>

        <TextField
          inputRef={emailRef}
          id={`${uid}-email`}
          label="Email"
          icon={<MailIcon size={18} />}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={onEdit(setEmail)}
          error={fieldErrors.email}
        />

        <div>
          <PasswordField
            id={`${uid}-password`}
            label="Password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder={isSignup ? 'At least 8 characters' : undefined}
            value={password}
            onChange={onEdit(setPassword)}
            error={fieldErrors.password}
          />
          {isSignup && <StrengthMeter password={password} />}
        </div>

        {isSignup && (
          <PasswordField
            id={`${uid}-confirm`}
            label="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={onEdit(setConfirm)}
            error={fieldErrors.confirm}
          />
        )}

        {formError && <Banner>{formError}</Banner>}

        <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full h-10`}>
          {submitting && <Spinner />}
          {submitting
            ? (isSignup ? 'Creating account...' : 'Logging in...')
            : (isSignup ? 'Create account' : 'Log in')}
        </button>

        <div className="text-xs text-center text-[var(--text-muted)]">
          {isSignup ? 'Have an account? ' : 'No account? '}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? 'login' : 'signup')}
            disabled={submitting}
            className="text-[var(--accent)] hover:underline disabled:opacity-60"
          >
            {isSignup ? 'Log in' : 'Sign up'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
