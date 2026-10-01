/// <reference types="@cloudflare/workers-types" />
import { DEMO_LISTINGS } from './demo-data';
import { dataMode, maxDataAgeHours, type Env } from './config';
import type { CatalogueMeta, CatalogueQuery, CategoryStat, Listing, SortKey } from './types';
import { SITE_CATEGORIES } from './categories';

export interface Catalogue {
  meta(): Promise<CatalogueMeta>;
  search(q: CatalogueQuery): Promise<{ items: Listing[]; total: number }>;
  item(id: string): Promise<Listing | null>;
  categoryStats(): Promise<CategoryStat[]>;
  featured(n: number): Promise<Listing[]>;
  sitemapItems(): Promise<Pick<Listing, 'itemId' | 'title' | 'startTime'>[]>;
}

export class CatalogueUnavailable extends Error {}

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
];

export function parseQuery(url: URL, pageSize = 24): CatalogueQuery {
  const sortParam = url.searchParams.get('sort') as SortKey;
  const page = Math.max(1, Math.min(500, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  return {
    q: (url.searchParams.get('q') || '').trim().slice(0, 80),
    category: (url.searchParams.get('category') || '').trim(),
    sort: SORTS.some((s) => s.key === sortParam) ? sortParam : 'newest',
    page,
    pageSize,
  };
}

export function searchTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}'&.-]/gu, ''))
    .filter(Boolean)
    .slice(0, 6);
}

export function getCatalogue(env: Env): Catalogue {
  if (dataMode(env) === 'demo') return new DemoCatalogue();
  if (!env.DB) throw new CatalogueUnavailable('D1 binding "DB" is not configured');
  return new D1Catalogue(env.DB, env);
}

/* ------------------------------------------------------------------ D1 (live) */

interface ItemRow {
  item_id: string; title: string; listing_type: 'fixed' | 'auction'; price_pence: number; currency: string;
  buy_it_now_pence: number | null; bid_count: number | null; best_offer: number; condition_name: string | null;
  ebay_category_id: string | null; ebay_category_path: string | null; site_category: string; image_urls: string;
  listing_url: string; quantity_available: number | null; start_time: string | null; end_time: string | null;
}

function rowToListing(r: ItemRow): Listing {
  let images: string[] = [];
  try {
    const parsed = JSON.parse(r.image_urls);
    if (Array.isArray(parsed)) images = parsed.filter((u) => typeof u === 'string');
  } catch {
    images = [];
  }
  return {
    itemId: r.item_id, title: r.title, listingType: r.listing_type, pricePence: r.price_pence, currency: r.currency,
    buyItNowPence: r.buy_it_now_pence, bidCount: r.bid_count, bestOffer: !!r.best_offer, condition: r.condition_name,
    ebayCategoryId: r.ebay_category_id, ebayCategoryPath: r.ebay_category_path, siteCategory: r.site_category,
    images, url: r.listing_url, quantityAvailable: r.quantity_available, startTime: r.start_time, endTime: r.end_time,
  };
}

const ORDER: Record<SortKey, string> = {
  newest: 'start_time DESC, item_id DESC',
  'price-asc': 'price_pence ASC, item_id ASC',
  'price-desc': 'price_pence DESC, item_id ASC',
};

export class D1Catalogue implements Catalogue {
  private metaPromise: Promise<CatalogueMeta> | null = null;
  constructor(private db: D1Database, private env: Env) {}

  meta(): Promise<CatalogueMeta> {
    this.metaPromise ??= (async () => {
      const { results } = await this.db
        .prepare(`SELECT key, value FROM sync_state WHERE key IN ('current_snapshot','last_success_at','item_count','source','seller_feedback_percent')`)
        .all<{ key: string; value: string }>();
      const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
      const source = s.source || '';
      const trusted = source === 'api.ebay.com' || this.env.ALLOW_TEST_SOURCE === '1';
      const snapshotId = trusted ? s.current_snapshot || null : null;
      const last = s.last_success_at || null;
      const ageMs = last ? Date.now() - Date.parse(last) : Infinity;
      return {
        mode: 'live',
        snapshotId,
        lastSuccessAt: snapshotId ? last : null,
        itemCount: snapshotId ? Number(s.item_count || 0) : 0,
        stale: !snapshotId || ageMs > maxDataAgeHours(this.env) * 3_600_000,
        sellerFeedbackPercent: s.seller_feedback_percent || null,
      };
    })();
    return this.metaPromise;
  }

  private async snap(): Promise<string | null> {
    return (await this.meta()).snapshotId;
  }

  async search(q: CatalogueQuery) {
    const snap = await this.snap();
    if (!snap) return { items: [], total: 0 };
    const where = ['snapshot_id = ?'];
    const args: unknown[] = [snap];
    if (q.category) {
      where.push('site_category = ?');
      args.push(q.category);
    }
    for (const t of searchTokens(q.q)) {
      where.push(`lower(title) LIKE ? ESCAPE '\\'`);
      args.push(`%${t.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    }
    const whereSql = where.join(' AND ');
    const offset = (q.page - 1) * q.pageSize;
    const [count, rows] = await this.db.batch([
      this.db.prepare(`SELECT COUNT(*) AS n FROM items WHERE ${whereSql}`).bind(...args),
      this.db.prepare(`SELECT * FROM items WHERE ${whereSql} ORDER BY ${ORDER[q.sort]} LIMIT ? OFFSET ?`).bind(...args, q.pageSize, offset),
    ]);
    const total = Number((count.results[0] as { n: number } | undefined)?.n || 0);
    return { items: (rows.results as unknown as ItemRow[]).map(rowToListing), total };
  }

  async item(id: string) {
    const snap = await this.snap();
    if (!snap) return null;
    const r = await this.db.prepare('SELECT * FROM items WHERE snapshot_id = ? AND item_id = ?').bind(snap, id).first<ItemRow>();
    return r ? rowToListing(r) : null;
  }

  async categoryStats(): Promise<CategoryStat[]> {
    const snap = await this.snap();
    if (!snap) return [];
    const { results } = await this.db
      .prepare(
        `SELECT site_category AS slug, COUNT(*) AS count,
                (SELECT i2.image_urls FROM items i2
                  WHERE i2.snapshot_id = items.snapshot_id AND i2.site_category = items.site_category AND i2.image_urls != '[]'
                  ORDER BY i2.start_time DESC LIMIT 1) AS cover
           FROM items WHERE snapshot_id = ? GROUP BY site_category`,
      )
      .bind(snap)
      .all<{ slug: string; count: number; cover: string | null }>();
    return results.map((r) => {
      let cover: string | null = null;
      try {
        cover = r.cover ? (JSON.parse(r.cover) as string[])[0] || null : null;
      } catch {
        cover = null;
      }
      return { slug: r.slug, count: Number(r.count), cover };
    });
  }

  async featured(n: number) {
    const snap = await this.snap();
    if (!snap) return [];
    const { results } = await this.db
      .prepare(`SELECT * FROM items WHERE snapshot_id = ? AND image_urls != '[]' ORDER BY start_time DESC LIMIT 40`)
      .bind(snap)
      .all<ItemRow>();
    return pickVaried(results.map(rowToListing), n);
  }

  async sitemapItems() {
    const snap = await this.snap();
    if (!snap) return [];
    const { results } = await this.db
      .prepare('SELECT item_id, title, start_time FROM items WHERE snapshot_id = ? ORDER BY start_time DESC LIMIT 45000')
      .bind(snap)
      .all<{ item_id: string; title: string; start_time: string | null }>();
    return results.map((r) => ({ itemId: r.item_id, title: r.title, startTime: r.start_time }));
  }
}

/** Newest first, but avoid four items from the same category where possible. */
export function pickVaried(items: Listing[], n: number): Listing[] {
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (out.length >= n) break;
    if (!seen.has(it.siteCategory)) {
      out.push(it);
      seen.add(it.siteCategory);
    }
  }
  for (const it of items) {
    if (out.length >= n) break;
    if (!out.includes(it)) out.push(it);
  }
  return out;
}

/* ------------------------------------------------------------------ Demo (illustrative only) */

export class DemoCatalogue implements Catalogue {
  async meta(): Promise<CatalogueMeta> {
    return { mode: 'demo', snapshotId: 'demo', lastSuccessAt: null, itemCount: DEMO_LISTINGS.length, stale: false, sellerFeedbackPercent: null };
  }
  async search(q: CatalogueQuery) {
    const tokens = searchTokens(q.q);
    let items = DEMO_LISTINGS.filter(
      (l) => (!q.category || l.siteCategory === q.category) && tokens.every((t) => l.title.toLowerCase().includes(t)),
    );
    items = [...items].sort((a, b) =>
      q.sort === 'price-asc' ? a.pricePence - b.pricePence
      : q.sort === 'price-desc' ? b.pricePence - a.pricePence
      : (b.startTime || '').localeCompare(a.startTime || ''),
    );
    const start = (q.page - 1) * q.pageSize;
    return { items: items.slice(start, start + q.pageSize), total: items.length };
  }
  async item(id: string) {
    return DEMO_LISTINGS.find((l) => l.itemId === id) || null;
  }
  async categoryStats() {
    return SITE_CATEGORIES.map((c) => {
      const inCat = DEMO_LISTINGS.filter((l) => l.siteCategory === c.slug);
      return { slug: c.slug, count: inCat.length, cover: c.cover };
    }).filter((s) => s.count > 0);
  }
  async featured(n: number) {
    return DEMO_LISTINGS.slice(0, n);
  }
  async sitemapItems() {
    return [];
  }
}
