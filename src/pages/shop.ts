import { BUSINESS } from '../config';
import { getCategory, SITE_CATEGORIES } from '../categories';
import { h, type Safe } from '../html';
import { itemPath } from '../format';
import { breadcrumbs, icons, page, productCard, type RenderCtx } from '../ui';
import { SORTS, type Catalogue } from '../catalogue';
import type { CatalogueQuery } from '../types';
import { notFoundPage } from './errors';

function queryString(q: Partial<CatalogueQuery>, overrides: Partial<CatalogueQuery> = {}): string {
  const m = { ...q, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set('q', m.q);
  if (m.category) p.set('category', m.category);
  if (m.sort && m.sort !== 'newest') p.set('sort', m.sort);
  if (m.page && m.page > 1) p.set('page', String(m.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Where a query "lives": category-only queries belong on /category/<slug>. */
export function preferredUrl(q: CatalogueQuery): string {
  if (q.category && !q.q && q.sort === 'newest') {
    return `/category/${q.category}${q.page > 1 ? `?page=${q.page}` : ''}`;
  }
  return `/shop${queryString(q)}`;
}

function pagination(base: string, q: CatalogueQuery, total: number): Safe {
  const pages = Math.ceil(total / q.pageSize);
  if (pages <= 1) return h``;
  const href = (n: number) => {
    const qs = base === '/shop' ? queryString(q, { page: n }) : queryString({ ...q, category: '' }, { page: n });
    return `${base}${qs}`;
  };
  const nums: (number | '…')[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - q.page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return h`<nav class="pager" aria-label="Pages">
    ${q.page > 1 ? h`<a class="pager-step" href="${href(q.page - 1)}" rel="prev">Previous</a>` : h`<span class="pager-step" aria-disabled="true">Previous</span>`}
    <ol>${nums.map((n) =>
      n === '…' ? h`<li class="pager-gap" aria-hidden="true">…</li>`
      : n === q.page ? h`<li><span aria-current="page"><span class="visually-hidden">Page </span>${n}</span></li>`
      : h`<li><a href="${href(n)}"><span class="visually-hidden">Page </span>${n}</a></li>`)}</ol>
    ${q.page < pages ? h`<a class="pager-step" href="${href(q.page + 1)}" rel="next">Next</a>` : h`<span class="pager-step" aria-disabled="true">Next</span>`}
  </nav>`;
}

export async function catalogueView(ctx: RenderCtx, cat: Catalogue, q: CatalogueQuery, fixedCategory: string | null): Promise<Response> {
  const category = fixedCategory ? getCategory(fixedCategory) : q.category ? getCategory(q.category) : null;
  if ((fixedCategory || q.category) && !category) return notFoundPage(ctx, 'We couldn’t find that category.');
  const stat = category ? ctx.stats.find((s) => s.slug === category.slug) : null;
  if (category && ctx.meta.snapshotId && !(stat && stat.count > 0)) {
    return notFoundPage(ctx, `There’s nothing in ${category.name} at the moment. New finds are listed regularly, so have a look at the full collection.`, 404);
  }

  let result: { items: Awaited<ReturnType<Catalogue['search']>>['items']; total: number } | null = null;
  let failed = false;
  try {
    result = await cat.search({ ...q, category: category?.slug || '' });
  } catch (err) {
    console.error(JSON.stringify({ event: 'catalogue_query_failed', message: (err as Error).message }));
    failed = true;
  }

  const base = fixedCategory ? `/category/${fixedCategory}` : '/shop';
  const filtered = !!(q.q || q.sort !== 'newest');
  const heading = category ? category.name : q.q ? `Results for “${q.q}”` : 'The collection';
  const total = result?.total ?? 0;
  const first = total ? (q.page - 1) * q.pageSize + 1 : 0;
  const last = Math.min(total, q.page * q.pageSize);
  const inStock = SITE_CATEGORIES.filter((c) => (ctx.stats.find((s) => s.slug === c.slug)?.count || 0) > 0);
  const activeCat = category?.slug || '';
  const anyFilter = !!(q.q || activeCat || q.sort !== 'newest');
  const pageBeyondEnd = result && total > 0 && result.items.length === 0;

  const trail = [{ name: 'Home', path: '/' }, { name: 'Shop all', path: '/shop' }];
  if (category) trail.push({ name: category.name, path: `/category/${category.slug}` });
  const crumbs = breadcrumbs(ctx, trail);

  const main = h`
<div class="wrap page-head">
  ${crumbs.html}
  <h1 class="page-title">${heading}</h1>
  ${category ? h`<p class="page-intro">${category.description}</p>` : h`<p class="page-intro">Everything currently listed in our eBay shop. Browse here, then buy on eBay.</p>`}
</div>

<div class="wrap">
  <form class="filters" action="/shop" method="get" aria-label="Filter and sort">
    <div class="field field-q">
      <label for="filter-q">Search</label>
      <input id="filter-q" type="search" name="q" value="${q.q}" placeholder="e.g. radio, Dyson, vinyl" enterkeyhint="search">
    </div>
    <div class="field">
      <label for="filter-cat">Category</label>
      <select id="filter-cat" name="category">
        <option value="">All categories</option>
        ${inStock.map((c) => h`<option value="${c.slug}"${c.slug === activeCat ? h` selected` : ''}>${c.name}</option>`)}
      </select>
    </div>
    <div class="field">
      <label for="filter-sort">Sort by</label>
      <select id="filter-sort" name="sort">
        ${SORTS.map((s) => h`<option value="${s.key}"${s.key === q.sort ? h` selected` : ''}>${s.label}</option>`)}
      </select>
    </div>
    <div class="filter-actions">
      <button class="btn btn-small" type="submit">Apply</button>
      ${anyFilter ? h`<a class="text-link" href="/shop">Clear filters</a>` : ''}
    </div>
  </form>

  ${failed
    ? h`<div class="empty" role="alert"><h2>The catalogue didn’t load</h2><p>Something went wrong fetching our listings. Try again in a minute, or browse everything directly on eBay.</p><p><a class="btn" href="${BUSINESS.ebayStoreUrl}">Open our eBay shop${icons.arrow}</a></p></div>`
    : !ctx.meta.snapshotId
      ? h`<div class="empty" role="status"><h2>The catalogue is being set up</h2><p>Our eBay listings haven’t been loaded into the website yet. Everything we sell is available on our eBay shop.</p><p><a class="btn" href="${BUSINESS.ebayStoreUrl}">Open our eBay shop${icons.arrow}</a></p></div>`
      : total === 0
        ? h`<div class="empty" role="status"><h2>No matches${q.q ? h` for “${q.q}”` : ''}</h2><p>Try a shorter or different word, or clear the filters to see everything.</p><p><a class="btn" href="/shop">See the full collection${icons.arrow}</a></p></div>`
        : pageBeyondEnd
          ? h`<div class="empty" role="status"><h2>That page is empty</h2><p>There are fewer items than before. <a href="${base}">Go back to the first page</a>.</p></div>`
          : h`<p class="results-count" role="status">Showing ${first}–${last} of ${total} ${total === 1 ? 'item' : 'items'}</p>
             <div class="grid grid-4 results">${result!.items.map((l, i) => productCard(l, ctx, { eager: i < 4 && q.page === 1 }))}</div>
             ${pagination(base, q, total)}`}
  <p class="buy-note">Delivery, collection options and final availability are shown on each eBay listing, and all purchases are completed on eBay.</p>
</div>`;

  const status = failed ? 503 : 200;
  const canonicalPath = `${base}${q.page > 1 ? `?page=${q.page}` : ''}`;
  const res = page(ctx, {
    title: category ? `Second-hand ${category.name.toLowerCase()}${q.page > 1 ? ` (page ${q.page})` : ''} | Flintshire` : q.q ? `Search: ${q.q}` : `Shop all second-hand finds${q.page > 1 ? ` (page ${q.page})` : ''}`,
    description: category
      ? `${category.description} From a Flintshire second-hand shop; collect locally or buy on eBay.`
      : 'Everything currently listed by Second Chance Goods, a Flintshire second-hand shop: furniture, collectables and vintage finds. Buy on eBay.',
    canonicalPath: filtered ? base : canonicalPath,
    noindex: filtered || failed || total === 0,
    structuredData: [
      ...(category ? [crumbs.data] : []),
      ...(result && result.items.length && !filtered
        ? [{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: category ? category.name : 'The collection',
            numberOfItems: total,
            itemListElement: result.items.map((l, i) => ({ '@type': 'ListItem', position: (q.page - 1) * q.pageSize + i + 1, url: ctx.origin + itemPath(l), name: l.title })),
          }]
        : []),
    ],
    main,
  });
  if (status !== 200) return new Response(res.body, { status, headers: res.headers });
  return res;
}
