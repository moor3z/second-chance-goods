import { BUSINESS } from './config';
import { getCategory } from './categories';
import { ebayImage, itemPath, truncate } from './format';
import type { Listing } from './types';

/** Meta catalogue condition values. */
export function metaCondition(condition: string | null): 'new' | 'refurbished' | 'used' {
  const c = (condition || '').toLowerCase();
  if (c.startsWith('new')) return 'new';
  if (c.includes('refurb')) return 'refurbished';
  return 'used';
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const FEED_COLUMNS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand', 'product_type'] as const;

/** One feed row per fixed-price listing with a photo. Auctions are left out: their price isn't fixed. */
export function feedRow(l: Listing, origin: string): string[] | null {
  if (l.listingType !== 'fixed' || !l.images.length || l.pricePence <= 0) return null;
  const cat = getCategory(l.siteCategory);
  const desc = `${l.title}. ${l.condition ? `Condition: ${l.condition}. ` : ''}Pre-loved from ${BUSINESS.name}. Full details, photos and delivery options on the listing.`;
  return [
    l.itemId,
    truncate(l.title, 150),
    truncate(desc, 5000),
    'in stock',
    metaCondition(l.condition),
    `${(l.pricePence / 100).toFixed(2)} ${l.currency}`,
    origin + itemPath(l),
    ebayImage(l.images[0], 1600),
    l.images.slice(1, 10).map((u) => ebayImage(u, 1600)).join(','),
    BUSINESS.name,
    cat ? cat.name : 'Other finds',
  ];
}

export function buildCsv(listings: Listing[], origin: string): string {
  const rows = [FEED_COLUMNS.join(',')];
  for (const l of listings) {
    const r = feedRow(l, origin);
    if (r) rows.push(r.map(csvCell).join(','));
  }
  return rows.join('\n') + '\n';
}
