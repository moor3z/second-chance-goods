// Local stand-in for eBay's OAuth and Trading API endpoints (end-to-end testing only).
import { createServer } from 'node:http';
import { mockEbay, type MockItem } from '../mock-ebay.ts';

const seeds: [string, string, string][] = [
  ['Amber glass vase', 'Pottery, Ceramics & Glass:Decorative Pottery, Ceramics & Glass:Vases', '24.99'],
  ['Wooden tabletop valve radio', 'Sound & Vision:Vintage Radios', '45.00'],
  ['Blue and white ceramic jug', 'Collectables:Kitchen & Home:Jugs', '18.99'],
  ['Diecast model car, blue', 'Toys & Games:Diecast & Vehicles:Cars', '12.99'],
  ['Spindle-back wooden armchair', 'Home, Furniture & DIY:Furniture:Chairs', '65.00'],
  ['Bundle of vintage LP records', 'Music:Vinyl Records', '20.00'],
];
const imgs = ['amber-vase', 'radio', 'jug', 'car', 'cat-home', 'cat-music'];
const items: MockItem[] = Array.from({ length: 58 }, (_, i) => {
  const [t, cat, price] = seeds[i % seeds.length];
  const auction = i % 9 === 4;
  return {
    id: String(117440000000 + i), title: `${t} ${Math.floor(i / seeds.length) + 1}`, price: auction ? '9.99' : (Number(price) + i).toFixed(2),
    type: auction ? 'Chinese' : 'FixedPriceItem', bids: auction ? i % 4 : 0, bestOffer: i % 5 === 0, category: cat, condition: i % 7 === 0 ? 'New' : 'Pre-owned',
    pictures: [0, 1, 2].map((k) => `https://i.ebayimg.com/images/g/${imgs[(i + k) % imgs.length]}/s-l1600.jpg`),
    start: new Date(Date.UTC(2026, 8, 30, 10) - i * 4 * 3600_000).toISOString(),
  };
});
// Two listings that must not appear: one ended, one sold out.
items.push({ id: '117449999990', title: 'Ended listing', price: '5.00', status: 'Completed' });
items.push({ id: '117449999991', title: 'Sold out listing', price: '5.00', qty: 1, sold: 1 });

const failNext = { page: 0 };
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const url = `http://127.0.0.1:9797${req.url}`;
  if (req.url === '/__fail-page-2') { failNext.page = 2; res.end('ok'); return; }
  const m = mockEbay({ items, pageSize: 25, failPages: failNext.page ? [failNext.page] : [], coupons: [{ code: 'SCGOODSOCT26', percent: 30, maxOff: 100, all: true, endDate: '2026-10-31T22:59:59.000Z' }] });
  const r = await m.fetch(url, { method: req.method, headers: req.headers as Record<string, string>, body: Buffer.concat(chunks).toString() });
  if (req.url?.includes('api.dll') && failNext.page && /<PageNumber>2</.test(Buffer.concat(chunks).toString())) failNext.page = 0;
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(await r.text());
  console.log(req.method, req.url, (req.headers['x-ebay-api-call-name'] as string) || '', r.status);
});
server.listen(9797, '127.0.0.1', () => console.log('mock eBay on :9797'));
