/** Current eBay UK asking prices for an item, via the official Browse API (active listings only). */
import type { EbayConfig, FetchFn } from './ebay';

export interface Comp { title: string; pricePence: number; condition: string; url: string; image: string | null }
export interface CompsSummary { query: string; count: number; minPence: number | null; medianPence: number | null; maxPence: number | null; items: Comp[] }

export async function activeComps(cfg: EbayConfig, fetchFn: FetchFn, token: string, query: string): Promise<CompsSummary> {
  const base = new URL(cfg.tradingUrl).origin;
  const url = `${base}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=50&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE},itemLocationCountry:GB')}`;
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB', accept: 'application/json' } });
  if (!res.ok) throw new Error(`Browse API: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { itemSummaries?: Record<string, any>[] };
  const items: Comp[] = (data.itemSummaries || [])
    .filter((i) => i.price && i.price.currency === 'GBP' && Number(i.price.value) > 0)
    .map((i) => ({
      title: String(i.title || ''),
      pricePence: Math.round(Number(i.price.value) * 100),
      condition: String(i.condition || ''),
      url: String(i.itemWebUrl || ''),
      image: i.image?.imageUrl ? String(i.image.imageUrl) : null,
    }));
  const prices = items.map((i) => i.pricePence).sort((a, b) => a - b);
  const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)) : null;
  return { query, count: items.length, minPence: prices[0] ?? null, medianPence: median, maxPence: prices[prices.length - 1] ?? null, items: items.slice(0, 10) };
}
