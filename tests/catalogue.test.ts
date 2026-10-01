import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeD1 } from './d1-shim';
import { D1Catalogue, parseQuery } from '../src/catalogue';
import { writeSnapshot } from '../sync-worker/src/sync';
import type { Listing } from '../src/types';

const L = (id: string, title: string, pence: number, cat: string, start: string, extra: Partial<Listing> = {}): Listing => ({
  itemId: id, title, listingType: 'fixed', pricePence: pence, currency: 'GBP', buyItNowPence: null, bidCount: null, bestOffer: false,
  condition: 'Pre-owned', ebayCategoryId: null, ebayCategoryPath: null, siteCategory: cat, images: [`https://i.ebayimg.com/${id}/s-l1600.jpg`],
  url: `https://www.ebay.co.uk/itm/${id}`, quantityAvailable: 1, startTime: start, endTime: null, ...extra,
});

async function seeded(opts: { source?: string; ageHours?: number } = {}) {
  const db = new FakeD1();
  await writeSnapshot(db as never, 'snap1', [
    L('100000001', 'Genuine Dyson V10 crevice tool', 999, 'home-furniture', '2026-09-29T10:00:00Z'),
    L('100000002', 'Victorian uranium glass vase', 8000, 'vintage-antiques', '2026-09-28T10:00:00Z'),
    L('100000003', 'Star Wars Darth Maul figure 100%_boxed', 1999, 'toys-games', '2026-09-30T08:00:00Z'),
    L('100000004', 'Dyson extension hose', 1999, 'home-furniture', '2026-09-27T10:00:00Z', { images: [] }),
  ]);
  await writeSnapshot(db as never, 'old', [L('900000001', 'Old item', 100, 'other', '2026-01-01T00:00:00Z')]);
  const last = new Date(Date.now() - (opts.ageHours ?? 0.5) * 3600_000).toISOString();
  for (const [k, v] of Object.entries({ current_snapshot: 'snap1', last_success_at: last, item_count: '4', source: opts.source ?? 'api.ebay.com' })) {
    await db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').bind(k, v).run();
  }
  return db;
}

test('search, filter, sort and paging read only the current snapshot', async () => {
  const cat = new D1Catalogue((await seeded()) as never, {});
  const q = (s: string) => parseQuery(new URL('https://x.test/shop' + s), 2);
  let r = await cat.search(q('?q=dyson'));
  assert.equal(r.total, 2);
  r = await cat.search(q('?q=DYSON crevice'));
  assert.deepEqual(r.items.map((i) => i.itemId), ['100000001']);
  r = await cat.search(q('?q=100%25_'));
  assert.deepEqual(r.items.map((i) => i.itemId), ['100000003'], 'LIKE wildcards are escaped');
  r = await cat.search({ ...q('?sort=price-desc'), category: '' });
  assert.equal(r.total, 4);
  assert.deepEqual(r.items.map((i) => i.pricePence), [8000, 1999]);
  r = await cat.search(q('?sort=price-asc&page=2'));
  assert.deepEqual(r.items.map((i) => i.pricePence), [1999, 8000]);
  r = await cat.search({ ...q(''), category: 'home-furniture' });
  assert.equal(r.total, 2);
  assert.equal(r.items[0].itemId, '100000001', 'newest first');
  assert.equal(await cat.item('900000001'), null, 'items from other snapshots are invisible');
  const stats = await cat.categoryStats();
  assert.deepEqual(stats.find((s) => s.slug === 'home-furniture'), { slug: 'home-furniture', count: 2, cover: 'https://i.ebayimg.com/100000001/s-l1600.jpg' });
});

test('invalid query params fall back to safe defaults', () => {
  const q = parseQuery(new URL('https://x.test/shop?sort=drop%20table&page=-4&q=' + 'a'.repeat(200)));
  assert.equal(q.sort, 'newest');
  assert.equal(q.page, 1);
  assert.equal(q.q.length, 80);
});

test('data older than six hours is flagged stale; untrusted sources are ignored', async () => {
  assert.equal((await new D1Catalogue((await seeded({ ageHours: 1 })) as never, {}).meta()).stale, false);
  assert.equal((await new D1Catalogue((await seeded({ ageHours: 7 })) as never, {}).meta()).stale, true);
  assert.equal((await new D1Catalogue((await seeded({ ageHours: 5 })) as never, { MAX_DATA_AGE_HOURS: '48' }).meta()).stale, false, 'config cannot exceed 6h');
  assert.equal((await new D1Catalogue((await seeded({ ageHours: 7 })) as never, { MAX_DATA_AGE_HOURS: '48' }).meta()).stale, true);
  const mock = await new D1Catalogue((await seeded({ source: '127.0.0.1:9999' })) as never, {}).meta();
  assert.equal(mock.snapshotId, null, 'snapshot from a mock endpoint is never shown');
  const allowed = await new D1Catalogue((await seeded({ source: '127.0.0.1:9999' })) as never, { ALLOW_TEST_SOURCE: '1' }).meta();
  assert.equal(allowed.snapshotId, 'snap1');
});

import { activeCoupon, couponPrice } from '../src/config';

test('coupon settings: prices, cap, minimum spend and expiry', () => {
  const env = { COUPON_CODE: 'scgoodsoct26', COUPON_PERCENT: '30', COUPON_MAX_OFF: '100', COUPON_ENDS: '2026-10-31' };
  const c = activeCoupon(env, new Date('2026-10-01T12:00:00Z'))!;
  assert.equal(c.code, 'SCGOODSOCT26');
  assert.equal(couponPrice(1499, c), 1049, '£14.99 → £10.49, as eBay shows');
  assert.equal(couponPrice(5999, c), 4199);
  assert.equal(couponPrice(50000, c), 40000, 'capped at £100 off');
  assert.equal(activeCoupon(env, new Date('2026-11-01T00:30:00Z')), null, 'expired after the last day (UK time)');
  assert.ok(activeCoupon(env, new Date('2026-10-31T23:30:00Z')), 'still on during the last day');
  assert.equal(activeCoupon({}), null);
  assert.equal(activeCoupon({ COUPON_CODE: 'X', COUPON_PERCENT: '0' }), null);
  assert.equal(activeCoupon({ COUPON_CODE: 'X', COUPON_PERCENT: '10', COUPON_ENDS: '31/10/2026' }), null, 'bad date format switches it off rather than running forever');
  const min = activeCoupon({ COUPON_CODE: 'X', COUPON_PERCENT: '10', COUPON_MIN_SPEND: '20' })!;
  assert.equal(couponPrice(1999, min), null);
  assert.equal(couponPrice(2000, min), 1800);
});
