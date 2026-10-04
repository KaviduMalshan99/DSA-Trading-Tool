import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { ApiError } from '../../services/api';

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

const inputClass = 'w-full px-2 py-1.5 rounded text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
const inputStyle = { background: 'var(--bg-app)', border: '1px solid var(--border-color)' };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <div id={id} className="mt-1 text-[11px] text-[#f85149]">{message}</div>;
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const isSignup = mode === 'signup';
  const title = isSignup ? 'Create account' : 'Log in';

  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  const switchMode = () => {
    setFieldErrors({});
    setFormError(null);
    setConfirm('');
    openAuthModal(isSignup ? 'login' : 'signup');
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeAuthModal(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        // Keys stop here so window-level shortcuts (drawing Delete/Ctrl+Z, etc.)
        // don't fire while the dialog has focus.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') closeAuthModal();
        }}
        className="flex flex-col outline-none"
        style={{ width: 360, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          <span id={`${uid}-title`} className="text-[var(--text-secondary)] font-semibold text-base">{title}</span>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-4 flex flex-col gap-3 select-text">
          <div>
            <label htmlFor={`${uid}-email`} className="block mb-1 text-xs text-[var(--text-muted)]">Email</label>
            <input
              ref={emailRef}
              id={`${uid}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? `${uid}-email-err` : undefined}
              className={inputClass}
              style={inputStyle}
            />
            <FieldError id={`${uid}-email-err`} message={fieldErrors.email} />
          </div>

          <div>
            <label htmlFor={`${uid}-password`} className="block mb-1 text-xs text-[var(--text-muted)]">Password</label>
            <input
              id={`${uid}-password`}
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? `${uid}-password-err` : undefined}
              className={inputClass}
              style={inputStyle}
            />
            <FieldError id={`${uid}-password-err`} message={fieldErrors.password} />
          </div>

          {isSignup && (
            <div>
              <label htmlFor={`${uid}-confirm`} className="block mb-1 text-xs text-[var(--text-muted)]">Confirm password</label>
              <input
                id={`${uid}-confirm`}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={!!fieldErrors.confirm}
                aria-describedby={fieldErrors.confirm ? `${uid}-confirm-err` : undefined}
                className={inputClass}
                style={inputStyle}
              />
              <FieldError id={`${uid}-confirm-err`} message={fieldErrors.confirm} />
            </div>
          )}

          {formError && (
            <div role="alert" className="px-2 py-1.5 rounded text-xs text-[#f85149]" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)' }}>
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 disabled:cursor-default disabled:hover:bg-[var(--accent)]"
          >
            {submitting
              ? (isSignup ? 'Creating account...' : 'Logging in...')
              : (isSignup ? 'Create account' : 'Log in')}
          </button>

          <div className="text-xs text-center text-[var(--text-muted)]">
            {isSignup ? 'Have an account? ' : 'No account? '}
            <button
              type="button"
              onClick={switchMode}
              disabled={submitting}
              className="text-[var(--accent)] hover:underline disabled:opacity-60"
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
