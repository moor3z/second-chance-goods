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
