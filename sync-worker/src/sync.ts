/// <reference types="@cloudflare/workers-types" />
/**
 * Snapshot sync: fetch the complete active inventory, validate it, write it under a new
 * snapshot ID, and only then switch the site over in one atomic update.
 * Any failure leaves the previous snapshot live and removes the partial one.
 */
import type { Listing } from '../../src/types';
import {
  EbayError, getAccessToken, getFeedbackPercent, getSellerListPage, normaliseItem, withRetry,
  type EbayConfig, type FetchFn, type SellerListPage, type Sleep, type SkipReason,
} from './ebay';
import { fetchRunningCoupons } from './coupons';

export interface SyncDeps {
  db: D1Database;
  cfg: EbayConfig;
  fetch: FetchFn;
  sleep: Sleep;
  now: () => Date;
  log: (event: string, data?: Record<string, unknown>) => void;
  newId: () => string;
}

export interface SyncOptions {
  trigger: 'cron' | 'manual';
  force: boolean;
  intervalMinutes: number;
  maxDropRatio: number;
}

export type SyncStatus = 'success' | 'skipped' | 'locked' | 'failed' | 'rejected';

export interface SyncResult {
  status: SyncStatus;
  runId: string;
  message: string;
  itemCount?: number;
  pages?: number;
  skipped?: Partial<Record<SkipReason, number>>;
}

export class ValidationError extends Error {}
class InventoryChanged extends Error {}

const LOCK_TTL_MS = 10 * 60_000;
const MAX_PAGES = 100;
const MIN_ITEMS_FOR_DROP_CHECK = 10;
const INSERT_CHUNK = 100;

/* ---------------------------------------------------------------- state helpers */
async function getState(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM sync_state').all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}
const setState = (db: D1Database, key: string, value: string) =>
  db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value);

export async function acquireLock(db: D1Database, owner: string, now: number): Promise<boolean> {
  await db.prepare('INSERT OR IGNORE INTO sync_lock (id, owner, expires_at) VALUES (1, NULL, 0)').run();
  const r = await db
    .prepare('UPDATE sync_lock SET owner = ?, expires_at = ? WHERE id = 1 AND expires_at < ?')
    .bind(owner, now + LOCK_TTL_MS, now)
    .run();
  return (r.meta?.changes ?? 0) === 1;
}

export async function releaseLock(db: D1Database, owner: string): Promise<void> {
  await db.prepare('UPDATE sync_lock SET owner = NULL, expires_at = 0 WHERE id = 1 AND owner = ?').bind(owner).run();
}

/* ---------------------------------------------------------------- fetching */
async function fetchAllPages(deps: SyncDeps, token: () => Promise<string>): Promise<{ raw: Record<string, any>[]; pages: number; totalEntries: number }> {
  const { cfg } = deps;
  const now = deps.now();
  const endFrom = new Date(now.getTime() + 1000);
  const endTo = new Date(now.getTime() + Math.min(cfg.endWindowDays, 119) * 86_400_000);

  const page = (n: number) =>
    withRetry(async () => getSellerListPage(cfg, deps.fetch, await token(), n, endFrom, endTo), deps.sleep);

  const first: SellerListPage = await page(1);
  if (first.totalPages > MAX_PAGES) throw new ValidationError(`Inventory spans ${first.totalPages} pages, above the safety limit of ${MAX_PAGES}`);
  // eBay's reported total can differ slightly from what it actually returns (e.g. a listing being edited),
  // so small differences are tolerated; anything bigger means pages went missing.
  const tolerance = Math.max(5, Math.ceil(first.totalEntries * 0.01));
  const raw = [...first.items];
  let lastTotal = first.totalEntries;
  for (let n = 2; n <= first.totalPages; n++) {
    const p = await page(n);
    if (Math.abs(p.totalEntries - first.totalEntries) > tolerance) {
      throw new InventoryChanged(`Listings changed during the sync (${first.totalEntries} → ${p.totalEntries})`);
    }
    lastTotal = p.totalEntries;
    raw.push(...p.items);
  }
  const expected = Math.max(first.totalEntries, lastTotal);
  if (raw.length < expected - tolerance) {
    throw new ValidationError(`Received ${raw.length} listings but eBay reported ${expected}`);
  }
  if (raw.length !== expected) deps.log('count_mismatch_tolerated', { received: raw.length, reported: expected });
  return { raw, pages: Math.max(first.totalPages, 1), totalEntries: first.totalEntries };
}

/* ---------------------------------------------------------------- writing */
export async function writeSnapshot(db: D1Database, snapshotId: string, listings: Listing[]): Promise<void> {
  const insert = `INSERT INTO items (snapshot_id, item_id, title, listing_type, price_pence, currency, buy_it_now_pence, bid_count,
      best_offer, condition_name, ebay_category_id, ebay_category_path, site_category, image_urls, listing_url,
      quantity_available, start_time, end_time)
    SELECT ?1, json_extract(value, '$.itemId'), json_extract(value, '$.title'), json_extract(value, '$.listingType'),
      json_extract(value, '$.pricePence'), json_extract(value, '$.currency'), json_extract(value, '$.buyItNowPence'),
      json_extract(value, '$.bidCount'), json_extract(value, '$.bestOffer'), json_extract(value, '$.condition'),
      json_extract(value, '$.ebayCategoryId'), json_extract(value, '$.ebayCategoryPath'), json_extract(value, '$.siteCategory'),
      json(json_extract(value, '$.images')), json_extract(value, '$.url'), json_extract(value, '$.quantityAvailable'),
      json_extract(value, '$.startTime'), json_extract(value, '$.endTime')
    FROM json_each(?2)`;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < listings.length; i += INSERT_CHUNK) {
    const chunk = listings.slice(i, i + INSERT_CHUNK).map((l) => ({ ...l, bestOffer: l.bestOffer ? 1 : 0 }));
    stmts.push(db.prepare(insert).bind(snapshotId, JSON.stringify(chunk)));
  }
  if (stmts.length) await db.batch(stmts); // one transaction
  const row = await db.prepare('SELECT COUNT(*) AS n FROM items WHERE snapshot_id = ?').bind(snapshotId).first<{ n: number }>();
  if (Number(row?.n) !== listings.length) {
    throw new ValidationError(`Wrote ${row?.n} rows but expected ${listings.length}`);
  }
}

/* ---------------------------------------------------------------- main */
export async function runSync(deps: SyncDeps, opts: SyncOptions): Promise<SyncResult> {
  const { db, log } = deps;
  const runId = deps.newId();
  const startedAt = deps.now();
  const state = await getState(db);

  if (opts.trigger === 'cron' && state.last_success_at) {
    const age = startedAt.getTime() - Date.parse(state.last_success_at);
    // Small allowance so a 30-minute interval isn't missed because a cron tick fired a few seconds early.
    if (age < opts.intervalMinutes * 60_000 - 90_000) {
      return { status: 'skipped', runId, message: 'Not due yet' };
    }
  }

  if (!(await acquireLock(db, runId, startedAt.getTime()))) {
    log('sync_locked', { runId });
    return { status: 'locked', runId, message: 'Another sync is already running' };
  }

  await db
    .prepare("INSERT INTO sync_runs (id, trigger, started_at, status) VALUES (?, ?, ?, 'running')")
    .bind(runId, opts.trigger, startedAt.toISOString())
    .run();
  log('sync_started', { runId, trigger: opts.trigger, force: opts.force });

  let wroteSnapshot = false;
  let result: SyncResult;
  try {
    // One access token per run; refreshed once if eBay says it is no longer valid.
    let cached: string | null = null;
    let refreshed = false;
    const token = async () => (cached ??= await withRetry(() => getAccessToken(deps.cfg, deps.fetch), deps.sleep));
    const withAuthRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof EbayError && err.kind === 'auth' && err.code !== 'invalid_grant' && err.code !== 'invalid_client' && !refreshed) {
          refreshed = true;
          cached = null;
          log('token_refresh_retry', { runId });
          return fn();
        }
        throw err;
      }
    };

    let fetched: Awaited<ReturnType<typeof fetchAllPages>>;
    try {
      fetched = await withAuthRetry(() => fetchAllPages(deps, token));
    } catch (err) {
      if (!(err instanceof InventoryChanged)) throw err;
      log('inventory_changed_retry', { runId, message: err.message });
      fetched = await withAuthRetry(() => fetchAllPages(deps, token)); // one clean retry
    }

    // Normalise, de-duplicate and drop anything not currently buyable.
    const byId = new Map<string, Listing>();
    const skipped: Partial<Record<SkipReason, number>> = {};
    for (const raw of fetched.raw) {
      const n = normaliseItem(raw);
      if ('skip' in n) skipped[n.skip] = (skipped[n.skip] || 0) + 1;
      else byId.set(n.listing.itemId, n.listing);
    }
    const listings = [...byId.values()];

    const prevCount = Number(state.item_count || 0);
    if (!opts.force) {
      if (listings.length === 0) throw new ValidationError('eBay returned no active listings; refusing to empty the catalogue (use force to override)');
      if (prevCount >= MIN_ITEMS_FOR_DROP_CHECK && listings.length < prevCount * (1 - opts.maxDropRatio)) {
        throw new ValidationError(`Active listings fell from ${prevCount} to ${listings.length}; refusing to publish (use force to override)`);
      }
    }

    const snapshotId = runId;
    wroteSnapshot = true;
    await writeSnapshot(db, snapshotId, listings);

    // Atomic switch: the site reads current_snapshot, so this is the moment the new data goes live.
    const finishedAt = deps.now().toISOString();
    await db.batch([
      setState(db, 'previous_snapshot', state.current_snapshot || ''),
      setState(db, 'current_snapshot', snapshotId),
      setState(db, 'last_success_at', finishedAt),
      setState(db, 'item_count', String(listings.length)),
      setState(db, 'source', new URL(deps.cfg.tradingUrl).host),
    ]);
    wroteSnapshot = false; // published: must not be cleaned up

    // Keep the current and previous snapshots; remove anything older.
    await db
      .prepare('DELETE FROM items WHERE snapshot_id NOT IN (?, ?)')
      .bind(snapshotId, state.current_snapshot || snapshotId)
      .run();

    try {
      const pct = await getFeedbackPercent(deps.cfg, deps.fetch, await token());
      if (pct) await setState(db, 'seller_feedback_percent', pct).run();
    } catch (err) {
      log('feedback_lookup_failed', { runId, message: (err as Error).message });
    }

    // Running coded coupons, so the site can advertise them. Non-fatal; the site ignores expired entries.
    try {
      const coupons = await fetchRunningCoupons(deps.cfg, deps.fetch, await token(), deps.sleep);
      await db.batch([setState(db, 'coupons', JSON.stringify(coupons)), setState(db, 'coupons_checked_at', deps.now().toISOString())]);
      log('coupons_synced', { runId, count: coupons.length, codes: coupons.map((c) => c.code) });
    } catch (err) {
      log('coupon_lookup_failed', { runId, message: (err as Error).message, kind: err instanceof EbayError ? err.kind : 'unexpected' });
    }

    result = { status: 'success', runId, message: `Published ${listings.length} listings`, itemCount: listings.length, pages: fetched.pages, skipped };
  } catch (err) {
    const e = err as Error;
    const status: SyncStatus = err instanceof ValidationError ? 'rejected' : 'failed';
    result = { status, runId, message: e.message };
    log(status === 'rejected' ? 'sync_rejected' : 'sync_failed', {
      runId, message: e.message, kind: err instanceof EbayError ? err.kind : err instanceof ValidationError ? 'validation' : 'unexpected',
      code: err instanceof EbayError ? err.code : undefined,
    });
  } finally {
    if (wroteSnapshot) {
      await db.prepare('DELETE FROM items WHERE snapshot_id = ?').bind(runId).run().catch(() => undefined);
    }
    await releaseLock(db, runId).catch(() => undefined);
  }

  await db
    .prepare('UPDATE sync_runs SET finished_at = ?, status = ?, item_count = ?, pages = ?, message = ? WHERE id = ?')
    .bind(deps.now().toISOString(), result.status, result.itemCount ?? null, result.pages ?? null, result.message.slice(0, 500), runId)
    .run();
  await db.prepare('DELETE FROM sync_runs WHERE id NOT IN (SELECT id FROM sync_runs ORDER BY started_at DESC LIMIT 200)').run();
  if (result.status === 'success') log('sync_succeeded', { runId, itemCount: result.itemCount, pages: result.pages, skipped: result.skipped });
  return result;
}
