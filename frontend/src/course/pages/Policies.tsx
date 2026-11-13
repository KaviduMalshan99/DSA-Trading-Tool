import { type ReactNode } from 'react';
import { siteConfig } from '../siteConfig';
import { Link } from '../router';
import { BrandLine, DevNote, V, usePageTitle } from '../components/Common';
import { Icon } from '../components/Icons';
import { isTodo, priceText, refundWindowText, show, whatsappLink } from '../utils';

/*
 * POLICY TEMPLATES: review with your own legal advisor before relying on them.
 * All business facts come from siteConfig.ts.
 */

const b = siteConfig.business;
const brand = siteConfig.brand.name;

function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title);
  return (
    <section className="section page" aria-labelledby="pol-title">
      <article className="container doc policy">
        <DevNote>This page is a TEMPLATE. Review the wording and fill the TODOs in siteConfig.ts before going live.</DevNote>
        <header className="doc-head">
          <p className="eyebrow">Legal</p>
          <h1 id="pol-title" className="page-title">{title}</h1>
          <p className="muted small">Last updated: {siteConfig.policiesLastUpdated}</p>
          <BrandLine className="muted small" />
        </header>
        {children}
      </article>
    </section>
  );
}

/** "CYC Digital Academy (checkyourchart.net)". Not a registered company: no legal suffix or reg. number. */
function BusinessName() {
  return (
    <>
      <strong>{brand}</strong> ({siteConfig.brand.domain})
    </>
  );
}

function EmailLink() {
  if (isTodo(b.email)) return <V v={b.email} fallback="the email on our Contact page" />;
  return <a href={`mailto:${b.email}`}>{b.email}</a>;
}

/* ------------------------------------------------------------------ TERMS */
export function Terms() {
  return (
    <PolicyPage title="Terms & Conditions">
      <h2>1. About us</h2>
      <p>
        This website is operated by <BusinessName />
        {show(b.address) && (
          <>
            , <V v={b.address} />
          </>
        )}
        . By enrolling in our course or using this website you agree to these Terms.
      </p>

      <h2>2. The service</h2>
      <p>
        We provide an online educational course, the <strong>{siteConfig.courseName}</strong>, delivered as live
        sessions on the Zoom video platform, with session recordings, a student support group and a certificate of
        completion. The class schedule is shared with enrolled students and may be updated with reasonable notice.
      </p>

      <h2>3. Enrolment and payment</h2>
      <ul>
        <li>Enrolment is confirmed once full payment of the course fee{priceText() ? ` (${priceText()})` : ''} is received.</li>
        <li>Prices are in Sri Lankan Rupees (LKR) and include all applicable charges unless stated otherwise.</li>
        <li>
          Card payments are processed by our third-party payment gateway. We do not see or store your card details.
        </li>
        <li>You must provide accurate name, email and phone details so we can send you access information.</li>
      </ul>

      <h2>4. Access</h2>
      <ul>
        <li>After enrolment you will receive the Zoom link and support-group invitation by email and/or WhatsApp.</li>
        <li>Access is personal to you. Do not share links, recordings or login details with others.</li>
        <li>You are responsible for your own device, internet connection and Zoom app.</li>
        <li>We may remove access without refund if these Terms are seriously or repeatedly breached.</li>
      </ul>

      <h2>5. Conduct</h2>
      <p>
        Be respectful to the instructor and other students in sessions and in the support group. Harassment, spam,
        hate speech, sharing illegal content or promoting unrelated products is not allowed.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        All course materials, including live sessions, recordings, slides, documents and templates, are owned by{' '}
        {brand} or its licensors and are provided for your personal, non-commercial learning only. You may not
        record, copy, resell, publish or distribute them without our written permission.
      </p>

      <h2>7. No guarantee of results</h2>
      <p>
        The course teaches skills and methods. Any income or growth depends on your own effort, content, consistency
        and on third-party platforms (such as Facebook/Meta) whose rules and monetization programmes we do not control.
        We do not guarantee any earnings or results.
      </p>

      <h2>8. Refunds</h2>
      <p>
        Refunds and cancellations are governed by our <Link to="/refund">Refund &amp; Cancellation Policy</Link>.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the extent permitted by law, {brand} is not liable for indirect or consequential losses, loss of
        income, or issues caused by third-party platforms, internet outages or circumstances beyond our reasonable
        control. Our total liability for any claim relating to the course is limited to the course fee you paid.
      </p>

      <h2>10. Changes</h2>
      <p>We may update these Terms from time to time. The latest version is always published on this page.</p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Democratic Socialist Republic of Sri Lanka, and the courts of Sri
        Lanka have jurisdiction over any dispute.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms: <EmailLink /> or see our <Link to="/contact">Contact page</Link>.
      </p>
    </PolicyPage>
  );
}

/* ------------------------------------------------------------------ PRIVACY */
export function Privacy() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        This Privacy Policy explains how <BusinessName />
        {show(b.address) && (
          <>
            , <V v={b.address} />,
          </>
        )}{' '}
        collects and uses your personal information when you visit this website or enrol in our course.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><strong>Enrolment details:</strong> your full name, email address and phone number.</li>
        <li><strong>Payment information:</strong> the payment status and reference number returned by our payment gateway. We never receive or store your full card number, CVV or PIN.</li>
        <li><strong>Messages</strong> you send us by WhatsApp, email or phone.</li>
        <li><strong>Basic technical data</strong> such as browser type and pages visited, collected by our hosting provider for security and performance.</li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To register you for the course and send the Zoom link, recordings and support-group access.</li>
        <li>To process payments and refunds, and keep records required by law.</li>
        <li>To contact you about the course (schedule changes, reminders, certificates).</li>
        <li>To answer your questions and provide support.</li>
      </ul>
      <p>We do not sell or rent your personal information.</p>

      <h2>3. Card payments</h2>
      <p>
        Online card payments are handled entirely by our licensed third-party payment gateway on its secure page. Card
        data is entered directly with the gateway and is never stored on our servers.
      </p>

      <h2>4. Sharing</h2>
      <p>
        We share information only with service providers needed to run the course: the payment gateway, Zoom (for live
        sessions), WhatsApp/email providers (for communication) and our hosting provider, or when required by law.
      </p>

      <h2>5. Retention and security</h2>
      <p>
        We keep enrolment records only as long as needed for the course, support and legal/accounting requirements, and
        protect them with reasonable technical and organisational measures.
      </p>

      <h2>6. Your rights</h2>
      <p>
        You can ask to see, correct or delete your personal information at any time by contacting us at <EmailLink />
        {show(b.phone) && (
          <>
            {' '}or <V v={b.phone} />
          </>
        )}
        . We will respond within a reasonable time.
      </p>

      <h2>7. Changes</h2>
      <p>We may update this policy; the latest version is always on this page.</p>
    </PolicyPage>
  );
}

/* ------------------------------------------------------------------ REFUND */
export function Refund() {
  const r = siteConfig.refund;
  return (
    <PolicyPage title="Refund & Cancellation Policy">
      <p>
        We want you to be happy with the <strong>{siteConfig.courseName}</strong>. This policy explains when you can
        cancel your enrolment and receive a refund.
      </p>

      <h2>1. Eligibility for a refund</h2>
      <ul>
        <li>
          Refund requests are accepted within <strong>{refundWindowText()}</strong> of payment.
        </li>
        {r.extraConditions.map((c) => (
          <li key={c}>{c}</li>
        ))}
        <li>If we cancel or postpone the course and you cannot attend the new dates, you will receive a full refund.</li>
      </ul>

      <h2>2. How to request a refund</h2>
      <p>
        Send your full name, phone number, payment reference and reason to <EmailLink />
        {whatsappLink() && (
          <>
            {' '}or{' '}
            <a href={whatsappLink()!} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </>
        )}
        .
      </p>

      <h2>3. Processing</h2>
      <p>
        Approved refunds are processed within <strong>{r.processingDays} working days</strong> after approval, back to
        the original payment method (card refunds go back to the same card through the payment gateway). Your bank may
        take additional time to show the credit.
      </p>

      <h2>4. Cancellation</h2>
      <p>
        You may cancel your enrolment at any time. Cancellations outside the refund conditions above are not eligible
        for a refund, but you keep access until the end of the course.
      </p>

      <h2>5. Contact</h2>
      <p>
        Questions about refunds? See our <Link to="/contact">Contact page</Link>.
      </p>
    </PolicyPage>
  );
}

/* ------------------------------------------------------------------ CONTACT */
export function Contact() {
  const wa = whatsappLink(`Hello ${brand}, I have a question about the ${siteConfig.courseName}.`);
  usePageTitle('Contact');
  const rows: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; node: ReactNode }[] = [
    { icon: 'pin', label: 'Address', value: b.address, node: <V v={b.address} /> },
    {
      icon: 'phone',
      label: 'Phone',
      value: b.phone,
      node: isTodo(b.phone) ? <V v={b.phone} /> : <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>,
    },
    {
      icon: 'chat',
      label: 'WhatsApp',
      value: wa ? 'ok' : b.whatsapp,
      node: wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer">
          Chat on WhatsApp ({b.phone})
        </a>
      ) : (
        <V v={b.whatsapp} />
      ),
    },
    { icon: 'mail', label: 'Email', value: b.email, node: <EmailLink /> },
    { icon: 'clock', label: 'Hours', value: b.hours, node: <V v={b.hours} /> },
  ];
  return (
    <section className="section page" aria-labelledby="contact-page-title">
      <div className="container doc">
        <DevNote>Fill the business details in siteConfig.ts → business.</DevNote>
        <header className="doc-head">
          <p className="eyebrow">Support</p>
          <h1 id="contact-page-title" className="page-title">Contact</h1>
          <p className="section-lead">
            For questions about the course, enrolment or payments, contact us using any of the details below.
          </p>
        </header>
        <div className="card contact-card">
          <p className="contact-brand">
            <BusinessName />
          </p>
          <dl className="contact-list">
            {rows
              .filter((r) => show(r.value))
              .map((r) => (
                <div key={r.label} className="contact-row">
                  <dt>
                    <Icon name={r.icon} size={20} /> {r.label}
                  </dt>
                  <dd>{r.node}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
