import { dataMode, isProductionHost, type Env } from '../src/config';
import { appContext } from '../src/app';
import { notFoundPage } from '../src/pages/errors';

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://i.ebayimg.com",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const demo = dataMode(env) === 'demo';
  const prod = isProductionHost(env, url.host);

  // Demo data must never appear on the real domain, even if DATA_MODE is set by mistake.
  if (demo && prod) {
    return new Response('Demo mode is disabled on the production domain. Set DATA_MODE=live for this environment.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'retry-after': '300' },
    });
  }

  let res = await next();
  // Unmatched paths fall through to the static asset server; give them the site's own 404 page.
  if (res.status === 404 && !res.headers.has('x-scg-page')) {
    res = notFoundPage((await appContext(request, env)).ctx);
  }
  const out = new Response(res.body, res);
  out.headers.delete('x-scg-page');
  const hdr = out.headers;
  hdr.set('content-security-policy', CSP);
  hdr.set('x-content-type-options', 'nosniff');
  hdr.set('referrer-policy', 'strict-origin-when-cross-origin');
  hdr.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  hdr.set('x-frame-options', 'DENY');
  // Only the real domain in live mode may be indexed (keeps *.pages.dev previews and demos out of Google).
  if (demo || !prod) {
    hdr.set('x-robots-tag', 'noindex, nofollow');
    hdr.set('cache-control', 'no-store');
  }
  return out;
};
