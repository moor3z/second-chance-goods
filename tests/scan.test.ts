import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResult, researchLinks } from '../src/scan';
import { activeComps } from '../sync-worker/src/comps';

test('scanner: parses the identifier JSON defensively', () => {
  const r = parseResult('```json\n{"title":"Hitachi AX-M67 Micro Hi-Fi Stereo System CD/FM/AUX w/ Speakers","brand":"Hitachi","model":"AX-M67","itemType":"Micro hi-fi system","category":"Sound & Vision > Compact/Shelf Stereos","condition":"USED_GOOD","conditionNotes":"Speaker fabric torn","specifics":[{"name":"Brand","value":"Hitachi"},{"name":"Model","value":"AX-M67"}],"description":"Used but in good working condition. Fabric on the speakers is torn.","searchQuery":"Hitachi AX-M67","confidence":"high","checkFirst":["Test the CD tray"]}\n```');
  assert.equal(r.title.length <= 80, true);
  assert.equal(r.condition, 'USED_GOOD');
  assert.equal(r.specifics.length, 2);
  assert.equal(r.searchQuery, 'Hitachi AX-M67');
  const bad = parseResult('{"title":"' + 'x'.repeat(200) + '","condition":"MINT","specifics":"nope","confidence":"sure"}');
  assert.equal(bad.title.length, 80);
  assert.equal(bad.condition, 'USED_GOOD', 'unknown condition falls back');
  assert.deepEqual(bad.specifics, []);
  assert.equal(bad.confidence, 'medium');
  assert.equal(bad.searchQuery, 'x'.repeat(60), 'falls back to the title');
});

test('scanner: research links hit eBay sold/completed and Terapeak', () => {
  const l = researchLinks('Hitachi AX-M67');
  assert.match(l.sold, /ebay\.co\.uk\/sch\/i\.html\?_nkw=Hitachi%20AX-M67&LH_Sold=1&LH_Complete=1/);
  assert.match(l.terapeak, /ebay\.co\.uk\/sh\/research\?.*keywords=Hitachi%20AX-M67.*tabName=SOLD/);
});

test('comps: summarises Browse API asking prices', async () => {
  const fetchFn = async (url: string) => {
    assert.match(url, /buy\/browse\/v1\/item_summary\/search\?q=Hitachi%20AX-M67/);
    return Response.json({ itemSummaries: [
      { title: 'Hitachi AX-M67 hifi', price: { value: '34.99', currency: 'GBP' }, condition: 'Used', itemWebUrl: 'https://www.ebay.co.uk/itm/1', image: { imageUrl: 'https://i.ebayimg.com/x.jpg' } },
      { title: 'Hitachi AX-M67 boxed', price: { value: '59.00', currency: 'GBP' }, condition: 'Used', itemWebUrl: 'https://www.ebay.co.uk/itm/2' },
      { title: 'Spares', price: { value: '12.50', currency: 'GBP' }, condition: 'For parts', itemWebUrl: 'https://www.ebay.co.uk/itm/3' },
      { title: 'US listing', price: { value: '40', currency: 'USD' }, condition: 'Used', itemWebUrl: 'https://www.ebay.com/itm/4' },
    ] });
  };
  const c = await activeComps({ tradingUrl: 'https://api.ebay.com/ws/api.dll' } as never, fetchFn as never, 'tok', 'Hitachi AX-M67');
  assert.equal(c.count, 3, 'non-GBP dropped');
  assert.deepEqual([c.minPence, c.medianPence, c.maxPence], [1250, 3499, 5900]);
  assert.equal(c.items[0].image, 'https://i.ebayimg.com/x.jpg');
});

import { imageMatches } from '../sync-worker/src/comps';
import { signedPhotoUrl, verifyPhotoSig, lensUrl } from '../src/scan';

test('image search: posts the photo to eBay and summarises look-alike listings', async () => {
  const fetchFn = async (url: string, init?: RequestInit) => {
    assert.match(url, /search_by_image\?limit=20$/);
    assert.equal(JSON.parse(String(init?.body)).image, 'QUJD');
    return Response.json({ itemSummaries: [
      { title: 'Panasonic NV-HD640 VHS', price: { value: '45.00', currency: 'GBP' }, condition: 'Used', itemWebUrl: 'https://www.ebay.co.uk/itm/1', image: { imageUrl: 'https://i.ebayimg.com/a.jpg' } },
      { title: 'Panasonic VCR US', price: { value: '60', currency: 'USD' }, condition: 'Used', itemWebUrl: 'https://www.ebay.com/itm/2' },
    ] });
  };
  const r = await imageMatches({ tradingUrl: 'https://api.ebay.com/ws/api.dll' } as never, fetchFn as never, 'tok', 'QUJD');
  assert.equal(r.count, 2);
  assert.equal(r.items[0].pricePence, 4500);
  assert.equal(r.items[1].pricePence, 0, 'non-GBP shown without a price');
  assert.equal(r.medianPence, 4500);
});

test('Lens links: signed, time-limited, tamper-proof', async () => {
  const url = await signedPhotoUrl('https://www.example.co.uk', 'scans/2026-10-08/abc/1.jpg', 'staff-secret-key-123');
  const u = new URL(url);
  assert.equal(u.pathname, '/scan-photo/scans%2F2026-10-08%2Fabc%2F1.jpg');
  const e = u.searchParams.get('e')!, s = u.searchParams.get('s')!;
  assert.equal(await verifyPhotoSig('scans/2026-10-08/abc/1.jpg', e, s, 'staff-secret-key-123'), true);
  assert.equal(await verifyPhotoSig('scans/2026-10-08/abc/2.jpg', e, s, 'staff-secret-key-123'), false, 'different photo');
  assert.equal(await verifyPhotoSig('scans/2026-10-08/abc/1.jpg', '1000', s, 'staff-secret-key-123'), false, 'expired');
  assert.equal(await verifyPhotoSig('scans/2026-10-08/abc/1.jpg', e, s, 'other-key'), false, 'wrong key');
  assert.match(lensUrl(url), /^https:\/\/lens\.google\.com\/uploadbyurl\?url=https%3A%2F%2Fwww\.example\.co\.uk%2Fscan-photo/);
});
