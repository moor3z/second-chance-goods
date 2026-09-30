/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB?: D1Database;
  /** "live" (default) reads the synced eBay snapshot from D1. "demo" shows illustrative data only. */
  DATA_MODE?: string;
  /** Canonical public origin, e.g. https://www.example.co.uk (no trailing slash). */
  SITE_URL?: string;
  /** Comma-separated hostnames that count as production. Demo mode is refused on these. */
  PRODUCTION_HOSTS?: string;
  /** eBay requires displayed listing data to be no more than 6 hours older than eBay. */
  MAX_DATA_AGE_HOURS?: string;
  /** Shown to visitors so they know how often data refreshes. Match the sync Worker. */
  SYNC_INTERVAL_MINUTES?: string;
  /** Allow a snapshot synced from a non-eBay endpoint (local testing only). */
  ALLOW_TEST_SOURCE?: string;
}

/** Bump when CSS/JS change so browsers fetch the new files. */
export const ASSET_VERSION = '2026-09-30.4';

export const BUSINESS = {
  legalName: 'Second Chance Goods Ltd',
  name: 'Second Chance Goods',
  ebayStoreUrl: 'https://www.ebay.co.uk/str/secondchancegoodsltd',
  ebayFeedbackUrl: 'https://www.ebay.co.uk/str/secondchancegoodsltd?_tab=feedback',
  ebayContactUrl: 'https://www.ebay.co.uk/cnt/intermediatedFAQ?requested=second_chance_goods_ltd',
  ebaySellerId: 'second_chance_goods_ltd',
  /**
   * Figures shown on the public eBay shop page, checked on the date below.
   * Feedback % is refreshed automatically by the sync when available; items sold is not
   * available from the API, so it is shown as a floor ("15K+") and should be rechecked occasionally.
   */
  verified: { feedbackPercent: '99.8%', itemsSoldFloor: '15K+', checkedOn: '2026-09-30' },
} as const;

export function dataMode(env: Env): 'live' | 'demo' {
  return (env.DATA_MODE || 'live').toLowerCase() === 'demo' ? 'demo' : 'live';
}

export function productionHosts(env: Env): string[] {
  return (env.PRODUCTION_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isProductionHost(env: Env, host: string): boolean {
  return productionHosts(env).includes(host.toLowerCase());
}

export function siteOrigin(env: Env, request: Request): string {
  const configured = (env.SITE_URL || '').replace(/\/+$/, '');
  return configured || new URL(request.url).origin;
}

export function maxDataAgeHours(env: Env): number {
  const n = Number(env.MAX_DATA_AGE_HOURS || '6');
  return Number.isFinite(n) && n > 0 ? Math.min(n, 6) : 6;
}

export function syncIntervalMinutes(env: Env): number {
  const n = Number(env.SYNC_INTERVAL_MINUTES || '30');
  return Number.isFinite(n) && n > 0 ? n : 30;
}
