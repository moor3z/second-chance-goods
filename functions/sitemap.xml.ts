import { dataMode, isProductionHost, siteOrigin, type Env } from '../src/config';
import { getCatalogue } from '../src/catalogue';
import { esc } from '../src/html';
import { itemPath } from '../src/format';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (dataMode(env) !== 'live' || !isProductionHost(env, url.host)) return new Response('Not found', { status: 404 });
  const origin = siteOrigin(env, request);
  const cat = getCatalogue(env);
  const [stats, items] = await Promise.all([cat.categoryStats(), cat.sitemapItems()]);
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: `${origin}/` },
    { loc: `${origin}/shop` },
    { loc: `${origin}/about` },
    ...stats.filter((s) => s.count > 0).map((s) => ({ loc: `${origin}/category/${s.slug}` })),
    ...items.map((i) => ({ loc: origin + itemPath(i), lastmod: i.startTime ? i.startTime.slice(0, 10) : undefined })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
};
