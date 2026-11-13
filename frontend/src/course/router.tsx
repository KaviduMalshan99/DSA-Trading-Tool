import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** Tiny pathname router (no dependency). */

export const ROUTES = ['/', '/enroll', '/terms', '/privacy', '/refund', '/contact', '/payment/result'] as const;
export type Route = (typeof ROUTES)[number];

const NAV_EVENT = 'course:navigate';

function normalize(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (ROUTES as readonly string[]).includes(p) ? (p as Route) : '/';
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search + window.location.hash) {
    scrollToHashOrTop();
    return;
  }
  const samePage = normalize(new URL(to, window.location.href).pathname) === normalize(window.location.pathname);
  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(NAV_EVENT));
  // Same page (e.g. "/#faq" while on "/"): no re-render happens, so scroll here.
  if (samePage) requestAnimationFrame(scrollToHashOrTop);
}

export function scrollToHashOrTop() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => normalize(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(normalize(window.location.pathname));
    window.addEventListener('popstate', update);
    window.addEventListener(NAV_EVENT, update);
    // Unknown path -> home: fix the URL bar too.
    if (normalize(window.location.pathname) === '/' && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/' + window.location.hash);
    }
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return route;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** Internal link: real <a href> (works with middle-click / no JS), client-side on normal click. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || rest.target === '_blank' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}
