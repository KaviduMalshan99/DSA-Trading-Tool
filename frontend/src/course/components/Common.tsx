import { useEffect, useRef, useState, type ReactNode } from 'react';
import { siteConfig } from '../siteConfig';
import { IS_DEV, isTodo } from '../utils';
import { ImagePlaceholder } from './Icons';

/**
 * Render a config value. Filled -> the value. Unfilled -> a visible TODO tag in
 * dev, nothing in production.
 */
export function V({ v, fallback = null }: { v: string | number | null | undefined; fallback?: ReactNode }) {
  if (!isTodo(v)) return <>{v}</>;
  if (IS_DEV) return <mark className="todo">{v === null || v === undefined || v === '' ? 'TODO' : String(v)}</mark>;
  return <>{fallback}</>;
}

/** Dev-only banner (e.g. "this page is a template"). */
export function DevNote({ children }: { children: ReactNode }) {
  if (!IS_DEV) return null;
  return (
    <p className="dev-note" role="note">
      <strong>DEV ONLY:</strong> {children}
    </p>
  );
}

/** Set document.title as "<page> | <brand>" (or just the SEO title for home). */
export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} | ${siteConfig.brand.name}` : siteConfig.seo.title;
  }, [page]);
}

/** "CYC Digital Academy - checkyourchart.net" line linking brand and domain. */
export function BrandLine({ className }: { className?: string }) {
  const { name, domain } = siteConfig.brand;
  return (
    <p className={`brand-line ${className ?? ''}`}>
      {name} - {domain}
    </p>
  );
}

/**
 * Hero image (siteConfig.hero). A neutral placeholder panel sits underneath and
 * stays visible while the image loads or if the file is missing, so a broken
 * image is never shown.
 */
export function HeroImage({ className }: { className?: string }) {
  const { image, alt, width, height } = siteConfig.hero;
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(isTodo(image) ? 'failed' : 'loading');
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // Covers an image that finished loading (or failed) before React attached its handlers.
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);
  return (
    <div className={`media-frame ${className ?? ''}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <ImagePlaceholder label={state === 'failed' ? alt : ''} />
      {state !== 'failed' && (
        <img
          ref={ref}
          src={image}
          alt={alt}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          className={state === 'loaded' ? 'is-loaded' : undefined}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </div>
  );
}
