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
  /** eBay coded coupon to advertise (see wrangler.toml). Leave COUPON_CODE empty for no offer. */
  COUPON_CODE?: string;
  COUPON_PERCENT?: string;
  COUPON_MAX_OFF?: string;
  COUPON_MIN_SPEND?: string;
  COUPON_ENDS?: string;
  /** Password for the private staff tools (/staff). Set as a Pages secret. */
  STAFF_KEY?: string;
}

export interface Coupon {
  code: string;
  /** Percentage off (null for a fixed-amount coupon). */
  percent: number | null;
  /** Fixed amount off in pence (null for a percentage coupon). */
  amountOffPence: number | null;
  /** Maximum discount in pence (0 = no cap). */
  maxOffPence: number;
  /** Minimum item price in pence for the code to apply (0 = none). */
  minSpendPence: number;
  /** When the code stops working: an ISO date-time from eBay, or YYYY-MM-DD (UK) from manual settings. Null = open-ended. */
  ends: string | null;
  /** 'all', or the eBay item IDs it applies to. */
  eligible: 'all' | Set<string>;
  source: 'ebay' | 'manual';
}

const londonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

function stillValid(c: { starts?: string | null; ends: string | null }, now: Date): boolean {
  if (c.starts && Date.parse(c.starts) > now.getTime()) return false;
  if (!c.ends) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(c.ends)) return londonDate.format(now) <= c.ends;
  const t = Date.parse(c.ends);
  return Number.isFinite(t) ? t > now.getTime() : false;
}

/** Manual coupon from the settings file (overrides anything synced from eBay). */
export function manualCoupon(env: Env, now = new Date()): Coupon | null {
  const code = (env.COUPON_CODE || '').trim().toUpperCase();
  const percent = Number(env.COUPON_PERCENT);
  if (!code || !Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;
  const ends = (env.COUPON_ENDS || '').trim();
  if (ends && !/^\d{4}-\d{2}-\d{2}$/.test(ends)) return null;
  const pounds = (v: string | undefined) => Math.max(0, Math.round((Number(v) || 0) * 100));
  const c: Coupon = { code, percent, amountOffPence: null, maxOffPence: pounds(env.COUPON_MAX_OFF), minSpendPence: pounds(env.COUPON_MIN_SPEND), ends: ends || null, eligible: 'all', source: 'manual' };
  return stillValid(c, now) ? c : null;
}

/** Coupons synced from eBay by the Worker (JSON in sync_state), keeping only public, currently valid ones. */
export function syncedCoupons(json: string | null | undefined, now = new Date()): Coupon[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Coupon[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.code !== 'string' || r.isPublic === false) continue;
    const percent = typeof r.percent === 'number' && r.percent > 0 && r.percent < 100 ? r.percent : null;
    const amount = typeof r.amountOffPence === 'number' && r.amountOffPence > 0 ? r.amountOffPence : null;
    if (!percent && !amount) continue;
    const c: Coupon = {
      code: r.code.toUpperCase(), percent, amountOffPence: percent ? null : amount,
      maxOffPence: typeof r.maxOffPence === 'number' ? r.maxOffPence : 0,
      minSpendPence: typeof r.minSpendPence === 'number' ? r.minSpendPence : 0,
      ends: typeof r.ends === 'string' ? r.ends : null,
      eligible: r.eligible === 'all' ? 'all' : new Set(Array.isArray(r.eligible) ? (r.eligible as unknown[]).map(String) : []),
      source: 'ebay',
    };
    if (stillValid({ starts: typeof r.starts === 'string' ? r.starts : null, ends: c.ends }, now)) out.push(c);
  }
  return out.sort((a, b) => (b.percent || 0) - (a.percent || 0) || (b.amountOffPence || 0) - (a.amountOffPence || 0)).slice(0, 3);
}

/** All coupons to advertise: the manual one if set, otherwise whatever eBay says is running. */
export function activeCoupons(env: Env, syncedJson: string | null | undefined, now = new Date()): Coupon[] {
  const manual = manualCoupon(env, now);
  return manual ? [manual] : syncedCoupons(syncedJson, now);
}

/** Price after the coupon, in pence, or null if the code doesn't apply to this item/price. Percentages round to the penny like eBay. */
export function couponPrice(pricePence: number, c: Coupon, itemId?: string): number | null {
  if (pricePence <= 0 || pricePence < c.minSpendPence) return null;
  if (c.eligible !== 'all' && (!itemId || !c.eligible.has(itemId))) return null;
  let off = c.percent ? Math.round((pricePence * c.percent) / 100) : c.amountOffPence || 0;
  if (c.maxOffPence) off = Math.min(off, c.maxOffPence);
  off = Math.min(off, pricePence);
  return off > 0 ? pricePence - off : null;
}

/** The coupon giving the biggest saving on this item, if any. */
export function bestCoupon(coupons: Coupon[], pricePence: number, itemId: string): { coupon: Coupon; price: number } | null {
  let best: { coupon: Coupon; price: number } | null = null;
  for (const c of coupons) {
    const price = couponPrice(pricePence, c, itemId);
    if (price !== null && (!best || price < best.price)) best = { coupon: c, price };
  }
  return best;
}

/** Bump when CSS/JS change so browsers fetch the new files. */
export const ASSET_VERSION = '2026-10-01.8';

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
