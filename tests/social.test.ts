import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeD1 } from './d1-shim';
import { writeSnapshot } from '../sync-worker/src/sync';
import { maybePostDailyDigest, buildMessage, type FacebookConfig } from '../sync-worker/src/facebook';
import { buildCsv, metaCondition } from '../src/feeds';
import { fbCondition, marketplaceDescription } from '../src/pages/staff';
import { checkKey, isStaff, loginCookie } from '../src/staff';
import type { Listing } from '../src/types';

const L = (id: string, title: string, pence: number, start: string, extra: Partial<Listing> = {}): Listing => ({
  itemId: id, title, listingType: 'fixed', pricePence: pence, currency: 'GBP', buyItNowPence: null, bidCount: null, bestOffer: false,
  condition: 'Used', ebayCategoryId: null, ebayCategoryPath: null, siteCategory: 'toys-games',
  images: [`https://i.ebayimg.com/images/g/${id}/s-l500.jpg`, `https://i.ebayimg.com/images/g/${id}b/s-l500.jpg`],
  url: `https://www.ebay.co.uk/itm/${id}`, quantityAvailable: 1, startTime: start, endTime: null, ...extra,
});

test('catalogue feed: Meta columns, CSV quoting, auctions and photo-less items excluded', () => {
  const csv = buildCsv([
    L('111', 'Cards Against Humanity, UK "edition", boxed', 1499, '2026-10-01T10:00:00Z'),
    L('222', 'Auction lot', 999, '2026-10-01T09:00:00Z', { listingType: 'auction' }),
    L('333', 'No photo', 500, '2026-10-01T08:00:00Z', { images: [] }),
  ], 'https://www.example.co.uk');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,product_type');
  assert.equal(lines.length, 2, 'only the fixed-price item with a photo');
  assert.match(lines[1], /^111,"Cards Against Humanity, UK ""edition"", boxed",/);
  assert.match(lines[1], /,in stock,used,14\.99 GBP,https:\/\/www\.example\.co\.uk\/item\/111\/cards-against-humanity-uk-edition-boxed,https:\/\/i\.ebayimg\.com\/images\/g\/111\/s-l1600\.jpg,/);
  assert.equal(metaCondition('New with tags'), 'new');
  assert.equal(metaCondition('Seller refurbished'), 'refurbished');
});

test('Marketplace lister helpers: condition mapping and description', () => {
  assert.equal(fbCondition('New'), 'New');
  assert.equal(fbCondition('Pre-owned'), 'Used – good');
  assert.match(fbCondition('For parts or not working'), /fair/);
  const d = marketplaceDescription(L('1', 'Lamp', 1000, '2026-10-01T00:00:00Z', { condition: 'For parts or not working' }));
  assert.match(d, /Condition: For parts or not working\. Sold as seen for spares or repair\./);
  assert.match(d, /Collection from Flintshire/);
});

test('staff sign-in: right password works, wrong one and missing key do not', async () => {
  const env = { STAFF_KEY: 'correct-horse-battery' };
  assert.equal(await checkKey('correct-horse-battery', env), true);
  assert.equal(await checkKey('wrong', env), false);
  assert.equal(await checkKey('anything', {}), false, 'disabled without STAFF_KEY');
  assert.equal(await checkKey('short', { STAFF_KEY: 'short' }), false, 'too-short keys are refused');
  const cookie = (await loginCookie(env)).split(';')[0];
  assert.equal(await isStaff(new Request('https://x/staff', { headers: { cookie } }), env), true);
  assert.equal(await isStaff(new Request('https://x/staff', { headers: { cookie } }), { STAFF_KEY: 'a-different-key-now' }), false, 'changing the key signs everyone out');
  assert.equal(await isStaff(new Request('https://x/staff', { headers: { cookie: 'scg_staff=' + '0'.repeat(64) } }), env), false);
  assert.match(await loginCookie(env), /HttpOnly; Secure; SameSite=Strict/);
});

const FB: FacebookConfig = { pageId: '1234', pageToken: 'EAAG-page-token-secret-xyz', graphVersion: 'v26.0', postHour: 18, maxItems: 10, siteUrl: 'https://www.example.co.uk', storeUrl: 'https://www.ebay.co.uk/str/x', intro: 'New in – {count} fresh finds today:', outro: 'Browse everything: {link}' };

function fbMock(opts: { fail?: 'token' | 'feed' } = {}) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  let n = 0;
  const fetch = async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body || ''));
    calls.push({ url, body });
    if (opts.fail === 'token') return Response.json({ error: { message: 'Error validating access token', code: 190 } }, { status: 400 });
    if (url.endsWith('/photos')) return Response.json({ id: `photo${++n}` });
    if (url.endsWith('/feed')) return opts.fail === 'feed' ? Response.json({ error: { message: 'Temporary', code: 2 } }, { status: 500 }) : Response.json({ id: '1234_999' });
    return new Response('{}', { status: 404 });
  };
  return { fetch, calls };
}

async function dbWithItems() {
  const db = new FakeD1();
  await writeSnapshot(db as never, 's1', [
    L('101', 'Vintage radio', 4500, '2026-10-01T09:00:00Z'),
    L('102', 'Toy car', 999, '2026-10-01T08:00:00Z', { listingType: 'auction' }),
    L('103', 'Old item', 500, '2026-09-20T08:00:00Z'),
  ]);
  await db.prepare("INSERT INTO sync_state (key, value) VALUES ('current_snapshot', 's1')").run();
  return db;
}
const at = (iso: string) => new Date(iso);
const noLog = () => {};

test('Facebook post: waits for the hour, posts once a day with photos, then nothing until new stock', async () => {
  const db = await dbWithItems();
  const m = fbMock();
  assert.deepEqual(await maybePostDailyDigest(db as never, FB, m.fetch as never, at('2026-10-01T15:00:00Z'), noLog), { status: 'skipped', reason: 'before posting hour' }, '16:00 UK');
  const r = await maybePostDailyDigest(db as never, FB, m.fetch as never, at('2026-10-01T17:05:00Z'), noLog);
  assert.equal(r.status, 'posted');
  assert.equal(m.calls.filter((c) => c.url.endsWith('/photos')).length, 2, 'one photo per new item');
  const feed = m.calls.find((c) => c.url.endsWith('/feed'))!;
  assert.equal(feed.url, 'https://graph.facebook.com/v26.0/1234/feed');
  const msg = feed.body.get('message')!;
  assert.match(msg, /New in – 2 fresh finds today:/);
  assert.match(msg, /• Vintage radio – £45\.00/);
  assert.match(msg, /• Toy car – auction from £9\.99/);
  assert.match(msg, /Browse everything: https:\/\/www\.example\.co\.uk\/shop/);
  assert.ok(!msg.includes('Old item'), 'only listings from the last 24 hours on the first run');
  assert.equal(feed.body.get('attached_media[0]'), '{"media_fbid":"photo1"}');
  assert.equal((await maybePostDailyDigest(db as never, FB, m.fetch as never, at('2026-10-01T19:00:00Z'), noLog)).status, 'skipped', 'once per day');
  const next = await maybePostDailyDigest(db as never, FB, m.fetch as never, at('2026-10-02T18:00:00Z'), noLog);
  assert.deepEqual(next, { status: 'skipped', reason: 'no new listings since the last post' }, 'no repeat of yesterday’s items');
});

test('Facebook post: preview sends nothing; failures retry at most 3 times a day; bad token stops early', async () => {
  const db = await dbWithItems();
  const m = fbMock();
  const p = await maybePostDailyDigest(db as never, FB, m.fetch as never, at('2026-10-01T10:00:00Z'), noLog, { preview: true });
  assert.equal(p.status, 'preview');
  assert.equal(m.calls.length, 0);
  const bad = fbMock({ fail: 'feed' });
  for (let i = 0; i < 3; i++) assert.equal((await maybePostDailyDigest(db as never, FB, bad.fetch as never, at(`2026-10-01T1${7 + i % 2}:${10 + i}:00Z`), noLog)).status, 'failed');
  assert.match(JSON.stringify(await maybePostDailyDigest(db as never, FB, bad.fetch as never, at('2026-10-01T20:00:00Z'), noLog)), /gave up for today/);
  const db2 = await dbWithItems();
  const tok = fbMock({ fail: 'token' });
  const r = await maybePostDailyDigest(db2 as never, FB, tok.fetch as never, at('2026-10-01T17:30:00Z'), noLog);
  assert.equal(r.status, 'failed');
  assert.equal(tok.calls.length, 1, 'stops at the first token error');
});

test('Facebook message falls back to the eBay shop link without a domain', () => {
  const msg = buildMessage({ ...FB, siteUrl: '' }, [{ item_id: '1', title: 'Jug', listing_type: 'fixed', price_pence: 1200, currency: 'GBP', image_urls: '[]', start_time: null }]);
  assert.match(msg, /Browse everything: https:\/\/www\.ebay\.co\.uk\/str\/x$/);
});

import { checkSyncHealth, type AlertConfig } from '../sync-worker/src/alerts';

const AL: AlertConfig = { to: 'steven@example.com', from: 'SCG <alerts@example.com>', apiKey: 're_test_key', afterFailures: 2, remindEvery: 8, statusUrl: 'https://w/status', siteUrl: '' };
function resendMock(fail = false) {
  const sent: { subject: string; text: string; to: string[] }[] = [];
  const fetch = async (_url: string, init?: RequestInit) => {
    if (fail) return new Response('nope', { status: 500 });
    const b = JSON.parse(String(init?.body));
    sent.push({ subject: b.subject, text: b.text, to: b.to });
    return Response.json({ id: 'email_1' });
  };
  return { fetch, sent };
}
async function addRun(db: FakeD1, status: string, at: string, message = 'Received 2245 listings but eBay reported 2246') {
  await db.prepare("INSERT INTO sync_runs (id, trigger, started_at, finished_at, status, message) VALUES (?, 'cron', ?, ?, ?, ?)").bind(crypto.randomUUID(), at, at, status, message).run();
}

test('sync alerts: email after 2 failures, reminder after 8 more, all-clear on recovery', async () => {
  const db = new FakeD1();
  await db.prepare("INSERT INTO sync_state (key, value) VALUES ('last_success_at', '2026-10-03T06:31:36Z')").run();
  const m = resendMock();
  await addRun(db, 'success', '2026-10-03T06:31:00Z', 'Published 2268 listings');
  await addRun(db, 'rejected', '2026-10-03T06:45:00Z');
  assert.equal(await checkSyncHealth(db as never, AL, m.fetch as never, () => {}), 'none', 'one failure: nothing yet');
  await addRun(db, 'rejected', '2026-10-03T07:00:00Z');
  assert.equal(await checkSyncHealth(db as never, AL, m.fetch as never, () => {}), 'alert');
  assert.equal(m.sent.length, 1);
  assert.deepEqual(m.sent[0].to, ['steven@example.com']);
  assert.match(m.sent[0].subject, /failed 2 times in a row/);
  assert.match(m.sent[0].text, /Received 2245 listings but eBay reported 2246/);
  assert.match(m.sent[0].text, /Last successful sync: 3 Oct, 07:31/);
  await addRun(db, 'failed', '2026-10-03T07:15:00Z');
  assert.equal(await checkSyncHealth(db as never, AL, m.fetch as never, () => {}), 'none', 'no email on every failure');
  for (let i = 0; i < 7; i++) await addRun(db, 'failed', `2026-10-03T0${8 + Math.floor(i / 4)}:${(i % 4) * 15 || '00'}:00Z`);
  assert.equal(await checkSyncHealth(db as never, AL, m.fetch as never, () => {}), 'reminder');
  assert.match(m.sent[1].subject, /failed 10 times/);
  await addRun(db, 'success', '2026-10-03T10:00:00Z', 'Published 2245 listings');
  assert.equal(await checkSyncHealth(db as never, AL, m.fetch as never, () => {}), 'recovered');
  assert.match(m.sent[2].subject, /working again/);
  assert.equal(await checkSyncHealth(db as never, AL, m.fetch as never, () => {}), 'none', 'quiet while healthy');
  // A failing email service never breaks the sync.
  const bad = resendMock(true);
  await addRun(db, 'failed', '2026-10-03T10:15:00Z'); await addRun(db, 'failed', '2026-10-03T10:30:00Z');
  const logs: string[] = [];
  assert.equal(await checkSyncHealth(db as never, AL, bad.fetch as never, (e) => logs.push(e)), 'none');
  assert.ok(logs.includes('alert_email_failed'));
});
