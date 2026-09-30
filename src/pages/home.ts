import { BUSINESS } from '../config';
import { getCategory, SITE_CATEGORIES } from '../categories';
import { ebayImage } from '../format';
import { h } from '../html';
import { icons, page, productCard, type RenderCtx } from '../ui';
import type { Catalogue } from '../catalogue';

export async function homePage(ctx: RenderCtx, cat: Catalogue): Promise<Response> {
  const featured = await cat.featured(4);
  const isDemo = ctx.meta.mode === 'demo';
  const statBySlug = new Map(ctx.stats.map((s) => [s.slug, s]));

  // Five picture tiles: the featured groups that have stock, topped up with the biggest other groups.
  const withStock = SITE_CATEGORIES.filter((c) => (statBySlug.get(c.slug)?.count || 0) > 0);
  const tiles = [
    ...withStock.filter((c) => c.featured),
    ...withStock.filter((c) => !c.featured).sort((a, b) => statBySlug.get(b.slug)!.count - statBySlug.get(a.slug)!.count),
  ].slice(0, 5);
  const others = withStock.filter((c) => !tiles.includes(c));

  const feedback = ctx.meta.sellerFeedbackPercent ? `${ctx.meta.sellerFeedbackPercent}%` : BUSINESS.verified.feedbackPercent;
  const hasStock = featured.length > 0;

  const main = h`
<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Pre-loved. Ready for what’s next.</p>
    <h1><span>Great finds.</span> <span>Second chances.</span></h1>
    <p class="lede">Discover furniture, collectables and everyday favourites worth finding again.</p>
    <p class="hero-actions"><a class="btn" href="/shop">Explore the collection${icons.arrow}</a></p>
    <p class="hero-note">Browse here. Buy on eBay.</p>
  </div>
  <div class="hero-media">
    <picture>
      <source media="(max-width: 760px)" srcset="/assets/img/hero-sm.webp">
      <img src="/assets/img/hero.webp" width="1032" height="812" alt="A wooden sideboard styled with a vintage radio, glass and ceramic vases, a brass lamp and a row of records" fetchpriority="high">
    </picture>
  </div>
</section>

<section class="assure" aria-label="Buying with confidence">
  <ul class="wrap assure-list">
    <li>${icons.star}<a href="${BUSINESS.ebayFeedbackUrl}">${feedback} positive eBay feedback</a></li>
    <li>${icons.tag}<span>${BUSINESS.verified.itemsSoldFloor} items sold on eBay</span></li>
    <li>${icons.bag}<span>Checkout on eBay</span></li>
  </ul>
</section>

${tiles.length ? h`<section class="wrap section" aria-labelledby="cats-h">
  <h2 id="cats-h" class="section-title">Find your kind of treasure</h2>
  <ul class="cat-tiles">
    ${tiles.map((c) => {
      const s = statBySlug.get(c.slug)!;
      const cover = isDemo ? c.demoCover || s.cover : s.cover ? ebayImage(s.cover, 500) : null;
      return h`<li><a class="cat-tile" href="/category/${c.slug}">
        <span class="cat-img">${cover ? h`<img src="${cover}" alt="" width="338" height="320" loading="lazy" decoding="async">` : ''}</span>
        <span class="cat-name">${c.name}</span></a></li>`;
    })}
  </ul>
  ${others.length ? h`<p class="more-cats"><span>Also in stock:</span> ${others.map((c) => h`<a href="/category/${c.slug}">${c.name}</a>`)}</p>` : ''}
</section>` : ''}

<section class="wrap section" aria-labelledby="feat-h">
  <div class="section-head">
    <h2 id="feat-h" class="section-title">A few things you might love</h2>
    ${hasStock ? h`<a class="text-link" href="/shop">Browse the full collection${icons.arrow}</a>` : ''}
  </div>
  ${isDemo ? h`<p class="section-sub">Illustrative products for this demo preview.</p>` : hasStock ? h`<p class="section-sub">Just listed on our eBay shop.</p>` : ''}
  ${hasStock
    ? h`<div class="grid grid-4">${featured.map((l, i) => productCard(l, ctx, { eager: i < 2 }))}</div>`
    : h`<div class="empty"><p>New stock is on its way to the website. In the meantime, everything we have is on our eBay shop.</p><p><a class="btn" href="${BUSINESS.ebayStoreUrl}">Visit our eBay shop${icons.arrow}</a></p></div>`}
</section>

<section class="about-band" aria-labelledby="about-h">
  <div class="wrap about-inner">
    <div class="about-copy">
      <p class="eyebrow eyebrow-light">The Second Chance way</p>
      <h2 id="about-h">More character. Less waste.</h2>
      <p>Giving useful, unusual and much-loved things a new home.</p>
      <p><a class="btn" href="/about">Meet Second Chance Goods${icons.arrow}</a></p>
    </div>
    <div class="about-media"><img src="/assets/img/about.webp" width="932" height="418" alt="Old natural history books, a trailing plant and a speckled stoneware jug on a wooden table" loading="lazy" decoding="async"></div>
  </div>
</section>`;

  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BUSINESS.legalName,
    url: ctx.origin + '/',
    logo: ctx.origin + '/assets/img/logo.svg',
    sameAs: [BUSINESS.ebayStoreUrl],
  };
  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BUSINESS.name,
    url: ctx.origin + '/',
    potentialAction: { '@type': 'SearchAction', target: `${ctx.origin}/shop?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };

  return page(ctx, {
    title: `${BUSINESS.name} | Pre-loved furniture, collectables and vintage finds`,
    description: 'Browse pre-loved furniture, collectables, vintage pieces and everyday favourites from Second Chance Goods Ltd, then buy securely on eBay.',
    canonicalPath: '/',
    structuredData: isDemo ? [] : [org, site],
    main,
    bodyClass: 'home',
  });
}

export { getCategory };
