import type { Listing } from './types';

/**
 * ILLUSTRATIVE DEMO DATA — not real stock, prices or listings.
 * Used only when DATA_MODE=demo, which is refused on production hosts.
 */
const IMG = {
  vase: '/assets/img/demo/amber-vase.webp',
  radio: '/assets/img/demo/radio.webp',
  jug: '/assets/img/demo/jug.webp',
  car: '/assets/img/demo/car.webp',
  jugTile: '/assets/img/demo/cat-collectables.webp',
  radioTile: '/assets/img/demo/cat-vintage.webp',
  chair: '/assets/img/demo/cat-home.webp',
  redCar: '/assets/img/demo/cat-toys.webp',
  records: '/assets/img/demo/cat-music.webp',
};

type Seed = [title: string, img: string, cat: string, pence: number, condition: string, type?: 'auction', bids?: number];

const SEEDS: Seed[] = [
  ['Amber glass vase', IMG.vase, 'vintage-antiques', 2499, 'Pre-owned'],
  ['Wooden tabletop radio', IMG.radio, 'retro-tech', 4500, 'Pre-owned'],
  ['Blue and white ceramic jug', IMG.jug, 'vintage-antiques', 1899, 'Pre-owned'],
  ['Collectable diecast car, blue', IMG.car, 'toys-games', 1299, 'Pre-owned'],
  ['Spindle-back wooden armchair', IMG.chair, 'home-furniture', 6500, 'Pre-owned'],
  ['Stack of vintage LP records', IMG.records, 'music-vinyl', 2000, 'Pre-owned', 'auction', 3],
  ['Floral ceramic water jug', IMG.jugTile, 'collectables', 1650, 'Pre-owned'],
  ['Red diecast city car', IMG.redCar, 'toys-games', 999, 'Pre-owned'],
  ['Walnut-effect valve radio', IMG.radioTile, 'retro-tech', 7999, 'Pre-owned'],
  ['Tall amber glass bottle vase', IMG.vase, 'vintage-antiques', 1499, 'Pre-owned'],
  ['Hand-painted blue floral jug', IMG.jug, 'collectables', 2250, 'Pre-owned'],
  ['Small blue diecast saloon', IMG.car, 'toys-games', 800, 'Pre-owned', 'auction', 0],
  ['Classic vinyl LP bundle', IMG.records, 'music-vinyl', 3500, 'Pre-owned'],
  ['Wooden kitchen chair', IMG.chair, 'home-furniture', 3000, 'Pre-owned'],
  ['Mid-century style radio', IMG.radio, 'retro-tech', 5500, 'Pre-owned'],
  ['Glazed ceramic pitcher', IMG.jugTile, 'vintage-antiques', 1200, 'Pre-owned'],
  ['Amber pressed-glass vase', IMG.vase, 'home-furniture', 1100, 'Pre-owned'],
  ['Red toy car with white roof', IMG.redCar, 'collectables', 1850, 'Pre-owned'],
  ['Mixed vinyl records, 12 inch', IMG.records, 'music-vinyl', 2800, 'Pre-owned'],
  ['Portable wooden cased radio', IMG.radioTile, 'retro-tech', 3900, 'Pre-owned'],
  ['Blue and white milk jug', IMG.jug, 'home-furniture', 950, 'Pre-owned'],
  ['Wooden dining chair', IMG.chair, 'home-furniture', 2500, 'Pre-owned'],
  ['Boxed-style diecast model car', IMG.car, 'collectables', 1500, 'New'],
  ['Decorative amber glass vessel', IMG.vase, 'vintage-antiques', 3200, 'Pre-owned'],
  ['Painted ceramic jug with handle', IMG.jugTile, 'vintage-antiques', 1400, 'Pre-owned'],
  ['Vinyl LP selection', IMG.records, 'music-vinyl', 1500, 'Pre-owned', 'auction', 1],
  ['Toy saloon car, red', IMG.redCar, 'toys-games', 700, 'Pre-owned'],
  ['Tabletop radio with dial', IMG.radio, 'retro-tech', 6000, 'Pre-owned'],
];

const BASE = Date.parse('2026-09-30T09:00:00Z');

export const DEMO_LISTINGS: Listing[] = SEEDS.map(([title, img, cat, pence, condition, type, bids], i) => ({
  itemId: `demo-${String(i + 1).padStart(3, '0')}`,
  title,
  listingType: type === 'auction' ? 'auction' : 'fixed',
  pricePence: pence,
  currency: 'GBP',
  buyItNowPence: null,
  bidCount: type === 'auction' ? bids ?? 0 : null,
  bestOffer: i % 5 === 0,
  condition,
  ebayCategoryId: null,
  ebayCategoryPath: null,
  siteCategory: cat,
  images: [img],
  url: 'https://www.ebay.co.uk/str/secondchancegoodsltd',
  quantityAvailable: 1,
  startTime: new Date(BASE - i * 3_600_000 * 7).toISOString(),
  endTime: type === 'auction' ? new Date(BASE + (i + 2) * 86_400_000).toISOString() : null,
}));
