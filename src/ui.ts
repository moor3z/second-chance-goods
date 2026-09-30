import { ASSET_VERSION, BUSINESS, syncIntervalMinutes, type Env } from './config';
import { getCategory, SITE_CATEGORIES } from './categories';
import { ebayImage, formatDateTime, formatMoney, itemPath } from './format';
import { h, jsonLd, raw, type Safe } from './html';
import type { CatalogueMeta, CategoryStat, Listing } from './types';

export interface RenderCtx {
  env: Env;
  origin: string;
  meta: CatalogueMeta;
  stats: CategoryStat[];
  path: string;
  searchQ?: string;
  indexable: boolean;
}

/* ----------------------------------------------------------------- icons */
const svg = (d: string, cls = 'icon') =>
  raw(`<svg class="${cls}" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);
export const icons = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  arrow: svg('<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>', 'icon icon-arrow'),
  star: svg('<path d="m12 3.2 2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8Z"/>', 'icon icon-lg'),
  tag: svg('<path d="M3.5 12.3V4.6c0-.6.5-1.1 1.1-1.1h7.7l8.2 8.2a1.3 1.3 0 0 1 0 1.8l-6.9 6.9a1.3 1.3 0 0 1-1.8 0Z"/><circle cx="8.2" cy="8.2" r="1.4"/>', 'icon icon-lg'),
  bag: svg('<path d="M5 8h14l-1 12.5H6Z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>', 'icon icon-lg'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};

const MARK = raw(`<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="29" stroke="currentColor" stroke-width="2.6"/><path d="M3 32 A29 29 0 0 1 32 3" stroke="var(--orange)" stroke-width="2.6"/><g stroke="currentColor" stroke-width="2"><path d="M24.2 35.5 L22.6 19.2 Q22.4 16.6 25 16.2 L36.8 14.6 Q39.6 14.3 39.9 17 L41.4 33.6"/><path d="M19.6 36.4 Q19.4 33.9 21.9 33.9 L39.2 34.4 Q41.9 34.5 41.7 37.1 L41.5 38.9 Q41.3 41.1 39 41.1 L22.2 40.9 Q19.9 40.9 19.7 38.6 Z"/><path d="M17.2 29.4 Q16.4 27.6 18.3 27.4 L27.8 26.7 Q29.6 26.6 29.2 28.3"/><path d="M18.4 29.6 L20.6 33.8"/><path d="M41.2 25.2 L45 24.8 Q46.4 24.8 45.9 26.2 L44.6 29.8 L41.6 32.5"/><path d="M22.6 41 L19.2 50.6"/><path d="M38.6 41.2 L41.4 50.4"/><path d="M41.3 39.6 L45.4 47.2"/><path d="M25.8 41 L27.2 46.2"/></g></svg>`);

export const logo = (cls = '') =>
  h`<a class="logo ${cls}" href="/" aria-label="${BUSINESS.legalName} home">${MARK}<span class="logo-words" aria-hidden="true"><span class="logo-top">Second Chance</span><span class="logo-sub">Goods Ltd</span></span></a>`;

/* ----------------------------------------------------------------- listing helpers */
export function priceParts(l: Listing, hidePrices: boolean): { main: Safe; sub: Safe | null } {
  if (hidePrices) return { main: h`<span class="price-hidden">See current price on eBay</span>`, sub: null };
  if (l.listingType === 'auction') {
    const bids = l.bidCount ?? 0;
    return {
      main: h`<span class="price-label">${bids > 0 ? 'Current bid' : 'Starting bid'}</span> ${formatMoney(l.pricePence, l.currency)}`,
      sub: h`${bids} ${bids === 1 ? 'bid' : 'bids'}${l.endTime ? h`, ends ${formatDateTime(l.endTime)}` : ''}`,
    };
  }
  return {
    main: h`${formatMoney(l.pricePence, l.currency)}`,
    sub: l.bestOffer ? h`or Best Offer` : null,
  };
}

export function productCard(l: Listing, ctx: RenderCtx, opts: { eager?: boolean } = {}): Safe {
  const hide = ctx.meta.stale && ctx.meta.mode === 'live';
  const p = priceParts(l, hide);
  const img = l.images[0];
  const isDemo = ctx.meta.mode === 'demo';
  return h`<article class="card">
  <div class="card-media">${img
    ? h`<img src="${isDemo ? img : ebayImage(img, 500)}" alt="" width="500" height="500" ${opts.eager ? raw('fetchpriority="high"') : raw('loading="lazy"')} decoding="async">`
    : h`<span class="card-noimg">No photo</span>`}
    ${isDemo ? h`<span class="demo-tag">Illustrative</span>` : ''}
    ${l.listingType === 'auction' ? h`<span class="auction-tag">Auction</span>` : ''}
  </div>
  <h3 class="card-title"><a href="${itemPath(l)}">${l.title}</a></h3>
  <p class="card-price">${p.main}${p.sub ? h`<span class="card-price-sub">${p.sub}</span>` : ''}</p>
  ${l.condition ? h`<p class="card-cond">${l.condition}</p>` : ''}
  <a class="card-ebay" href="${l.url}">${isDemo ? 'Open our eBay shop' : 'View on eBay'}<span class="visually-hidden">: ${l.title}</span>${icons.arrow}</a>
</article>`;
}

/* ----------------------------------------------------------------- page shell */
export interface PageOpts {
  title: string;
  description: string;
  canonicalPath?: string | null;
  noindex?: boolean;
  ogImage?: string;
  structuredData?: unknown[];
  main: Safe;
  bodyClass?: string;
}

const NAV_CATEGORIES = ['collectables', 'home-furniture', 'vintage-antiques', 'toys-games'];

export function page(ctx: RenderCtx, o: PageOpts): Response {
  const { meta, origin } = ctx;
  const inStock = new Set(ctx.stats.filter((s) => s.count > 0).map((s) => s.slug));
  const navCats = NAV_CATEGORIES.filter((c) => inStock.has(c)).map((c) => getCategory(c)!);
  const moreCats = SITE_CATEGORIES.filter((c) => inStock.has(c.slug) && !NAV_CATEGORIES.includes(c.slug));
  const robots = o.noindex || !ctx.indexable ? 'noindex, follow' : 'index, follow';
  const canonical = o.canonicalPath === null ? null : origin + (o.canonicalPath ?? ctx.path);
  const fullTitle = o.title.includes(BUSINESS.name) ? o.title : `${o.title} | ${BUSINESS.name}`;
  const ogImage = o.ogImage || `${origin}/assets/img/hero.webp`;
  const current = (href: string) => (ctx.path === href || (href !== '/' && ctx.path.startsWith(href + '/')) ? raw(' aria-current="page"') : '');
  const liveStale = meta.mode === 'live' && meta.stale && meta.snapshotId;

  const body = h`<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${o.description}">
<meta name="robots" content="${robots}">
${canonical ? h`<link rel="canonical" href="${canonical}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/source-serif-4.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/instrument-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_VERSION}">
<meta name="theme-color" content="#142E35">
<meta property="og:site_name" content="${BUSINESS.name}">
<meta property="og:type" content="website">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${o.description}">
${canonical ? h`<meta property="og:url" content="${canonical}">` : ''}
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
${(o.structuredData || []).map((d) => jsonLd(d))}
<script src="/assets/js/site.js?v=${ASSET_VERSION}" defer></script>
</head>
<body class="${o.bodyClass || ''}">
<a class="skip-link" href="#main">Skip to content</a>
${meta.mode === 'demo' ? h`<div class="notice notice-demo" role="note"><strong>Demo preview.</strong> Products, prices and photos on this site are illustrative and are not real stock. Nothing here is for sale.</div>` : ''}
${liveStale ? h`<div class="notice notice-stale" role="status">Prices are being refreshed from eBay. Check each eBay listing for the current price and availability.</div>` : ''}
<div class="announce"><p>Good things deserve a second chance.</p></div>
<header class="site-header">
  <div class="wrap header-bar">
    ${logo()}
    <form class="search" role="search" action="/shop" method="get">
      <label class="visually-hidden" for="site-search">Search the collection</label>
      ${icons.search}
      <input id="site-search" type="search" name="q" value="${ctx.searchQ || ''}" placeholder="Search for your next great find" autocomplete="off" enterkeyhint="search">
      <button class="visually-hidden" type="submit">Search</button>
    </form>
    <a class="ebay-link" href="${BUSINESS.ebayStoreUrl}">Our eBay shop${icons.arrow}</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="menu-open">${icons.menu}</span><span class="menu-close">${icons.close}</span><span class="menu-label">Menu</span></button>
  </div>
  <nav class="site-nav" id="site-nav" aria-label="Main">
    <ul class="wrap nav-list">
      <li><a href="/shop"${current('/shop')}>Shop all</a></li>
      ${navCats.map((c) => h`<li><a href="/category/${c.slug}"${current('/category/' + c.slug)}>${c.name}</a></li>`)}
      ${moreCats.map((c) => h`<li class="nav-extra"><a href="/category/${c.slug}"${current('/category/' + c.slug)}>${c.name}</a></li>`)}
      <li><a href="/about"${current('/about')}>About us</a></li>
      <li class="nav-extra"><a href="${BUSINESS.ebayStoreUrl}">Our eBay shop</a></li>
    </ul>
  </nav>
</header>
<main id="main" tabindex="-1">
${o.main}
</main>
<footer class="site-footer">
  <div class="wrap footer-top">
    ${logo('logo-footer')}
    <nav aria-label="Footer">
      <ul class="footer-links">
        <li><a href="/shop">Catalogue</a></li>
        <li><a href="/about">About us</a></li>
        <li><a href="${BUSINESS.ebayStoreUrl}">Shop on eBay</a></li>
        <li><a href="${BUSINESS.ebayContactUrl}">Contact us on eBay</a></li>
        <li><a href="/privacy">Privacy</a></li>
        <li><a href="/terms">Terms of use</a></li>
      </ul>
    </nav>
  </div>
  <div class="wrap footer-bottom">
    <p>All purchases are completed on eBay. Prices, delivery options and availability are confirmed on each eBay listing.</p>
    <p>${meta.mode === 'demo'
      ? 'Demo preview: catalogue data is illustrative.'
      : meta.lastSuccessAt
        ? h`Catalogue refreshed from eBay about every ${syncIntervalMinutes(ctx.env)} minutes. Last updated ${formatDateTime(meta.lastSuccessAt)}.`
        : 'Catalogue not yet synced from eBay.'}</p>
    <p>© ${new Date().getFullYear()} ${BUSINESS.legalName}. eBay is a trademark of eBay Inc.</p>
  </div>
</footer>
</body>
</html>`;

  return new Response(body.value, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=300',
      'x-scg-page': '1',
    },
  });
}

/** Breadcrumb trail + matching JSON-LD. */
export function breadcrumbs(ctx: RenderCtx, trail: { name: string; path: string }[]) {
  const html = h`<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail.map((t, i) =>
    i === trail.length - 1 ? h`<li><span aria-current="page">${t.name}</span></li>` : h`<li><a href="${t.path}">${t.name}</a></li>`)}</ol></nav>`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: ctx.origin + t.path })),
  };
  return { html, data };
}
