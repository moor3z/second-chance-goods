/**
 * Listing history: ended listings (sold or unsold) from the last 90+ days, via GetSellerList's EndTime window.
 * Feeds the Price Scanner's "your sales" statistics. Runs once a day; non-fatal.
 */
/// <reference types="@cloudflare/workers-types" />
import { getSellerListPage, type EbayConfig, type FetchFn } from './ebay';
import { mapCategory } from '../../src/categories';

const txt = (v: unknown): string => (v && typeof v === 'object' ? String((v as Record<string, unknown>)['#text'] ?? '') : String(v ?? '')).trim();

export interface EndedItem { itemId: string; title: string; startTime: string | null; endTime: string; sold: boolean; quantitySold: number; pricePence: number | null; currency: string; listingType: string; siteCategory: string }

/** An ended listing from GetSellerList, or null if it is still active or missing essentials. */
export function parseEnded(raw: Record<string, any>): EndedItem | null {
  const status = txt(raw.SellingStatus?.ListingStatus);
  if (status !== 'Completed' && status !== 'Ended') return null;
  const itemId = txt(raw.ItemID), title = txt(raw.Title), endTime = txt(raw.ListingDetails?.EndTime);
  if (!/^\d{6,20}$/.test(itemId) || !title || !endTime) return null;
  const quantitySold = Number(txt(raw.SellingStatus?.QuantitySold)) || 0;
  const priceNode = raw.SellingStatus?.CurrentPrice ?? raw.StartPrice;
  const price = Number(txt(priceNode));
  const type = txt(raw.ListingType);
  return {
    itemId, title,
    startTime: txt(raw.ListingDetails?.StartTime) || null,
    endTime,
    sold: quantitySold > 0,
    quantitySold,
    pricePence: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    currency: (priceNode && typeof priceNode === 'object' && priceNode['@_currencyID']) || txt(raw.Currency) || 'GBP',
    listingType: type === 'Chinese' ? 'auction' : 'fixed',
    siteCategory: mapCategory(txt(raw.PrimaryCategory?.CategoryID) || null, txt(raw.PrimaryCategory?.CategoryName) || null),
  };
}

export interface HistoryResult { status: 'synced' | 'skipped' | 'failed'; fetched?: number; reason?: string; message?: string }

const DAY = 86_400_000;
const KEEP_DAYS = 200;

export async function syncHistory(db: D1Database, cfg: EbayConfig, fetchFn: FetchFn, token: () => Promise<string>, now: Date, log: (e: string, d?: Record<string, unknown>) => void, opts: { force?: boolean } = {}): Promise<HistoryResult> {
  const st = Object.fromEntries((await db.prepare("SELECT key, value FROM sync_state WHERE key IN ('history_synced_to')").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
  const lastTo = st.history_synced_to ? Date.parse(st.history_synced_to) : NaN;
  if (!opts.force && Number.isFinite(lastTo) && now.getTime() - lastTo < 20 * 3_600_000) return { status: 'skipped', reason: 'synced within the last 20 hours' };
  // Overlap by a day so nothing slips between runs; first run goes back 90 days.
  const from = Number.isFinite(lastTo) ? new Date(lastTo - DAY) : new Date(now.getTime() - 90 * DAY);
  const to = now;
  try {
    let page = 1, pages = 1, fetched = 0;
    const set = (k: string, v: string) => db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v);
    do {
      const res = await getSellerListPage(cfg, fetchFn, await token(), page, from, to);
      pages = Math.max(res.totalPages, 1);
      const stmts: D1PreparedStatement[] = [];
      for (const raw of res.items) {
        const e = parseEnded(raw);
        if (!e) continue; // still active (handled by the catalogue sync) or unusable
        stmts.push(
          db.prepare('INSERT INTO ended_items (item_id, title, start_time, end_time, sold, quantity_sold, price_pence, currency, listing_type, site_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET title = excluded.title, end_time = excluded.end_time, sold = excluded.sold, quantity_sold = excluded.quantity_sold, price_pence = excluded.price_pence')
            .bind(e.itemId, e.title, e.startTime, e.endTime, e.sold ? 1 : 0, e.quantitySold, e.pricePence, e.currency, e.listingType, e.siteCategory),
        );
        fetched++;
      }
      if (stmts.length) await db.batch(stmts);
      page++;
    } while (page <= pages && page <= 60);
    await db.batch([
      set('history_synced_to', to.toISOString()),
      db.prepare('DELETE FROM ended_items WHERE end_time < ?').bind(new Date(now.getTime() - KEEP_DAYS * DAY).toISOString()),
    ]);
    log('history_synced', { fetched, pages: pages, from: from.toISOString() });
    return { status: 'synced', fetched };
  } catch (err) {
    log('history_sync_failed', { message: (err as Error).message });
    return { status: 'failed', message: (err as Error).message };
  }
}

export interface SoldStats {
  query: string;
  days: number;
  /** Your own listings that ended in the window and match the search. */
  yours: { ended: number; sold: number; sellThroughPct: number | null; avgSoldPence: number | null; highestSoldPence: number | null; lowestSoldPence: number | null; avgDaysToSell: number | null; medianDaysToSell: number | null; recent: { title: string; pricePence: number; soldAt: string; daysToSell: number | null; url: string }[] };
  /** How many you have listed right now that match. */
  activeNow: number;
}

export const keywords = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2).slice(0, 8);

export async function soldStats(db: D1Database, query: string, now: Date, days = 90): Promise<SoldStats> {
  const words = keywords(query);
  const where = words.map(() => "LOWER(title) LIKE ?").join(' AND ') || '1=1';
  const binds = words.map((w) => `%${w}%`);
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const { results } = await db
    .prepare(`SELECT item_id, title, start_time, end_time, sold, price_pence FROM ended_items WHERE end_time >= ? AND ${where} ORDER BY end_time DESC LIMIT 500`)
    .bind(since, ...binds)
    .all<{ item_id: string; title: string; start_time: string | null; end_time: string; sold: number; price_pence: number | null }>();
  const soldRows = results.filter((r) => r.sold && r.price_pence);
  const prices = soldRows.map((r) => r.price_pence as number).sort((a, b) => a - b);
  const daysList = soldRows.map((r) => (r.start_time ? (Date.parse(r.end_time) - Date.parse(r.start_time)) / DAY : null)).filter((d): d is number => d !== null && d >= 0).sort((a, b) => a - b);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const snap = await db.prepare("SELECT value FROM sync_state WHERE key = 'current_snapshot'").first<{ value: string }>();
  const active = snap
    ? await db.prepare(`SELECT COUNT(*) AS n FROM items WHERE snapshot_id = ? AND ${where}`).bind(snap.value, ...binds).first<{ n: number }>()
    : null;
  return {
    query,
    days,
    yours: {
      ended: results.length,
      sold: soldRows.length,
      sellThroughPct: results.length ? Math.round((soldRows.length / results.length) * 100) : null,
      avgSoldPence: avg(prices) === null ? null : Math.round(avg(prices)!),
      highestSoldPence: prices.length ? prices[prices.length - 1] : null,
      lowestSoldPence: prices.length ? prices[0] : null,
      avgDaysToSell: avg(daysList) === null ? null : Math.round(avg(daysList)! * 10) / 10,
      medianDaysToSell: daysList.length ? Math.round(daysList[Math.floor(daysList.length / 2)] * 10) / 10 : null,
      recent: soldRows.slice(0, 8).map((r) => ({ title: r.title, pricePence: r.price_pence as number, soldAt: r.end_time, daysToSell: r.start_time ? Math.round((Date.parse(r.end_time) - Date.parse(r.start_time)) / DAY) : null, url: `https://www.ebay.co.uk/itm/${r.item_id}` })),
    },
    activeNow: Number(active?.n || 0),
  };
}
