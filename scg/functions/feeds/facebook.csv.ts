import { dataMode, siteOrigin, type Env } from '../../src/config';
import { getCatalogue } from '../../src/catalogue';
import { buildCsv } from '../../src/feeds';

// Product feed for Meta Commerce Manager (Facebook Shop / Instagram / catalogue ads).
// Meta fetches this on a schedule. Only fresh data is served, in line with eBay's 6-hour display rule.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (dataMode(env) !== 'live') return new Response('Not available in demo mode', { status: 404 });
  try {
    const cat = getCatalogue(env);
    const meta = await cat.meta();
    if (!meta.snapshotId || meta.stale) {
      return new Response('Catalogue is being refreshed; try again later', { status: 503, headers: { 'retry-after': '1800' } });
    }
    const csv = buildCsv(await cat.allItems(), siteOrigin(env, request));
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'cache-control': 'public, max-age=900',
        'x-robots-tag': 'noindex',
      },
    });
  } catch {
    return new Response('Catalogue unavailable', { status: 503, headers: { 'retry-after': '1800' } });
  }
};
