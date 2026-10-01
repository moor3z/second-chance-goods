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
  const { results: rows } = await db
    .prepare("SELECT item_id, title, listing_type, price_pence, currency, image_urls, start_time FROM items WHERE snapshot_id = ? AND start_time > ? AND image_urls != '[]' ORDER BY start_time DESC LIMIT ?")
    .bind(st.current_snapshot, since, cfg.maxItems)
    .all<Row>();
  if (!rows.length) return { status: 'skipped', reason: 'no new listings since the last post' };

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
