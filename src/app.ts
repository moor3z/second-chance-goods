/// <reference types="@cloudflare/workers-types" />
import { activeCoupon, dataMode, isProductionHost, siteOrigin, type Env } from './config';
import { CatalogueUnavailable, getCatalogue, type Catalogue } from './catalogue';
import type { RenderCtx } from './ui';
import type { CatalogueMeta } from './types';

export interface AppContext {
  ctx: RenderCtx;
  cat: Catalogue;
}

const EMPTY_META: CatalogueMeta = { mode: 'live', snapshotId: null, lastSuccessAt: null, itemCount: 0, stale: true, sellerFeedbackPercent: null };

/** Build the per-request render context. Never throws: a broken database renders the "unavailable" states. */
export async function appContext(request: Request, env: Env): Promise<AppContext> {
  const url = new URL(request.url);
  const mode = dataMode(env);
  const indexable = mode === 'live' && isProductionHost(env, url.host);
  let cat: Catalogue;
  let meta = EMPTY_META;
  let stats: RenderCtx['stats'] = [];
  try {
    cat = getCatalogue(env);
    [meta, stats] = await Promise.all([cat.meta(), cat.categoryStats()]);
  } catch (err) {
    console.error(JSON.stringify({ event: 'catalogue_unavailable', message: (err as Error).message, missingBinding: err instanceof CatalogueUnavailable }));
    cat = failingCatalogue;
  }
  return {
    cat,
    ctx: {
      env,
      origin: siteOrigin(env, request),
      meta,
      stats,
      path: url.pathname,
      searchQ: url.pathname === '/shop' || url.pathname.startsWith('/category/') ? (url.searchParams.get('q') || '').slice(0, 80) : '',
      indexable,
      coupon: activeCoupon(env),
    },
  };
}

const fail = async (): Promise<never> => {
  throw new Error('catalogue unavailable');
};
const failingCatalogue: Catalogue = {
  meta: async () => EMPTY_META,
  search: fail,
  item: async () => null,
  categoryStats: async () => [],
  featured: async () => [],
  sitemapItems: async () => [],
};
