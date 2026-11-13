import { siteConfig, type Faq } from '../siteConfig';
import { Link } from '../router';
import { V, HeroImage, usePageTitle } from '../components/Common';
import { Icon } from '../components/Icons';
import { isTodo, priceText, refundSummary, show, whatsappLink } from '../utils';

function buildFaq(): Faq[] {
  const payment: Faq = siteConfig.paymentsEnabled
    ? {
        q: 'How can I pay?',
        a: `You can pay securely online by card (${siteConfig.acceptedCards}) on the enrolment page. Card details are entered on the payment gateway's own page.`,
      }
    : {
        q: 'How can I pay?',
        a: `Online card payments (${siteConfig.acceptedCards}) will be available soon. ${siteConfig.manualPaymentNote}`,
      };
  const refund: Faq = {
    q: 'Can I get a refund?',
    a: `Yes. ${refundSummary()} The full terms are in our Refund Policy.`,
  };
  const faq = [...siteConfig.faq];
  faq.splice(4, 0, payment, refund);
  return faq;
}

function Price({ className }: { className: string }) {
  const price = priceText();
  if (!price && !show(siteConfig.priceLKR)) return null;
  return (
    <p className={className}>
      <span className="now">{price ?? <V v={null} />}</span>
    </p>
  );
}

export default function Home() {
  usePageTitle();

  const wa = whatsappLink(`Hello ${siteConfig.brand.name}, I would like more information about the ${siteConfig.courseName}.`);
  const b = siteConfig.business;
  const faq = buildFaq();
  const facts = [
    { icon: 'calendar' as const, label: 'Schedule', value: siteConfig.schedule },
    { icon: 'globe' as const, label: 'Language', value: siteConfig.language },
  ].filter((f) => show(f.value));

  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="label">
              <Icon name="live" size={16} /> {siteConfig.heroLabel}
            </p>
            <h1 id="hero-title" className="hero-title">
              {siteConfig.courseName}
            </h1>
            <p className="hero-sub">{siteConfig.heroSubtitle}</p>
            <Price className="hero-price" />
            <div className="hero-cta">
              <Link to="/enroll" className="btn btn-primary btn-lg">
                Enroll Now
              </Link>
              <Link to="/#learn" className="btn btn-secondary btn-lg">
                See what you'll learn
              </Link>
            </div>
            <ul className="trust" aria-label="Included with the course">
              {siteConfig.trustPoints.map((t) => (
                <li key={t}>
                  <Icon name="check" size={18} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroImage className="hero-media" />
        </div>
      </section>

      {/* ---------------- WHAT YOU'LL LEARN ---------------- */}
      <section className="section" id="learn" aria-labelledby="learn-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Curriculum</p>
            <h2 id="learn-title" className="section-title">What you'll learn</h2>
            <p className="section-lead">
              Five practical modules that take you from setting up a page to planning and running marketing campaigns.
            </p>
          </div>
          <ul className="card-grid cols-3">
            {siteConfig.learn.map((l) => (
              <li key={l.title} className="card">
                <span className="card-icon">
                  <Icon name={l.icon} size={24} />
                </span>
                <h3>{l.title}</h3>
                <p className="muted">{l.text}</p>
              </li>
            ))}
          </ul>
          <p className="disclaimer" role="note">
            <Icon name="info" size={18} /> <span>{siteConfig.earningsDisclaimer}</span>
          </p>
        </div>
      </section>

      {/* ---------------- WHAT YOU GET ---------------- */}
      <section className="section alt" aria-labelledby="get-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Included</p>
            <h2 id="get-title" className="section-title">What you get</h2>
          </div>
          <ul className="card-grid cols-4">
            {siteConfig.includes.map((i) => (
              <li key={i.title} className="card">
                <span className="card-icon">
                  <Icon name={i.icon} size={24} />
                </span>
                <h3>{i.title}</h3>
                <p className="muted">{i.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="section" id="how" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Process</p>
            <h2 id="how-title" className="section-title">How it works</h2>
          </div>
          <ol className="steps">
            {siteConfig.steps.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-num" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p className="muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- PRICING ---------------- */}
      <section className="section alt" id="pricing" aria-labelledby="price-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Pricing</p>
            <h2 id="price-title" className="section-title">One course, everything included</h2>
          </div>
          <div className="price-card">
            <div className="price-top">
              <p className="price-course">{siteConfig.courseName}</p>
              <Price className="price-big" />
              <p className="muted small">One-time payment · {siteConfig.deliveryMode}</p>
            </div>
            {facts.length > 0 && (
              <dl className="facts">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>
                      <Icon name={f.icon} size={18} /> {f.label}
                    </dt>
                    <dd><V v={f.value} /></dd>
                  </div>
                ))}
              </dl>
            )}
            <ul className="checklist">
              {siteConfig.included.map((x) => (
                <li key={x}>
                  <Icon name="check" size={18} /> {x}
                </li>
              ))}
            </ul>
            <Link to="/enroll" className="btn btn-primary btn-lg btn-block">
              Enroll Now
            </Link>
            <p className="muted small center">
              {siteConfig.paymentsEnabled
                ? `Secure card payment (${siteConfig.acceptedCards}).`
                : 'Online card payments will be available soon. Until then, enrolment is completed on WhatsApp.'}
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="section" id="faq" aria-labelledby="faq-title">
        <div className="container narrow">
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title" className="section-title">Frequently asked questions</h2>
          </div>
          <div className="faq">
            {faq.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>
                  <span>{f.q}</span>
                  <span className="faq-toggle" aria-hidden="true" />
                </summary>
                <div className="faq-a">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CONTACT STRIP ---------------- */}
      <section className="contact-strip" id="contact" aria-labelledby="contact-title">
        <div className="container contact-inner">
          <div>
            <h2 id="contact-title" className="contact-title">Have a question?</h2>
            <p className="muted">Contact us on WhatsApp or by email and we will get back to you.</p>
          </div>
          <div className="contact-actions">
            {wa ? (
              <a className="btn btn-primary" href={wa} target="_blank" rel="noopener noreferrer">
                <Icon name="chat" size={20} /> WhatsApp
              </a>
            ) : (
              show(b.whatsapp) && (
                <span className="btn btn-secondary" aria-disabled="true">
                  <Icon name="chat" size={20} /> <V v={b.whatsapp} />
                </span>
              )
            )}
            {show(b.email) &&
              (isTodo(b.email) ? (
                <span className="btn btn-secondary">
                  <Icon name="mail" size={20} /> <V v={b.email} />
                </span>
              ) : (
                <a className="btn btn-secondary" href={`mailto:${b.email}`}>
                  <Icon name="mail" size={20} /> {b.email}
                </a>
              ))}
            <Link to="/contact" className="btn btn-secondary">
              Contact details
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
