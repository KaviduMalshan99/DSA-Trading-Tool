import { useState, type FormEvent } from 'react';
import { siteConfig } from '../siteConfig';
import { Link } from '../router';
import { V, usePageTitle } from '../components/Common';
import { Icon } from '../components/Icons';
import { isValidEmail, normalizeLkPhone, priceText, refundSummary, whatsappLink } from '../utils';

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'agree', string>>;

export default function Enroll() {
  usePageTitle('Enroll');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const clearErr = (k: keyof Errors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const price = priceText();
  const normalizedPhone = normalizeLkPhone(phone);

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Enter your full name.';
    if (!isValidEmail(email)) e.email = 'Enter a valid email address, for example name@example.com.';
    if (!normalizedPhone) e.phone = 'Enter a valid Sri Lankan phone number, for example 077 123 4567.';
    if (!agree) e.agree = 'You need to agree to the Terms & Conditions and Refund Policy to continue.';
    return e;
  }

  function enrollMessage(): string {
    return [
      `Hello ${siteConfig.brand.name}, I would like to enroll in the ${siteConfig.courseName}.`,
      `Name: ${name.trim()}`,
      `Email: ${email.trim()}`,
      `Phone: ${normalizedPhone ?? phone.trim()}`,
    ].join('\n');
  }

  const waFallback = whatsappLink(enrollMessage());

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setNotice(null);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }

    if (!siteConfig.paymentsEnabled) {
      if (waFallback) {
        window.open(waFallback, '_blank', 'noopener,noreferrer');
      } else {
        setNotice('WhatsApp enrolment is not available yet. Please use the details on our Contact page.');
      }
      return;
    }

    // TODO(payments): once OnePay is approved, call the backend here:
    //   const res = await fetch('/api/v1/course/checkout', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: normalizedPhone }),
    //   });
    //   const { redirect_url } = await res.json();   // OnePay hosted payment page
    //   window.location.href = redirect_url;
    // OnePay should return the customer to /payment/result?status=success|failed|pending&ref=...
    setNotice('Online payment is not connected yet. Please contact us on WhatsApp to enroll.');
  }

  const fieldClass = (k: keyof Errors) => `field ${errors[k] ? 'has-error' : ''}`;
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <section className="section page" aria-labelledby="enroll-title">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Enrolment</p>
          <h1 id="enroll-title" className="page-title">Enroll in the course</h1>
          <p className="section-lead">Enter your details below. We use them only to register you and send your course access.</p>
        </div>

        <div className="checkout-grid">
          <form className="card form" onSubmit={onSubmit} noValidate aria-describedby={errorCount ? 'form-errors' : undefined}>
            {errorCount > 0 && (
              <div id="form-errors" className="alert alert-error" role="alert">
                <Icon name="alert" size={20} />
                <span>
                  Please correct {errorCount === 1 ? 'the highlighted field' : `the ${errorCount} highlighted fields`} below.
                </span>
              </div>
            )}

            <div className={fieldClass('name')}>
              <label htmlFor="f-name">Full name</label>
              <input
                id="f-name"
                autoComplete="name"
                value={name}
                onChange={(e) => { setName(e.target.value); clearErr('name'); }}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'e-name' : undefined}
                required
              />
              {errors.name && <p id="e-name" className="err">{errors.name}</p>}
            </div>
            <div className={fieldClass('email')}>
              <label htmlFor="f-email">Email address</label>
              <input
                id="f-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearErr('email'); }}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'e-email' : undefined}
                required
              />
              {errors.email && <p id="e-email" className="err">{errors.email}</p>}
            </div>
            <div className={fieldClass('phone')}>
              <label htmlFor="f-phone">Phone number</label>
              <input
                id="f-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="077 123 4567"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); clearErr('phone'); }}
                onBlur={() => normalizedPhone && setPhone(normalizedPhone)}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? 'e-phone' : 'h-phone'}
                required
              />
              {errors.phone ? (
                <p id="e-phone" className="err">{errors.phone}</p>
              ) : (
                <p id="h-phone" className="hint">
                  {normalizedPhone ? `Saved as ${normalizedPhone}` : 'Sri Lankan mobile number, e.g. 077 123 4567 or +94 77 123 4567'}
                </p>
              )}
            </div>
            <div className={`${fieldClass('agree')} check`}>
              <input
                id="f-agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => { setAgree(e.target.checked); clearErr('agree'); }}
                aria-invalid={!!errors.agree}
                aria-describedby={errors.agree ? 'e-agree' : undefined}
              />
              <label htmlFor="f-agree">
                I agree to the{' '}
                <Link to="/terms" target="_blank">Terms &amp; Conditions</Link> and the{' '}
                <Link to="/refund" target="_blank">Refund Policy</Link>.
              </label>
            </div>
            {errors.agree && <p id="e-agree" className="err">{errors.agree}</p>}
            <p className="hint">{refundSummary()}</p>

            {siteConfig.paymentsEnabled ? (
              <button type="submit" className="btn btn-primary btn-lg btn-block">
                <Icon name="lock" size={20} /> Continue to payment{price ? ` (${price})` : ''}
              </button>
            ) : (
              <>
                <div className="alert alert-info">
                  <Icon name="info" size={20} />
                  <span>
                    Online card payments are not available yet. When you continue, WhatsApp opens with your details so we
                    can confirm your place and send the payment details.
                  </span>
                </div>
                <button type="submit" className="btn btn-primary btn-lg btn-block">
                  <Icon name="chat" size={20} /> Continue on WhatsApp
                </button>
              </>
            )}
            {notice && (
              <p className="err" role="alert">
                {notice}
              </p>
            )}
            <p className="hint center">
              {siteConfig.paymentsEnabled
                ? `We accept ${siteConfig.acceptedCards}. Card details are entered on the payment gateway's secure page.`
                : `${siteConfig.acceptedCards} card payments will be available soon.`}
            </p>
          </form>

          <aside className="card summary" aria-labelledby="sum-title">
            <h2 id="sum-title" className="sum-title">Order summary</h2>
            <p className="sum-course">{siteConfig.courseName}</p>
            <p className="muted small">
              {siteConfig.deliveryMode} · {siteConfig.schedule}
            </p>
            <ul className="checklist small">
              {siteConfig.included.map((x) => (
                <li key={x}>
                  <Icon name="check" size={16} /> {x}
                </li>
              ))}
            </ul>
            <div className="sum-total">
              <span>Total</span>
              <strong>{price ?? <V v={null} fallback="-" />}</strong>
            </div>
            <p className="muted small">
              Questions before enrolling? <Link to="/contact">Contact us</Link>.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
