/** Current eBay UK asking prices for an item, via the official Browse API (active listings only). */
import type { EbayConfig, FetchFn } from './ebay';

export interface Comp { title: string; pricePence: number; condition: string; url: string; image: string | null; listedAt?: string | null; ageDays?: number | null }
export interface ListingAge { known: number; medianDays: number | null; avgDays: number | null; pctOver30: number | null; pctOver60: number | null; newestDays: number | null; oldestDays: number | null }
export interface CompsSummary { query: string; count: number; minPence: number | null; medianPence: number | null; maxPence: number | null; items: Comp[]; age?: ListingAge }

/** How long the current unsold listings have been sitting: a slow-mover signal. */
export function listingAge(items: { ageDays?: number | null }[]): ListingAge {
  const ages = items.map((i) => i.ageDays).filter((a): a is number => typeof a === 'number' && a >= 0).sort((a, b) => a - b);
  const n = ages.length;
  const pct = (p: (a: number) => boolean) => (n ? Math.round((ages.filter(p).length / n) * 100) : null);
  return {
    known: n,
    medianDays: n ? ages[Math.floor(n / 2)] : null,
    avgDays: n ? Math.round(ages.reduce((a, b) => a + b, 0) / n) : null,
    pctOver30: pct((a) => a > 30),
    pctOver60: pct((a) => a > 60),
    newestDays: n ? ages[0] : null,
    oldestDays: n ? ages[n - 1] : null,
  };
}

export async function activeComps(cfg: EbayConfig, fetchFn: FetchFn, token: string, query: string, now = new Date()): Promise<CompsSummary> {
  const base = new URL(cfg.tradingUrl).origin;
  const url = `${base}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=100&fieldgroups=EXTENDED&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE},itemLocationCountry:GB')}`;
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB', accept: 'application/json' } });
  if (!res.ok) throw new Error(`Browse API: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { itemSummaries?: Record<string, any>[] };
  const items: Comp[] = (data.itemSummaries || [])
    .filter((i) => i.price && i.price.currency === 'GBP' && Number(i.price.value) > 0)
    .map((i) => {
      const listedAt = i.itemCreationDate ? String(i.itemCreationDate) : i.itemOriginDate ? String(i.itemOriginDate) : null;
      const t = listedAt ? Date.parse(listedAt) : NaN;
      return {
        title: String(i.title || ''),
        pricePence: Math.round(Number(i.price.value) * 100),
        condition: String(i.condition || ''),
        url: String(i.itemWebUrl || ''),
        image: i.image?.imageUrl ? String(i.image.imageUrl) : null,
        listedAt,
        ageDays: Number.isFinite(t) ? Math.max(0, Math.round((now.getTime() - t) / 86_400_000)) : null,
      };
    });
  const prices = items.map((i) => i.pricePence).sort((a, b) => a - b);
  const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)) : null;
  return { query, count: items.length, minPence: prices[0] ?? null, medianPence: median, maxPence: prices[prices.length - 1] ?? null, items: items.slice(0, 10), age: listingAge(items) };
}

/** eBay listings that look like the photo (official Browse API search_by_image). */
export async function imageMatches(cfg: EbayConfig, fetchFn: FetchFn, token: string, imageBase64: string): Promise<CompsSummary> {
  const base = new URL(cfg.tradingUrl).origin;
  const res = await fetchFn(`${base}/buy/browse/v1/item_summary/search_by_image?limit=20`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB', accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) throw new Error(`Browse image search: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { itemSummaries?: Record<string, any>[] };
  const items: Comp[] = (data.itemSummaries || [])
    .filter((i) => i.price && Number(i.price.value) > 0)
    .map((i) => ({ title: String(i.title || ''), pricePence: i.price.currency === 'GBP' ? Math.round(Number(i.price.value) * 100) : 0, condition: String(i.condition || ''), url: String(i.itemWebUrl || ''), image: i.image?.imageUrl ? String(i.image.imageUrl) : null }));
  const prices = items.map((i) => i.pricePence).filter((p) => p > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  return { query: 'image', count: items.length, minPence: prices[0] ?? null, medianPence: median, maxPence: prices[prices.length - 1] ?? null, items: items.slice(0, 12) };
}
