import { COPY } from '../copy';
import { getCategory } from '../categories';
import { ebayImage, formatMoney } from '../format';
import { h, type Safe } from '../html';
import { page, type RenderCtx } from '../ui';
import type { Listing } from '../types';

/** Suggested Facebook Marketplace category for each site category (Marketplace's own names). */
const FB_CATEGORY: Record<string, string> = {
  collectables: 'Antiques & collectibles',
  'vintage-antiques': 'Antiques & collectibles',
  'home-furniture': 'Household (or Furniture for chairs, tables and cabinets)',
  'toys-games': 'Toys & games',
  'music-vinyl': 'Musical instruments (or Books, films & music for records)',
  'retro-tech': 'Electronics',
  'books-film': 'Books, films & music',
  'tools-diy': 'Tools',
  'fashion-jewellery': 'Clothing & accessories (or Jewellery & watches)',
  'hobbies-sport': 'Sporting goods (or Arts & crafts)',
  other: 'Miscellaneous',
};

/** Marketplace condition options: New, Used – like new, Used – good, Used – fair. */
export function fbCondition(condition: string | null): string {
  const c = (condition || '').toLowerCase();
  if (c.startsWith('new')) return 'New';
  if (c.includes('parts') || c.includes('not working')) return 'Used – fair (say it’s for parts in the description)';
  if (c.includes('excellent') || c.includes('like new') || c.includes('open box')) return 'Used – like new';
  return 'Used – good';
}

export function marketplaceDescription(l: Listing): string {
  const extra = l.condition && /parts|not working/i.test(l.condition) ? ' Sold as seen for spares or repair.' : '';
  return COPY.marketplace.description
    .replace('{title}', l.title)
    .replace('{condition}', l.condition || 'Pre-owned')
    .replace('{extra}', extra);
}

const copyField = (label: string, value: string, id: string, multiline = false): Safe => h`
  <div class="lf">
    <label for="${id}">${label}</label>
    <div class="lf-row">
      ${multiline ? h`<textarea id="${id}" rows="6" readonly>${value}</textarea>` : h`<input id="${id}" type="text" value="${value}" readonly>`}
      <button class="btn btn-small copy-btn" type="button" data-copy="${id}">Copy</button>
    </div>
  </div>`;

export function staffLoginPage(ctx: RenderCtx, error = false): Response {
  const res = page(ctx, {
    title: 'Staff sign-in',
    description: 'Staff only.',
    canonicalPath: null,
    noindex: true,
    main: h`<div class="wrap page-head narrow">
      <h1 class="page-title">Staff sign-in</h1>
      ${error ? h`<p class="staff-error" role="alert">That password didn’t match. Try again.</p>` : ''}
      <form class="staff-login" method="post" action="/staff">
        <label for="staff-key">Password</label>
        <input id="staff-key" name="key" type="password" autocomplete="current-password" required>
        <button class="btn" type="submit">Sign in</button>
      </form>
    </div>`,
  });
  return new Response(res.body, { status: error ? 401 : 200, headers: { ...Object.fromEntries(res.headers), 'cache-control': 'no-store' } });
}

export function marketplaceLister(ctx: RenderCtx, items: Listing[], pageNo: number, perPage: number, total: number): Response {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const main = h`
<div class="wrap page-head">
  <h1 class="page-title">Marketplace lister</h1>
  <p class="page-intro">Everything currently on eBay, newest first. Copy each field into Facebook Marketplace, save the photos, then tick it off.</p>
  <div class="staff-warn" role="note"><strong>If something sells locally, end the eBay listing straight away</strong> so it can’t sell twice. The website updates itself within 15 minutes.</div>
  <div class="staff-tools">
    <label class="staff-toggle"><input type="checkbox" id="hide-listed"> Hide items I’ve already listed</label>
    <span class="staff-count" id="listed-count" aria-live="polite"></span>
    <form method="post" action="/staff/logout"><button class="text-link staff-out" type="submit">Sign out</button></form>
  </div>
</div>
<div class="wrap">
  <ol class="lister">
    ${items.map((l, i) => {
      const n = (pageNo - 1) * perPage + i;
      const cat = getCategory(l.siteCategory);
      const auction = l.listingType === 'auction';
      return h`<li class="lister-item" data-item="${l.itemId}">
        <div class="lister-head">
          <h2>${l.title}</h2>
          <label class="listed-check"><input type="checkbox" data-listed="${l.itemId}"> Listed on Marketplace</label>
        </div>
        ${auction ? h`<p class="staff-note">This is an <strong>auction</strong> on eBay (current bid ${formatMoney(l.pricePence, l.currency)}). Best not to list it locally until the auction ends.</p>` : ''}
        <div class="lister-grid">
          <div class="lister-photos">
            <p class="lf-label">Photos (${l.images.length}) – tap to open full size, then save</p>
            <ul>${l.images.slice(0, 10).map((u, k) => h`<li><a href="${ebayImage(u, 1600)}" target="_blank" rel="noopener"><img src="${ebayImage(u, 225)}" alt="Photo ${k + 1}" width="96" height="96" loading="lazy"></a></li>`)}</ul>
          </div>
          <div class="lister-fields">
            ${copyField('Title', l.title.slice(0, 100), `t${n}`)}
            ${copyField('Price (£)', auction ? '' : (l.pricePence / 100).toFixed(2), `p${n}`)}
            <div class="lf"><span class="lf-label">Category (suggested)</span><p class="lf-text">${FB_CATEGORY[l.siteCategory] || 'Miscellaneous'}</p></div>
            <div class="lf"><span class="lf-label">Condition (suggested)</span><p class="lf-text">${fbCondition(l.condition)}</p></div>
            ${copyField('Description', marketplaceDescription(l), `d${n}`, true)}
            <p class="lister-links"><a class="text-link" href="${l.url}" target="_blank" rel="noopener">Open eBay listing</a> ${cat ? h`<span class="staff-cat">${cat.name}</span>` : ''}</p>
          </div>
        </div>
      </li>`;
    })}
  </ol>
  ${pages > 1 ? h`<nav class="pager" aria-label="Pages">
    ${pageNo > 1 ? h`<a class="pager-step" href="/staff/marketplace?page=${pageNo - 1}">Previous</a>` : ''}
    <span aria-current="page">Page ${pageNo} of ${pages}</span>
    ${pageNo < pages ? h`<a class="pager-step" href="/staff/marketplace?page=${pageNo + 1}">Next</a>` : ''}
  </nav>` : ''}
</div>
<script src="/assets/js/staff.js" defer></script>`;
  const res = page(ctx, { title: 'Marketplace lister', description: 'Staff only.', canonicalPath: null, noindex: true, main, bodyClass: 'staff' });
  return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), 'cache-control': 'no-store' } });
}
