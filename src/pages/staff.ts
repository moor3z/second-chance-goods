import { COPY } from '../copy';
import { itemPostMessage } from '../facebook-message';
import { formatDate } from '../format';
import { getCategory } from '../categories';
import { ebayImage, formatMoney } from '../format';
import { h, type Safe } from '../html';
import { page, type RenderCtx } from '../ui';
import type { Listing } from '../types';

export type ListerMode = 'marketplace' | 'vinted';

export const MODES: Record<ListerMode, { name: string; path: string; intro: string; help: string; warn: string }> = {
  marketplace: {
    name: 'Facebook Marketplace', path: '/staff/marketplace',
    intro: 'Everything currently on eBay, newest first. Copy each field into Facebook Marketplace, save the photos, then tick it off.',
    help: 'Marketplace suits local collection and bulky items.',
    warn: 'If something sells locally, end the eBay listing straight away so it can’t sell twice. The website updates itself within 15 minutes.',
  },
  vinted: {
    name: 'Vinted', path: '/staff/vinted',
    intro: 'Items that suit Vinted (fashion, home, books, music, toys and collectables), newest first. Copy each field into the Vinted app, save the photos, then tick it off.',
    help: 'Vinted needs a business (Pro) account to sell as a company. Buyers pay postage through Vinted’s own labels, so only list things you can post.',
    warn: 'If something sells on Vinted, end the eBay listing straight away so it can’t sell twice. Keep the Vinted listing at the same price as eBay.',
  },
};

/** Site categories that make sense on Vinted (no large furniture, tools or electrical appliances). */
export const VINTED_CATEGORIES = ['fashion-jewellery', 'home-furniture', 'books-film', 'music-vinyl', 'toys-games', 'collectables', 'vintage-antiques', 'hobbies-sport'];

/** Suggested Vinted category path for each site category (check against the app; Vinted’s tree changes). */
const VINTED_CATEGORY: Record<string, string> = {
  'fashion-jewellery': 'Women or Men › Accessories (bags, jewellery, watches, sunglasses) or Clothing',
  'home-furniture': 'Home › Décor, Tableware or Textiles (Vinted doesn’t take large furniture)',
  'books-film': 'Entertainment › Books, or Films & TV',
  'music-vinyl': 'Entertainment › Music (vinyl, CDs)',
  'toys-games': 'Kids › Toys, or Entertainment › Video games / Board games',
  collectables: 'Entertainment › Collectables, or Home › Décor',
  'vintage-antiques': 'Home › Décor (vintage) or Entertainment › Collectables',
  'hobbies-sport': 'Entertainment › Hobbies, or Sports',
  'retro-tech': 'Electronics (limited on Vinted; check it’s allowed)',
  'tools-diy': 'Not usually suitable for Vinted',
  other: 'Home › Décor or Entertainment › Other',
};

/** Vinted condition options: New with tags, New without tags, Very good, Good, Satisfactory. */
export function vintedCondition(condition: string | null): string {
  const c = (condition || '').toLowerCase();
  if (c.includes('with tags')) return 'New with tags';
  if (c.startsWith('new')) return 'New without tags';
  if (c.includes('parts') || c.includes('not working')) return 'Satisfactory (describe the faults clearly)';
  if (c.includes('excellent') || c.includes('like new') || c.includes('open box')) return 'Very good';
  return 'Good';
}

export function vintedDescription(l: Listing): string {
  const extra = l.condition && /parts|not working/i.test(l.condition) ? ' Sold as seen for spares or repair.' : '';
  return COPY.vinted.description.replace('{condition}', l.condition || 'Pre-owned').replace('{extra}', extra);
}

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

export function marketplaceLister(ctx: RenderCtx, items: Listing[], pageNo: number, perPage: number, total: number, mode: ListerMode = 'marketplace', fbPosted: Record<string, string> = {}, fbEnabled = false): Response {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const m = MODES[mode];
  const isVinted = mode === 'vinted';
  const main = h`
<div class="wrap page-head">
  <nav class="staff-tabs" aria-label="Lister">
    ${(Object.keys(MODES) as ListerMode[]).map((k) => h`<a href="${MODES[k].path}"${k === mode ? h` aria-current="page"` : ''}>${MODES[k].name}</a>`)}
  </nav>
  <h1 class="page-title">${m.name} lister</h1>
  <p class="page-intro">${m.intro}</p>
  <div class="staff-warn" role="note"><strong>${m.warn}</strong> ${m.help}</div>
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
          <label class="listed-check"><input type="checkbox" data-listed="${l.itemId}"> Listed on ${isVinted ? 'Vinted' : 'Marketplace'}</label>
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
            <div class="lf"><span class="lf-label">Category (suggested)</span><p class="lf-text">${isVinted ? VINTED_CATEGORY[l.siteCategory] || 'Check in the app' : FB_CATEGORY[l.siteCategory] || 'Miscellaneous'}</p></div>
            <div class="lf"><span class="lf-label">Condition (suggested)</span><p class="lf-text">${isVinted ? vintedCondition(l.condition) : fbCondition(l.condition)}</p></div>
            ${copyField('Description', isVinted ? vintedDescription(l) : marketplaceDescription(l), `d${n}`, true)}
            <p class="lister-links"><a class="text-link" href="${l.url}" target="_blank" rel="noopener">Open eBay listing</a> ${cat ? h`<span class="staff-cat">${cat.name}</span>` : ''}</p>
            <details class="fb-post" data-fb-item="${l.itemId}"${fbPosted[l.itemId] ? h` data-fb-posted="${fbPosted[l.itemId]}"` : ''}>
              <summary>${fbPosted[l.itemId] ? h`Posted to Facebook ${formatDate(fbPosted[l.itemId])}` : 'Post to Facebook Page'}</summary>
              ${fbEnabled ? h`<label for="fb${n}">Post text (edit if you like)</label>
              <textarea id="fb${n}" rows="5" data-fb-text>${itemPostMessage(l, ctx.origin)}</textarea>
              <p class="fb-note">Goes out with up to 4 of the item’s photos.</p>
              <div class="fb-actions"><button class="btn btn-small" type="button" data-fb-post>${fbPosted[l.itemId] ? 'Post again' : 'Post to Facebook'}</button><span class="fb-status" role="status"></span></div>`
              : h`<p class="fb-note">Facebook posting isn’t set up yet. Follow section 3 of docs/FACEBOOK-SETUP.md, then add SYNC_WORKER_URL and the SYNC_TOKEN secret to the website project.</p>`}
            </details>
          </div>
        </div>
      </li>`;
    })}
  </ol>
  ${pages > 1 ? h`<nav class="pager" aria-label="Pages">
    ${pageNo > 1 ? h`<a class="pager-step" href="${m.path}?page=${pageNo - 1}">Previous</a>` : ''}
    <span aria-current="page">Page ${pageNo} of ${pages}</span>
    ${pageNo < pages ? h`<a class="pager-step" href="${m.path}?page=${pageNo + 1}">Next</a>` : ''}
  </nav>` : ''}
</div>
<script src="/assets/js/staff.js" defer></script>`;
  const res = page(ctx, { title: `${m.name} lister`, description: 'Staff only.', canonicalPath: null, noindex: true, main: h`<div data-lister="${mode}">${main}</div>`, bodyClass: 'staff' });
  return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), 'cache-control': 'no-store' } });
}
