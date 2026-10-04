import { BUSINESS } from '../config';
import { COPY } from '../copy';
import { getCategory } from '../categories';
import { ebayImage, formatDateTime, formatMoney, itemPath, schemaCondition, truncate } from '../format';
import { h } from '../html';
import { breadcrumbs, icons, page, priceParts, type RenderCtx } from '../ui';
import type { Catalogue } from '../catalogue';
import { notFoundPage } from './errors';

export async function itemPage(ctx: RenderCtx, cat: Catalogue, id: string, slug: string | null): Promise<Response> {
  const l = await cat.item(id);
  if (!l) {
    return notFoundPage(ctx, 'It may have sold or the listing has ended. Have a look at what else is in the collection.', ctx.meta.snapshotId ? 410 : 404);
  }
  const canonicalPath = itemPath(l);
  if (slug !== null && `/item/${encodeURIComponent(id)}/${slug}` !== canonicalPath) {
    return Response.redirect(ctx.origin + canonicalPath, 301);
  }

  const isDemo = ctx.meta.mode === 'demo';
  const hide = ctx.meta.stale && !isDemo;
  const category = getCategory(l.siteCategory);
  const p = priceParts(l, hide, ctx.coupons);
  const imgs = l.images.slice(0, 12);
  const src = (u: string, size: 500 | 800 | 1600) => (isDemo ? u : ebayImage(u, size));
  const crumbs = breadcrumbs(ctx, [
    { name: 'Home', path: '/' },
    { name: 'Shop all', path: '/shop' },
    ...(category ? [{ name: category.name, path: `/category/${category.slug}` }] : []),
    { name: truncate(l.title, 48), path: canonicalPath },
  ]);

  const main = h`
<div class="wrap page-head">${crumbs.html}</div>
<div class="wrap product">
  <div class="gallery" data-gallery>
    <div class="gallery-main">
      ${imgs.length
        ? h`<img data-gallery-main src="${src(imgs[0], 800)}" width="800" height="800" alt="${l.title}${imgs.length > 1 ? `, photo 1 of ${imgs.length}` : ''}" fetchpriority="high">`
        : h`<span class="card-noimg">No photo</span>`}
      ${isDemo ? h`<span class="demo-tag">Illustrative</span>` : ''}
    </div>
    ${imgs.length > 1 ? h`<ul class="gallery-thumbs" aria-label="More photos">${imgs.map((u, i) => h`<li>
      <a href="${src(u, 1600)}" data-full="${src(u, 800)}" data-alt="${l.title}, photo ${i + 1} of ${imgs.length}"${i === 0 ? h` aria-current="true"` : ''}>
        <img src="${src(u, 500)}" width="96" height="96" alt="Photo ${i + 1} of ${imgs.length}" loading="lazy" decoding="async"></a></li>`)}</ul>` : ''}
  </div>

  <div class="product-info">
    <h1 class="product-title">${l.title}</h1>
    <p class="product-price">${p.main}</p>
    ${p.coupon ? h`<p class="product-coupon">${p.coupon}<span class="coupon-how">Enter the code at eBay checkout; eBay applies the discount.</span></p>` : ''}
    ${p.sub ? h`<p class="product-price-sub">${p.sub}</p>` : ''}
    ${!hide && l.listingType === 'auction' && l.buyItNowPence ? h`<p class="product-price-sub">Buy it now: ${formatMoney(l.buyItNowPence, l.currency)}</p>` : ''}
    <dl class="facts">
      ${l.condition ? h`<div><dt>Condition</dt><dd>${l.condition}</dd></div>` : ''}
      ${category ? h`<div><dt>Category</dt><dd><a href="/category/${category.slug}">${category.name}</a></dd></div>` : ''}
      <div><dt>Format</dt><dd>${l.listingType === 'auction' ? 'Auction' : 'Buy it now'}</dd></div>
      ${l.quantityAvailable && l.quantityAvailable > 1 ? h`<div><dt>Available</dt><dd>${l.quantityAvailable}</dd></div>` : ''}
    </dl>
    <p><a class="btn btn-wide" href="${l.url}">${isDemo ? 'Open our eBay shop' : l.listingType === 'auction' ? 'Bid on eBay' : 'View and buy on eBay'}${icons.arrow}</a></p>
    <div class="product-note">
      <p>Photos, the full description, postage, collection options and returns are on the eBay listing. eBay handles payment and has the final say on price and availability.</p>
      ${['home-furniture', 'other'].includes(l.siteCategory) ? h`<p>${COPY.bulky.heading} ${COPY.bulky.text} <a href="${COPY.bulky.url}" rel="noopener">${COPY.bulky.link}</a>.</p>` : ''}
      ${isDemo ? h`<p><strong>Demo preview:</strong> this is an illustrative product, not real stock.</p>`
        : ctx.meta.lastSuccessAt ? h`<p>Details last checked against eBay ${formatDateTime(ctx.meta.lastSuccessAt)}.</p>` : ''}
    </div>
    <p class="product-more"><a class="text-link" href="${BUSINESS.ebayContactUrl}">Ask us a question on eBay${icons.arrow}</a></p>
  </div>
</div>`;

  const data: unknown[] = [crumbs.data];
  // Product markup only for fixed-price items with a fresh price; auctions change too quickly to describe as an offer.
  if (!isDemo && !hide && l.listingType === 'fixed') {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: l.title,
      image: imgs.map((u) => ebayImage(u, 1600)),
      ...(category ? { category: category.name } : {}),
      offers: {
        '@type': 'Offer',
        url: l.url,
        price: (l.pricePence / 100).toFixed(2),
        priceCurrency: l.currency,
        availability: 'https://schema.org/InStock',
        itemCondition: schemaCondition(l.condition),
        seller: { '@type': 'Organization', '@id': ctx.origin + '/#store', name: BUSINESS.legalName },
      },
    });
  }

  return page(ctx, {
    title: truncate(l.title, 60),
    description: truncate(
      `${l.title}${l.condition ? `. ${l.condition}` : ''}${hide ? '' : `. ${l.listingType === 'auction' ? 'Auction' : formatMoney(l.pricePence, l.currency)}`}. From a Flintshire second-hand shop; buy on eBay.`,
      158,
    ),
    canonicalPath,
    noindex: isDemo,
    ogImage: imgs[0] ? (isDemo ? ctx.origin + imgs[0] : ebayImage(imgs[0], 800)) : undefined,
    structuredData: data,
    main,
    bodyClass: 'item',
  });
}
