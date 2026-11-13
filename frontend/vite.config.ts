import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { siteConfig } from './src/course/siteConfig';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Brand mark (rising bars on an accent tile), used as the course-site favicon. */
const COURSE_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2563eb"/>' +
      '<rect x="8" y="17" width="4" height="8" rx="1" fill="#fff"/><rect x="14" y="12" width="4" height="13" rx="1" fill="#fff"/>' +
      '<rect x="20" y="7" width="4" height="18" rx="1" fill="#fff"/></svg>',
  );

/**
 * VITE_SITE_MODE=course: swap the <head> for the course site (title, meta
 * description, Open Graph, favicon, Inter web font). Must be in the static HTML
 * because Facebook's link-preview crawler does not run JavaScript.
 * In chart mode index.html is left untouched.
 */
function courseHtml(): Plugin {
  return {
    name: 'course-site-html',
    transformIndexHtml(html) {
      const s = siteConfig.seo;
      const url = s.siteUrl.replace(/\/+$/, '');
      const hasOg = existsSync(resolve(__dirname, 'public', s.ogImage.replace(/^\//, '')));
      const head = [
        `<title>${esc(s.title)}</title>`,
        `<meta name="description" content="${esc(s.description)}" />`,
        `<meta name="application-name" content="${esc(siteConfig.brand.name)}" />`,
        `<meta name="theme-color" content="#ffffff" />`,
        `<link rel="canonical" href="${esc(url)}/" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${esc(siteConfig.brand.name)}" />`,
        `<meta property="og:title" content="${esc(s.title)}" />`,
        `<meta property="og:description" content="${esc(s.description)}" />`,
        `<meta property="og:url" content="${esc(url)}/" />`,
        `<meta property="og:locale" content="en_US" />`,
        hasOg ? `<meta property="og:image" content="${esc(url + s.ogImage)}" />` : '',
        hasOg ? `<meta property="og:image:alt" content="${esc(siteConfig.brand.name + ' - ' + siteConfig.courseName)}" />` : '',
        hasOg ? `<meta name="twitter:card" content="summary_large_image" />` : `<meta name="twitter:card" content="summary" />`,
        `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
        `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
        `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />`,
        `<style>html,body{background:#fff;color:#0f172a}</style>`,
      ]
        .filter(Boolean)
        .join('\n    ');
      return html
        .replace(/<html[^>]*>/, '<html lang="en">')
        .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${COURSE_FAVICON}" />`)
        .replace(/<title>[\s\S]*?<\/title>/, head);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isCourse = env.VITE_SITE_MODE === 'course';

  return {
    plugins: [react(), ...(isCourse ? [courseHtml()] : [])],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:8000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
