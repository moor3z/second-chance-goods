/**
 * Daily "new in" post to the Second Chance Goods Facebook Page, via Meta's Graph API.
 * Runs from the scheduled Worker after the eBay sync. At most one post per UK day, only when there are new listings.
 */
/// <reference types="@cloudflare/workers-types" />
import type { FetchFn } from './ebay';

export interface FacebookConfig {
  pageId: string;
  pageToken: string;
  graphVersion: string;
  /** UK hour (0-23) from which the day's post may go out. */
  postHour: number;
  maxItems: number;
  siteUrl: string;
  storeUrl: string;
  intro: string;
  outro: string;
  /** Automatic single posts: items at or above this price (pence) get their own post. 0 = off. */
  autoMinPricePence: number;
  autoMaxPerDay: number;
}

interface Row { item_id: string; title: string; listing_type: string; price_pence: number; currency: string; image_urls: string; start_time: string | null }

const ukDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const ukHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' });
const money = (p: number, c: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: c }).format(p / 100);

export class FacebookError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

async function graph(cfg: FacebookConfig, fetchFn: FetchFn, path: string, params: Record<string, string>): Promise<Record<string, any>> {
  const body = new URLSearchParams({ ...params, access_token: cfg.pageToken });
  const res = await fetchFn(`https://graph.facebook.com/${cfg.graphVersion}/${path}`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || json.error) {
    const e = json.error || {};
    // 190 = token invalid/expired; 10/200-299 = permission problems.
    throw new FacebookError(`Facebook ${path.split('/').pop()} failed: ${e.message || `HTTP ${res.status}`}`, Number(e.code) || res.status);
  }
  return json;
}

export function buildMessage(cfg: FacebookConfig, rows: Row[]): string {
  const link = cfg.siteUrl ? `${cfg.siteUrl.replace(/\/+$/, '')}/shop` : cfg.storeUrl;
  const lines = rows.map((r) => `• ${r.title} – ${r.listing_type === 'auction' ? `auction from ${money(r.price_pence, r.currency)}` : money(r.price_pence, r.currency)}`);
  return [cfg.intro.replace('{count}', String(rows.length)), '', ...lines, '', cfg.outro.replace('{link}', link)].join('\n');
}

const firstImage = (json: string): string | null => {
  try {
    const u = (JSON.parse(json) as string[])[0];
    return typeof u === 'string' && u.startsWith('https://') ? u.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)$/i, '/s-l1600.$1') : null;
  } catch {
    return null;
  }
};

const POSTED_KEY = 'fb_posted_items';

/** Map of eBay item ID → ISO time it was posted individually (kept to the last 3000). */
export async function postedItems(db: D1Database): Promise<Record<string, string>> {
  const row = await db.prepare('SELECT value FROM sync_state WHERE key = ?').bind(POSTED_KEY).first<{ value: string }>();
  try {
    const v = row ? JSON.parse(row.value) : {};
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function markPosted(db: D1Database, itemId: string, when: Date): Promise<void> {
  const map = await postedItems(db);
  map[itemId] = when.toISOString();
  const trimmed = Object.fromEntries(Object.entries(map).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 3000));
  await db.prepare("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(POSTED_KEY, JSON.stringify(trimmed)).run();
}

export type ItemPostResult = { status: 'posted'; postId: string; permalink: string } | { status: 'failed'; message: string } | { status: 'not_found' } | { status: 'already_posted'; at: string };

/** Post one listing to the Page: the given message (or a default) plus up to four of its photos. */
export async function postSingleItem(db: D1Database, cfg: FacebookConfig, fetchFn: FetchFn, itemId: string, message: string | null, now: Date, log: (e: string, d?: Record<string, unknown>) => void, opts: { force?: boolean } = {}): Promise<ItemPostResult> {
  const st = await db.prepare("SELECT value FROM sync_state WHERE key = 'current_snapshot'").first<{ value: string }>();
  if (!st) return { status: 'not_found' };
  const row = await db
    .prepare('SELECT item_id, title, listing_type, price_pence, currency, image_urls, start_time, condition_name, listing_url FROM items WHERE snapshot_id = ? AND item_id = ?')
    .bind(st.value, itemId)
    .first<Row & { condition_name: string | null; listing_url: string }>();
  if (!row) return { status: 'not_found' };
  const posted = await postedItems(db);
  if (posted[itemId] && !opts.force) return { status: 'already_posted', at: posted[itemId] };

  const text = (message || '').trim() || buildMessage(cfg, [row]);
  let images: string[] = [];
  try {
    images = (JSON.parse(row.image_urls) as string[]).filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, 4).map((u) => u.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)$/i, '/s-l1600.$1'));
  } catch {
    images = [];
  }
  try {
    const mediaIds: string[] = [];
    for (const url of images) {
      try {
        const r = await graph(cfg, fetchFn, `${cfg.pageId}/photos`, { url, published: 'false' });
        if (r.id) mediaIds.push(String(r.id));
      } catch (err) {
        if (err instanceof FacebookError && err.code === 190) throw err;
        log('facebook_photo_skipped', { url, message: (err as Error).message });
      }
    }
    const params: Record<string, string> = { message: text };
    mediaIds.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const post = await graph(cfg, fetchFn, `${cfg.pageId}/feed`, params);
    const postId = String(post.id);
    await markPosted(db, itemId, now);
    log('facebook_item_posted', { itemId, postId, photos: mediaIds.length });
    return { status: 'posted', postId, permalink: `https://www.facebook.com/${postId}` };
  } catch (err) {
    const msg = (err as Error).message;
    log('facebook_item_post_failed', { itemId, message: msg });
    return { status: 'failed', message: msg };
  }
}

export type AutoPostResult = { status: 'posted'; itemId: string; postId: string } | { status: 'skipped'; reason: string } | { status: 'failed'; message: string };

/**
 * Automatic single posts for higher-value new listings: at most one per run (so posts are spaced by the sync
 * interval), capped per UK day, only between 08:00 and 21:00 UK, and never for items already posted.
 */
export async function autoPostNewItems(db: D1Database, cfg: FacebookConfig, fetchFn: FetchFn, now: Date, log: (e: string, d?: Record<string, unknown>) => void): Promise<AutoPostResult> {
  if (!cfg.autoMinPricePence || cfg.autoMaxPerDay < 1) return { status: 'skipped', reason: 'auto posts are off' };
  const hour = Number(ukHour.format(now));
  if (hour < 8 || hour >= 21) return { status: 'skipped', reason: 'outside posting hours' };
  const today = ukDay.format(now);
  const st = Object.fromEntries(
    (await db.prepare("SELECT key, value FROM sync_state WHERE key IN ('current_snapshot','fb_auto_day','fb_auto_count')").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]),
  );
  if (!st.current_snapshot) return { status: 'skipped', reason: 'no catalogue yet' };
  const count = st.fb_auto_day === today ? Number(st.fb_auto_count || 0) : 0;
  if (count >= cfg.autoMaxPerDay) return { status: 'skipped', reason: 'daily limit reached' };

  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const { results } = await db
    .prepare("SELECT item_id FROM items WHERE snapshot_id = ? AND listing_type = 'fixed' AND price_pence >= ? AND start_time > ? AND image_urls != '[]' ORDER BY start_time DESC LIMIT 50")
    .bind(st.current_snapshot, cfg.autoMinPricePence, since)
    .all<{ item_id: string }>();
  const already = await postedItems(db);
  const next = results.find((r) => !already[r.item_id]);
  if (!next) return { status: 'skipped', reason: 'nothing new above the threshold' };

  const r = await postSingleItem(db, cfg, fetchFn, next.item_id, null, now, log);
  if (r.status !== 'posted') return r.status === 'failed' ? { status: 'failed', message: r.message } : { status: 'skipped', reason: r.status };
  const set = (k: string, v: string) => db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v);
  await db.batch([set('fb_auto_day', today), set('fb_auto_count', String(count + 1))]);
  log('facebook_auto_posted', { itemId: next.item_id, postId: r.postId, todayCount: count + 1 });
  return { status: 'posted', itemId: next.item_id, postId: r.postId };
}

export type FacebookResult = { status: 'posted'; postId: string; count: number } | { status: 'skipped'; reason: string } | { status: 'failed'; message: string } | { status: 'preview'; message: string; images: string[] };

/**
 * @param force post now regardless of hour/day (manual trigger)
 * @param preview build the post but don't send it
 */
export async function maybePostDailyDigest(db: D1Database, cfg: FacebookConfig, fetchFn: FetchFn, now: Date, log: (e: string, d?: Record<string, unknown>) => void, opts: { force?: boolean; preview?: boolean } = {}): Promise<FacebookResult> {
  const today = ukDay.format(now);
  const st = Object.fromEntries(
    (await db.prepare("SELECT key, value FROM sync_state WHERE key IN ('current_snapshot','fb_last_post_day','fb_last_post_at','fb_attempt_day','fb_attempts')").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]),
  );
  if (!opts.force && !opts.preview) {
    if (Number(ukHour.format(now)) < cfg.postHour) return { status: 'skipped', reason: 'before posting hour' };
    if (st.fb_last_post_day === today) return { status: 'skipped', reason: 'already posted today' };
    if (st.fb_attempt_day === today && Number(st.fb_attempts || 0) >= 3) return { status: 'skipped', reason: 'gave up for today after 3 failed attempts' };
  }
  if (!st.current_snapshot) return { status: 'skipped', reason: 'no catalogue yet' };

  // New since the last post (or the last 24 hours the first time).
  const since = st.fb_last_post_at || new Date(now.getTime() - 86_400_000).toISOString();
  let { results: rows } = await db
    .prepare("SELECT item_id, title, listing_type, price_pence, currency, image_urls, start_time FROM items WHERE snapshot_id = ? AND start_time > ? AND image_urls != '[]' ORDER BY start_time DESC LIMIT ?")
    .bind(st.current_snapshot, since, cfg.maxItems)
    .all<Row>();
  const already = await postedItems(db);
  const fresh = rows.filter((r) => !already[r.item_id]);
  if (!fresh.length) return { status: 'skipped', reason: rows.length ? 'all new listings were already posted individually' : 'no new listings since the last post' };
  rows = fresh;

  const message = buildMessage(cfg, rows);
  const images = rows.map((r) => firstImage(r.image_urls)).filter((u): u is string => !!u).slice(0, 10);
  if (opts.preview) return { status: 'preview', message, images };

  // Claim today's slot first so overlapping runs can't double-post; count attempts.
  const attempts = st.fb_attempt_day === today ? Number(st.fb_attempts || 0) + 1 : 1;
  const set = (k: string, v: string) => db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v);
  await db.batch([set('fb_attempt_day', today), set('fb_attempts', String(attempts))]);

  try {
    // Upload each photo unpublished, then publish one post with them attached.
    const mediaIds: string[] = [];
    for (const url of images) {
      try {
        const r = await graph(cfg, fetchFn, `${cfg.pageId}/photos`, { url, published: 'false' });
        if (r.id) mediaIds.push(String(r.id));
      } catch (err) {
        if (err instanceof FacebookError && err.code === 190) throw err; // bad token: stop now
        log('facebook_photo_skipped', { url, message: (err as Error).message });
      }
    }
    const params: Record<string, string> = { message };
    mediaIds.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const post = await graph(cfg, fetchFn, `${cfg.pageId}/feed`, params);
    await db.batch([set('fb_last_post_day', today), set('fb_last_post_at', rows[0].start_time || now.toISOString())]);
    log('facebook_posted', { postId: post.id, items: rows.length, photos: mediaIds.length });
    return { status: 'posted', postId: String(post.id), count: rows.length };
  } catch (err) {
    const msg = (err as Error).message;
    log('facebook_post_failed', { message: msg, attempt: attempts, tokenProblem: err instanceof FacebookError && err.code === 190 });
    return { status: 'failed', message: msg };
  }
}
