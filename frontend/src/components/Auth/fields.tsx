// Form building blocks shared by AuthModal and ProfileModal: inputs with a
// leading icon, password field with show/hide, strength meter, banners, spinner
// and the icons they use (20 px stroke, like the toolbar's).

import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

// ── Icons ─────────────────────────────────────────────────────────────────────

function StrokeIcon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const MailIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></StrokeIcon>
);
export const LockIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></StrokeIcon>
);
export const EyeIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></StrokeIcon>
);
export const EyeOffIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}>
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </StrokeIcon>
);
export const UserIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></StrokeIcon>
);
export const ShieldIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" /></StrokeIcon>
);
export const SettingsIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </StrokeIcon>
);
export const LogoutIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></StrokeIcon>
);
export const PhoneIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  </StrokeIcon>
);
export const GlobeIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}>
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </StrokeIcon>
);
export const CheckIcon = ({ size }: { size?: number }) => (
  <StrokeIcon size={size}><path d="m5 12 5 5L20 7" /></StrokeIcon>
);

/** Google's multicolor "G" mark, as Google permits it on sign-in buttons. */
export function GoogleGIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin flex-shrink-0">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Banners / errors ──────────────────────────────────────────────────────────

export const ERROR_COLOR = '#f85149';

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <div id={id} className="mt-1 text-[11px]" style={{ color: ERROR_COLOR }}>{message}</div>;
}

export function Banner({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  const style = tone === 'error'
    ? { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', color: ERROR_COLOR }
    : { background: 'rgba(33,150,243,0.1)', border: '1px solid rgba(33,150,243,0.35)', color: 'var(--text-secondary)' };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="px-3 py-2 rounded-md text-xs leading-snug" style={style}>
      {children}
    </div>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────────

/** Focus ring + error state for the wrapper around an <input>; see .cyc-field below. */
export const FIELD_STYLES = `
  .cyc-field {
    display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px;
    border-radius: 6px; background: var(--bg-app); border: 1px solid var(--border-color);
    color: var(--text-muted); transition: border-color 120ms, box-shadow 120ms;
  }
  .cyc-field:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(33,150,243,0.18); color: var(--accent); }
  .cyc-field[data-invalid='true'] { border-color: ${ERROR_COLOR}; }
  .cyc-field[data-invalid='true']:focus-within { box-shadow: 0 0 0 3px rgba(248,81,73,0.18); }
  .cyc-field[data-disabled='true'] { opacity: 0.7; }
  .cyc-field input {
    flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; outline: none;
    font-size: 13px; color: var(--text-primary);
  }
  .cyc-field input::placeholder { color: var(--text-muted); opacity: 0.7; }
  .cyc-field input:read-only { color: var(--text-muted); }
  @media (prefers-reduced-motion: reduce) { .cyc-field { transition: none; } }
`;

export function FieldLabel({ htmlFor, children, aside }: { htmlFor: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-[var(--text-secondary)]">{children}</label>
      {aside}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  error?: string;
  trailing?: ReactNode;
  labelAside?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({ id, label, icon, error, trailing, labelAside, inputRef, ...input }: TextFieldProps) {
  const errId = `${id}-err`;
  return (
    <div>
      <FieldLabel htmlFor={id} aside={labelAside}>{label}</FieldLabel>
      <div className="cyc-field" data-invalid={!!error} data-disabled={!!input.disabled}>
        {icon}
        <input
          ref={inputRef}
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          {...input}
        />
        {trailing}
      </div>
      <FieldError id={errId} message={error} />
    </div>
  );
}

interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing' | 'icon'> {
  showIcon?: boolean;
}

export function PasswordField({ showIcon = true, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      icon={showIcon ? <LockIcon size={18} /> : undefined}
      // Don't let browsers offer to capitalize/correct a visible password.
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="-mr-1 w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      }
    />
  );
}

// ── Password strength (informational only — the 8–72 length rule is the real check) ──

export type Strength = 'weak' | 'fair' | 'strong';

export function passwordStrength(pw: string): Strength {
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (pw.length < 8) return 'weak';
  if ((pw.length >= 12 && variety >= 3) || (pw.length >= 16 && variety >= 2)) return 'strong';
  if (variety >= 2 || pw.length >= 12) return 'fair';
  return 'weak';
}

const STRENGTH_META: Record<Strength, { bars: number; color: string; label: string }> = {
  weak: { bars: 1, color: ERROR_COLOR, label: 'Weak' },
  fair: { bars: 2, color: '#d29922', label: 'Fair' },
  strong: { bars: 3, color: '#26a641', label: 'Strong' },
};

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const meta = STRENGTH_META[passwordStrength(password)];
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="flex-1 flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i < meta.bars ? meta.color : 'var(--border-color-softer)', transition: 'background 150ms' }}
          />
        ))}
      </div>
      <span className="text-[11px] w-12 text-right" style={{ color: meta.color }}>
        <span className="sr-only">Password strength: </span>{meta.label}
      </span>
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-panel-alt)] disabled:opacity-60 disabled:cursor-default disabled:hover:bg-[var(--accent)]';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm text-[var(--text-secondary)] bg-transparent border border-[var(--border-color)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60 disabled:cursor-default';

/** Per Google's sign-in branding: light = white + gray stroke, dark = #131314 + light stroke. */
const GOOGLE_BUTTON_STYLES = `
  .cyc-gsi-btn {
    display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 40px;
    padding: 0 12px; border-radius: 6px; font-family: Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500;
    letter-spacing: 0.25px; background: #ffffff; color: #1f1f1f; border: 1px solid #747775;
    transition: background-color 120ms, box-shadow 120ms;
  }
  .cyc-gsi-btn:hover:not(:disabled) { background: #f7f8f8; box-shadow: 0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15); }
  .cyc-gsi-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .cyc-gsi-btn:disabled { opacity: 0.6; cursor: default; }
  :root[data-theme='dark'] .cyc-gsi-btn { background: #131314; color: #e3e3e3; border-color: #8e918f; }
  :root[data-theme='dark'] .cyc-gsi-btn:hover:not(:disabled) { background: #1b1b1c; box-shadow: 0 1px 3px rgba(0,0,0,0.5); }
  @media (prefers-reduced-motion: reduce) { .cyc-gsi-btn { transition: none; } }
`;

export function GoogleButton({ onClick, disabled, busy, label = 'Continue with Google' }: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}) {
  return (
    <>
      <style>{GOOGLE_BUTTON_STYLES}</style>
      <button type="button" onClick={onClick} disabled={disabled} className="cyc-gsi-btn">
        {busy ? <Spinner size={16} /> : <GoogleGIcon size={18} />}
        <span>{busy ? 'Redirecting…' : label}</span>
      </button>
    </>
  );
}
