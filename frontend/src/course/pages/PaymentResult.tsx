import { siteConfig } from '../siteConfig';
import { Link } from '../router';
import { usePageTitle } from '../components/Common';
import { Icon } from '../components/Icons';
import { whatsappLink } from '../utils';

/**
 * Landing page after the payment gateway redirects back:
 *   /payment/result?status=success|failed|pending&ref=XXXX
 * NOTE: the query string is only for display. The real payment status must be
 * confirmed server-side (gateway callback/webhook) before granting access.
 */

type Status = 'success' | 'failed' | 'pending' | 'unknown';

const COPY: Record<Status, { title: string; body: string; tone: string; icon: 'check' | 'clock' | 'alert' }> = {
  success: {
    title: 'Payment successful',
    body: 'Thank you for enrolling. We will send the Zoom link and your invitation to the student support group by email and WhatsApp shortly.',
    tone: 'ok',
    icon: 'check',
  },
  pending: {
    title: 'Payment pending',
    body: 'Your payment is being confirmed. You will receive a confirmation once it is complete. Please do not pay again.',
    tone: 'warn',
    icon: 'clock',
  },
  failed: {
    title: 'Payment not completed',
    body: 'Your payment was not completed and you have not been charged. You can try again or contact us for help.',
    tone: 'bad',
    icon: 'alert',
  },
  unknown: {
    title: 'Payment status unavailable',
    body: 'We could not read the payment status. If money was deducted from your account, please contact us with your payment reference.',
    tone: 'warn',
    icon: 'alert',
  },
};

export default function PaymentResult() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('status') ?? '').toLowerCase();
  const status: Status = raw === 'success' || raw === 'failed' || raw === 'pending' ? raw : 'unknown';
  // Display-safe reference: limit charset and length.
  const ref = (params.get('ref') ?? '').replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 64);
  const c = COPY[status];
  const wa = whatsappLink(
    `Hello ${siteConfig.brand.name}, I have a question about my payment for the ${siteConfig.courseName}${ref ? ` (reference: ${ref})` : ''}. Status: ${status}.`,
  );

  usePageTitle(c.title);

  return (
    <section className="section page" aria-labelledby="pr-title">
      <div className="container narrow">
        <div className={`card result result-${c.tone}`} role="status">
          <span className="result-icon">
            <Icon name={c.icon} size={32} />
          </span>
          <h1 id="pr-title" className="page-title">{c.title}</h1>
          <p className="muted">{c.body}</p>
          {ref && (
            <p className="small">
              Reference: <code>{ref}</code>
            </p>
          )}
          <div className="result-actions">
            {status === 'failed' && (
              <Link to="/enroll" className="btn btn-primary">
                Try again
              </Link>
            )}
            {wa && status !== 'success' && (
              <a className="btn btn-secondary" href={wa} target="_blank" rel="noopener noreferrer">
                <Icon name="chat" size={20} /> WhatsApp us
              </a>
            )}
            <Link to="/" className="btn btn-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
