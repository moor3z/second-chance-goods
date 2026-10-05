import { COPY } from './copy';
import { formatMoney, itemPath } from './format';
import type { Listing } from './types';

/** Default wording for a single-item Facebook post. Links to the website when it has a domain, otherwise to eBay. */
export function itemPostMessage(l: Listing, siteUrl: string): string {
  const link = siteUrl ? siteUrl.replace(/\/+$/, '') + itemPath(l) : l.url;
  const price = l.listingType === 'auction' ? `Auction from ${formatMoney(l.pricePence, l.currency)}` : formatMoney(l.pricePence, l.currency);
  return COPY.facebookPost.item
    .replace('{title}', l.title)
    .replace('{price}', price)
    .replace('{condition}', l.condition || 'Pre-owned')
    .replace('{link}', link);
}
