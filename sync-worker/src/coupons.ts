/**
 * Reads the seller's running coded coupons from eBay's Marketing API so the site can show them.
 * Needs the OAuth scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly.
 * Failures here are non-fatal: the catalogue sync has already been published.
 */
import { EbayError, withRetry, type EbayConfig, type FetchFn, type Sleep } from './ebay';

export interface SyncedCoupon {
  code: string;
  name: string;
  /** Percentage off, or null for a fixed-amount coupon. */
  percent: number | null;
  /** Fixed amount off in pence, or null for a percentage coupon. */
  amountOffPence: number | null;
  maxOffPence: number;
  minSpendPence: number;
  currency: string;
  starts: string | null;
  /** ISO date-time (UTC) when the coupon stops working. */
  ends: string | null;
  /** "all" if the coupon applies to every listing, otherwise the eligible eBay item IDs. */
  eligible: 'all' | string[];
  isPublic: boolean;
}

type Json = Record<string, any>;

const pence = (m: Json | undefined): number => {
  const n = Number(m?.value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

async function marketingGet(cfg: EbayConfig, fetchFn: FetchFn, token: string, url: string): Promise<Json> {
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-language': 'en-GB' } });
  if (res.status === 403) throw new EbayError('Marketing API refused: the eBay authorisation needs the sell.marketing.readonly scope (re-run npm run ebay:auth)', 'auth', 'scope');
  if (res.status === 401) throw new EbayError('Marketing API: token not accepted', 'auth');
  if (res.status === 429) throw new EbayError('Marketing API: rate limited', 'rate_limit');
  if (res.status >= 500) throw new EbayError(`Marketing API: server error ${res.status}`, 'transient');
  if (!res.ok) throw new EbayError(`Marketing API: HTTP ${res.status}`, 'api');
  return (await res.json()) as Json;
}

/** eBay item IDs covered by a discount, via its listing set (paginated). */
async function listingSet(cfg: EbayConfig, fetchFn: FetchFn, token: string, base: string, promotionId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0, page = 0; page < 50; page++) {
    const data = await marketingGet(cfg, fetchFn, token, `${base}/promotion/${promotionId}/get_listing_set?limit=200&offset=${offset}`);
    const listings = (data.listings as Json[]) || [];
    for (const l of listings) if (l.listingId) ids.push(String(l.listingId));
    offset += listings.length;
    if (!listings.length || !data.next || offset >= Number(data.total || 0)) break;
  }
  return ids;
}

export function parseCoupon(d: Json, listingIds: string[] | null): SyncedCoupon | null {
  const code = String(d.couponConfiguration?.couponCode || '').trim().toUpperCase();
  const rule = ((d.discountRules as Json[]) || [])[0];
  if (!code || !rule) return null;
  const b = rule.discountBenefit || {};
  const spec = rule.discountSpecification || {};
  const percent = Number(b.percentageOffOrder ?? b.percentageOffItem);
  const amount = pence(b.amountOffOrder || b.amountOffItem);
  if (!(percent > 0) && !amount) return null;
  const criterionType = String(d.inventoryCriterion?.inventoryCriterionType || '');
  const eligible: 'all' | string[] = criterionType === 'INVENTORY_ANY' ? 'all' : listingIds || ((d.inventoryCriterion?.listingIds as string[]) || []).map(String);
  const maxOff = rule.maxDiscountAmount || d.maxDiscountAmount;
  return {
    code,
    name: String(d.name || ''),
    percent: percent > 0 ? percent : null,
    amountOffPence: percent > 0 ? null : amount,
    maxOffPence: pence(maxOff),
    minSpendPence: pence(spec.minAmount),
    currency: String(maxOff?.currency || spec.minAmount?.currency || b.amountOffOrder?.currency || 'GBP'),
    starts: d.startDate ? String(d.startDate) : null,
    ends: d.endDate ? String(d.endDate) : null,
    eligible,
    // eBay values: PUBLIC_SINGLE_SELLER_COUPON (shown on eBay) or PRIVATE_SINGLE_SELLER_COUPON (shared privately).
    isPublic: String(d.couponConfiguration?.couponType || '').toUpperCase().startsWith('PUBLIC'),
  };
}

export async function fetchRunningCoupons(cfg: EbayConfig, fetchFn: FetchFn, token: string, sleep: Sleep, marketplace = 'EBAY_GB'): Promise<SyncedCoupon[]> {
  const base = new URL(cfg.tradingUrl).origin + '/sell/marketing/v1';
  const list = await withRetry(
    () => marketingGet(cfg, fetchFn, token, `${base}/promotion?marketplace_id=${marketplace}&promotion_type=CODED_COUPON&promotion_status=RUNNING&limit=200`),
    sleep,
  );
  const out: SyncedCoupon[] = [];
  for (const p of ((list.promotions as Json[]) || []).slice(0, 10)) {
    if (p.promotionType && p.promotionType !== 'CODED_COUPON') continue;
    const id = String(p.promotionId || '');
    if (!id) continue;
    const detailUrl = `${base}/item_promotion/${id}@${marketplace}`;
    const detail = await withRetry(() => marketingGet(cfg, fetchFn, token, detailUrl), sleep);
    const type = String(detail.inventoryCriterion?.inventoryCriterionType || '');
    const explicit = (detail.inventoryCriterion?.listingIds as string[] | undefined)?.length;
    const ids = type !== 'INVENTORY_ANY' && !explicit ? await listingSet(cfg, fetchFn, token, base, `${id}@${marketplace}`) : null;
    const c = parseCoupon(detail, ids);
    if (c) out.push(c);
  }
  return out;
}
