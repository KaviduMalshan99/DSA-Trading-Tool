import { useEffect, useState } from 'react';
import { siteConfig } from '../siteConfig';
import { Link } from '../router';
import { show, isTodo, socialUrl, whatsappLink } from '../utils';
import { BrandLine, V } from './Common';
import { Icon, LogoMark } from './Icons';

const NAV = [
  { to: '/#learn', label: 'Curriculum' },
  { to: '/#how', label: 'How it works' },
  { to: '/#pricing', label: 'Pricing' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`site-header ${scrolled || open ? 'is-scrolled' : ''}`}>
      <div className="container header-inner">
        <Link to="/" className="logo" onClick={close} aria-label={`${siteConfig.brand.name} home`}>
          <LogoMark />
          <span className="logo-text">{siteConfig.brand.name}</span>
        </Link>
        <button
          type="button"
          className="menu-btn"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name={open ? 'close' : 'menu'} size={24} />
        </button>
        <nav id="site-nav" className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={close} className="nav-link">
              {n.label}
            </Link>
          ))}
          <Link to="/enroll" className="btn btn-primary btn-sm" onClick={close}>
            Enroll Now
          </Link>
        </nav>
      </div>
    </header>
  );
}

const SOCIAL_LABELS: Record<keyof typeof siteConfig.social, string> = {
  facebook: 'Facebook',
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export function Footer() {
  const b = siteConfig.business;
  const wa = whatsappLink();
  const hasContact = show(b.address) || show(b.phone) || !!wa || show(b.whatsapp) || show(b.email);
  const socials = Object.keys(siteConfig.social) as (keyof typeof siteConfig.social)[];
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <Link to="/" className="logo" aria-label={`${siteConfig.brand.name} home`}>
            <LogoMark size={28} />
            <span className="logo-text">{siteConfig.brand.name}</span>
          </Link>
          <BrandLine className="muted small" />
        </div>
        {hasContact && (
        <div>
          <p className="footer-heading">Contact</p>
          <ul className="footer-contact">
            {show(b.address) && (
              <li>
                <Icon name="pin" size={18} /> <span><V v={b.address} /></span>
              </li>
            )}
            {show(b.phone) && (
              <li>
                <Icon name="phone" size={18} />{' '}
                {isTodo(b.phone) ? <V v={b.phone} /> : <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>}
              </li>
            )}
            {(wa || show(b.whatsapp)) && (
              <li>
                <Icon name="chat" size={18} />{' '}
                {wa ? (
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                ) : (
                  <V v={b.whatsapp} />
                )}
              </li>
            )}
            {show(b.email) && (
              <li>
                <Icon name="mail" size={18} />{' '}
                {isTodo(b.email) ? <V v={b.email} /> : <a href={`mailto:${b.email}`}>{b.email}</a>}
              </li>
            )}
          </ul>
        </div>
        )}
        <nav aria-label="Policies">
          <p className="footer-heading">Information</p>
          <ul className="footer-links">
            <li><Link to="/terms">Terms &amp; Conditions</Link></li>
            <li><Link to="/privacy">Privacy Policy</Link></li>
            <li><Link to="/refund">Refund Policy</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </nav>
        {socials.length > 0 && (
          <div>
            <p className="footer-heading">Follow us</p>
            <ul className="social-list">
              {socials.map((k) => {
                const url = socialUrl(siteConfig.social[k]);
                return (
                  <li key={k}>
                    {url ? (
                      <a className="social-icon" href={url} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[k]}>
                        <Icon name={k} size={20} />
                      </a>
                    ) : (
                      // No URL yet: decorative only (not focusable, not announced).
                      <span className="social-icon" aria-hidden="true">
                        <Icon name={k} size={20} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <div className="container footer-bottom">
        <p className="small muted">
          © {new Date().getFullYear()} {siteConfig.brand.name}. All rights reserved.
        </p>
        <p className="small muted">
          {siteConfig.paymentsEnabled
            ? `We accept ${siteConfig.acceptedCards}.`
            : `Online card payments (${siteConfig.acceptedCards}) will be available soon.`}
        </p>
      </div>
    </footer>
  );
}
