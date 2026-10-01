import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeD1 } from './d1-shim';
import { mockEbay, type MockItem, type MockOptions } from './mock-ebay';
import { runSync, acquireLock, type SyncDeps } from '../sync-worker/src/sync';
import { normaliseItem } from '../sync-worker/src/ebay';
import { makeLogger } from '../sync-worker/src/index';
import { D1Catalogue } from '../src/catalogue';
import { activeCoupons } from '../src/config';
import { mapCategory } from '../src/categories';
import { XMLParser } from 'fast-xml-parser';
import { itemXml } from './mock-ebay';

const items = (n: number, prefix = '11743'): MockItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(1000000 + i)}`,
    title: `Test item ${i + 1}`,
    price: (5 + i).toFixed(2),
    start: new Date(Date.UTC(2026, 8, 1) + i * 3600_000).toISOString(),
  }));

const CFG = {
  clientId: 'client-id-abcdefgh', clientSecret: 'client-secret-SUPERSECRET', refreshToken: 'v^1.1#i^1#REFRESH-SECRET-1234567890',
  oauthUrl: 'https://api.ebay.com/identity/v1/oauth2/token', tradingUrl: 'https://api.ebay.com/ws/api.dll',
  siteId: '3', compatLevel: '1451', pageSize: 2, endWindowDays: 60, useOutputSelector: true, scopes: 'https://api.ebay.com/oauth/api_scope',
};

function setup(mock: MockOptions, db = new FakeD1()) {
  const m = mockEbay(mock);
  const logs: string[] = [];
  let n = 0;
  const deps: SyncDeps = {
    db: db as unknown as D1Database, cfg: { ...CFG, pageSize: mock.pageSize || 2 }, fetch: m.fetch as never,
    sleep: async () => {}, now: () => new Date('2026-09-30T12:00:00Z'),
    log: (e, d) => logs.push(JSON.stringify({ event: e, ...d })), newId: () => `run-${++n}-${Math.random().toString(36).slice(2, 8)}`,
  };
  return { db, deps, calls: m.calls, logs };
}
const opts = (o: Partial<Parameters<typeof runSync>[1]> = {}) => ({ trigger: 'manual' as const, force: false, intervalMinutes: 30, maxDropRatio: 0.5, ...o });
const state = async (db: FakeD1) => Object.fromEntries(((await db.prepare('SELECT key, value FROM sync_state').all<{ key: string; value: string }>()).results).map((r) => [r.key, r.value]));
const count = async (db: FakeD1, snap?: string) =>
  Number((await db.prepare(snap ? 'SELECT COUNT(*) n FROM items WHERE snapshot_id = ?' : 'SELECT COUNT(*) n FROM items').bind(...(snap ? [snap] : [])).first<{ n: number }>())!.n);

test('full sync across several pages publishes a complete snapshot', async () => {
  const { db, deps, calls } = setup({ items: items(7) });
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'success', r.message);
  assert.equal(r.itemCount, 7);
  assert.equal(r.pages, 4);
  const s = await state(db);
  assert.equal(s.item_count, '7');
  assert.equal(s.source, 'api.ebay.com');
  assert.equal(s.seller_feedback_percent, '99.8');
  assert.equal(await count(db, s.current_snapshot), 7);
  const pagesRequested = calls.filter((c) => c.callName === 'GetSellerList').map((c) => c.page);
  assert.deepEqual(pagesRequested, [1, 2, 3, 4]);
  const body = calls.find((c) => c.callName === 'GetSellerList')!.body!;
  assert.match(body, /<EndTimeFrom>2026-09-30T12:00:01.000Z<\/EndTimeFrom>/);
  assert.match(body, /<EndTimeTo>2026-11-29T12:00:00.000Z<\/EndTimeTo>/);
  assert.equal((await db.prepare("SELECT status FROM sync_runs").first<{ status: string }>())!.status, 'success');
});

test('new, changed and ended listings are reflected on the next sync; old snapshots are pruned', async () => {
  const db = new FakeD1();
  const first = items(12);
  await runSync(setup({ items: first }, db).deps, opts());
  const s1 = await state(db);
  const second = first.slice(0, 10).map((i, idx) => (idx === 0 ? { ...i, price: '99.00', title: 'Renamed item' } : i));
  second.push({ id: '117439999999', title: 'Brand new listing', price: '12.50' });
  second.push({ id: '117439999998', title: 'Sold out', price: '1.00', qty: 1, sold: 1 });
  second.push({ id: '117439999997', title: 'Ended one', price: '1.00', status: 'Completed' });
  const r = await runSync(setup({ items: second }, db).deps, opts());
  assert.equal(r.status, 'success', r.message);
  assert.equal(r.itemCount, 11);
  assert.deepEqual(r.skipped, { sold_out: 1, not_active: 1 });
  const cat = new D1Catalogue(db as never, { DATA_MODE: 'live' });
  assert.equal((await cat.item(first[11].id)), null, 'ended item removed');
  assert.equal((await cat.item(first[0].id))!.pricePence, 9900);
  assert.equal((await cat.item('117439999999'))!.title, 'Brand new listing');
  // A third sync prunes the first snapshot but keeps the previous one for rollback.
  await runSync(setup({ items: second }, db).deps, opts());
  assert.equal(await count(db, s1.current_snapshot), 0);
  assert.equal(await count(db), 22);
});

test('a page that keeps failing leaves the previous catalogue untouched and removes partial data', async () => {
  const db = new FakeD1();
  await runSync(setup({ items: items(6) }, db).deps, opts());
  const before = await state(db);
  const { deps, logs } = setup({ items: items(6), failPages: [2] }, db);
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'failed');
  assert.match(r.message, /HTTP 502/);
  const after = await state(db);
  assert.equal(after.current_snapshot, before.current_snapshot);
  assert.equal(after.last_success_at, before.last_success_at);
  assert.equal(await count(db), 6, 'no partial snapshot rows left behind');
  assert.ok(logs.some((l) => l.includes('sync_failed')));
});

test('transient errors are retried a bounded number of times', async () => {
  const { deps, calls } = setup({ items: items(4), flakyPage: { page: 2, times: 2 } });
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'success', r.message);
  assert.equal(calls.filter((c) => c.page === 2).length, 3);
  const { deps: d2, calls: c2 } = setup({ items: items(4), flakyPage: { page: 2, times: 5 } });
  const r2 = await runSync(d2, opts());
  assert.equal(r2.status, 'failed');
  assert.equal(c2.filter((c) => c.page === 2).length, 3, 'gives up after 3 attempts');
});

test('rate limiting is not retried and does not change the catalogue', async () => {
  const { deps, calls, db } = setup({ items: items(4), rateLimit: true });
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'failed');
  assert.match(r.message, /rate limited/);
  assert.equal(calls.filter((c) => c.callName === 'GetSellerList').length, 1);
  assert.equal((await state(db)).current_snapshot, undefined);
});

test('an incomplete result (total mismatch) is rejected', async () => {
  const { deps, db } = setup({ items: items(5), lieAboutTotal: 5, pageSize: 2 });
  // Deliver 5 items but claim 9 in total: pages 1-3 have items, 4-5 are empty.
  const { deps: d2 } = setup({ items: items(5), lieAboutTotal: 9 }, db);
  const r = await runSync(d2, opts());
  assert.equal(r.status, 'rejected');
  assert.match(r.message, /Received 5 listings but eBay reported 9/);
  assert.equal(await count(db), 0);
  void deps;
});

test('listings changing mid-sync trigger one clean retry', async () => {
  const { deps, calls } = setup({ items: items(6), shiftTotalOnPage: 2 });
  const r = await runSync(deps, opts());
  // The mock shifts the total on every request for page 2, so both attempts fail and nothing is published.
  assert.equal(r.status, 'failed');
  assert.match(r.message, /changed during the sync/);
  assert.equal(calls.filter((c) => c.page === 1).length, 2);
});

test('a big drop in active listings is refused unless forced', async () => {
  const db = new FakeD1();
  await runSync(setup({ items: items(20) }, db).deps, opts());
  const r = await runSync(setup({ items: items(5) }, db).deps, opts());
  assert.equal(r.status, 'rejected');
  assert.match(r.message, /fell from 20 to 5/);
  assert.equal((await state(db)).item_count, '20');
  const forced = await runSync(setup({ items: items(5) }, db).deps, opts({ force: true }));
  assert.equal(forced.status, 'success');
  assert.equal((await state(db)).item_count, '5');
});

test('zero listings never empties the catalogue without force', async () => {
  const db = new FakeD1();
  await runSync(setup({ items: items(3) }, db).deps, opts());
  const r = await runSync(setup({ items: [] }, db).deps, opts());
  assert.equal(r.status, 'rejected');
  assert.equal((await state(db)).item_count, '3');
});

test('expired access token is refreshed once and the sync continues', async () => {
  const { deps, calls } = setup({ items: items(3), expireFirstToken: true });
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'success', r.message);
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 2);
  const tokens = new Set(calls.filter((c) => c.token).map((c) => c.token));
  assert.equal(tokens.size, 2);
});

test('a rejected refresh token fails cleanly with a clear message', async () => {
  const { deps, db } = setup({ items: items(3), tokenError: 'invalid_grant' });
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'failed');
  assert.match(r.message, /Re-run the eBay authorisation/);
  assert.equal(await count(db), 0);
});

test('overlapping syncs are prevented by the lock', async () => {
  const db = new FakeD1();
  assert.equal(await acquireLock(db as never, 'other-run', Date.parse('2026-09-30T11:59:00Z')), true);
  const r = await runSync(setup({ items: items(3) }, db).deps, opts());
  assert.equal(r.status, 'locked');
  // An expired lock (crashed run) is taken over.
  const r2 = await runSync({ ...setup({ items: items(3) }, db).deps, now: () => new Date('2026-09-30T12:30:00Z') }, opts());
  assert.equal(r2.status, 'success', r2.message);
});

test('cron runs are skipped until the interval has passed', async () => {
  const db = new FakeD1();
  await runSync(setup({ items: items(3) }, db).deps, opts());
  const soon = setup({ items: items(3) }, db);
  assert.equal((await runSync({ ...soon.deps, now: () => new Date('2026-09-30T12:15:00Z') }, opts({ trigger: 'cron' }))).status, 'skipped');
  assert.equal((await runSync({ ...soon.deps, now: () => new Date('2026-09-30T12:30:00Z') }, opts({ trigger: 'cron' }))).status, 'success');
});

test('a database failure during writing keeps the old snapshot', async () => {
  const db = new FakeD1();
  await runSync(setup({ items: items(4) }, db).deps, opts());
  const before = await state(db);
  db.failOn = (sql) => sql.includes('INSERT INTO sync_state');
  const r = await runSync(setup({ items: items(5) }, db).deps, opts());
  db.failOn = null;
  assert.equal(r.status, 'failed');
  assert.equal((await state(db)).current_snapshot, before.current_snapshot);
  assert.equal(await count(db), 4, 'unpublished rows removed');
});

test('auctions, Best Offer, conditions, pictures and categories are parsed accurately', () => {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, isArray: (_n, p) => p === 'Item.PictureDetails.PictureURL' });
  const parse = (xml: string) => parser.parse(xml).Item;
  const a = normaliseItem(parse(itemXml({ id: '117439573079', title: 'Carlisle Ware Imari plate', price: '9.99', type: 'Chinese', bids: 3, bin: '29.99',
    category: 'Pottery, Ceramics & Glass:Decorative Cookware & Tableware:Plates', condition: 'Pre-owned', pictures: ['https://i.ebayimg.com/a/s-l1600.jpg', 'http://insecure/b.jpg'] })));
  assert.ok('listing' in a);
  assert.equal(a.listing.listingType, 'auction');
  assert.equal(a.listing.pricePence, 999);
  assert.equal(a.listing.bidCount, 3);
  assert.equal(a.listing.buyItNowPence, 2999);
  assert.equal(a.listing.siteCategory, 'vintage-antiques');
  assert.deepEqual(a.listing.images, ['https://i.ebayimg.com/a/s-l1600.jpg']);
  assert.equal(a.listing.itemId, '117439573079', 'IDs stay exact strings');
  const f = normaliseItem(parse(itemXml({ id: '117435800076', title: 'Sony boombox', price: '34.99', bestOffer: true, qty: 3, sold: 1, category: 'Sound & Vision:Portable Audio & Headphones' })));
  assert.ok('listing' in f);
  assert.equal(f.listing.bestOffer, true);
  assert.equal(f.listing.quantityAvailable, 2);
  assert.equal(f.listing.siteCategory, 'retro-tech');
  const ad = normaliseItem(parse(itemXml({ id: '117435800077', title: 'Classified', price: '1', type: 'AdType' })));
  assert.deepEqual(ad, { skip: 'unsupported_type', itemId: '117435800077' });
});

test('category mapping covers the shop\'s eBay categories', () => {
  assert.equal(mapCategory(null, 'Home, Furniture & DIY:DIY Tools & Workshop Equipment:Power Tools'), 'tools-diy');
  assert.equal(mapCategory(null, 'Home, Furniture & DIY:Appliances:Vacuum Cleaners'), 'home-furniture');
  assert.equal(mapCategory(null, 'Music:Vinyl Records'), 'music-vinyl');
  assert.equal(mapCategory(null, 'Toys & Games:Action Figures & Accessories'), 'toys-games');
  assert.equal(mapCategory(null, 'Antiques:Antique Clocks'), 'vintage-antiques');
  assert.equal(mapCategory(null, 'Something New:Whatever'), 'other');
  assert.equal(mapCategory(null, null), 'other');
});

test('logs never contain secrets or tokens', async () => {
  const env = { EBAY_CLIENT_ID: CFG.clientId, EBAY_CLIENT_SECRET: CFG.clientSecret, EBAY_REFRESH_TOKEN: CFG.refreshToken, SYNC_TOKEN: 'sync-token-0123456789abcdefghij' } as never;
  const lines: string[] = [];
  const orig = console.log;
  console.log = (s: string) => lines.push(s);
  try {
    const log = makeLogger(env);
    log('test', { message: `failed with ${CFG.clientSecret} and ${CFG.refreshToken} and v^1.1#i^1#ACCESSTOKENabcdefghijkl` });
    const { deps } = setup({ items: items(3), expireFirstToken: true });
    await runSync({ ...deps, log }, opts());
    const { deps: d2 } = setup({ items: items(3), tokenError: 'invalid_grant' });
    await runSync({ ...d2, log }, opts());
  } finally {
    console.log = orig;
  }
  const all = lines.join('\n');
  assert.ok(lines.length >= 3);
  for (const secret of [CFG.clientSecret, CFG.refreshToken, 'ACCESSTOKEN', 'TESTTOKEN']) assert.ok(!all.includes(secret), `leaked ${secret}`);
});

test('running eBay coupons are synced and shown; a missing scope is non-fatal', async () => {
  const db = new FakeD1();
  const { deps, logs } = setup({ items: items(3), coupons: [
    { code: 'SCGOODSOCT26', percent: 30, maxOff: 100, all: true },
    { code: 'FIVER', amountOff: 5, minAmount: 30, listingIds: ['117431000000'] },
    { code: 'VIPONLY', percent: 50, all: true, type: 'PRIVATE_SINGLE_SELLER_COUPON' },
  ] }, db);
  const r = await runSync(deps, opts());
  assert.equal(r.status, 'success', r.message);
  assert.ok(logs.some((l) => l.includes('coupons_synced')), logs.join('\n'));
  const meta = await new D1Catalogue(db as never, {}).meta();
  const cs = activeCoupons({}, meta.couponsJson, new Date('2026-10-01T12:00:00Z'));
  assert.deepEqual(cs.map((c) => c.code), ['SCGOODSOCT26', 'FIVER'], 'private coupon not advertised');
  assert.equal(cs[0].maxOffPence, 10000);
  assert.equal(cs[1].minSpendPence, 3000);
  assert.ok(cs[1].eligible instanceof Set && cs[1].eligible.has('117431000000'));
  // Manual settings override what eBay says.
  assert.deepEqual(activeCoupons({ COUPON_CODE: 'manual1', COUPON_PERCENT: '5' }, meta.couponsJson).map((c) => c.code), ['MANUAL1']);
  // No marketing scope: listings still publish, coupons just aren't updated.
  const { deps: d2, logs: l2 } = setup({ items: items(3), marketingForbidden: true }, db);
  const r2 = await runSync(d2, opts());
  assert.equal(r2.status, 'success');
  assert.ok(l2.some((l) => l.includes('coupon_lookup_failed') && l.includes('sell.marketing.readonly')));
});
