import type { Listing } from './types';

const money = new Map<string, Intl.NumberFormat>();
export function formatMoney(pence: number, currency = 'GBP'): string {
  let f = money.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', { style: 'currency', currency });
    money.set(currency, f);
  }
  return f.format(pence / 100);
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });

export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '');
export const formatDate = (iso: string | null) => (iso ? dateOnly.format(new Date(iso)) : '');

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export const itemPath = (l: Pick<Listing, 'itemId' | 'title'>) => `/item/${encodeURIComponent(l.itemId)}/${slugify(l.title)}`;

/** eBay picture URLs end in s-l<size>.<ext>; request a sensible size instead of the original. */
export function ebayImage(url: string, size: 225 | 300 | 500 | 800 | 1600 = 500): string {
  return url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)(\?.*)?$/i, `/s-l${size}.$1`);
}

export function schemaCondition(condition: string | null): string {
  const c = (condition || '').toLowerCase();
  if (c.startsWith('new')) return 'https://schema.org/NewCondition';
  if (c.includes('refurb')) return 'https://schema.org/RefurbishedCondition';
  if (c.includes('parts') || c.includes('not working')) return 'https://schema.org/DamagedCondition';
  return 'https://schema.org/UsedCondition';
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}
