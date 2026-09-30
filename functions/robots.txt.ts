import { dataMode, isProductionHost, siteOrigin, type Env } from '../src/config';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const allow = dataMode(env) === 'live' && isProductionHost(env, url.host);
  const body = allow
    ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteOrigin(env, request)}/sitemap.xml\n`
    : `# Preview or demo deployment: not for indexing\nUser-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
