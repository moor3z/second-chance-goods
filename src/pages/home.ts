import { BUSINESS } from '../config';
import { COPY } from '../copy';
import { FAQS, LOCAL, storeData } from '../local';
import { formatDateTime, itemPath } from '../format';
import { SITE_CATEGORIES } from '../categories';
import { h, raw, type Safe } from '../html';
import { icons, page, productCard, type RenderCtx } from '../ui';
import type { Catalogue } from '../catalogue';

const ARROW = raw('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>');

/** Previous/next buttons for a sideways-scrolling row on small screens (hidden on desktop and without JavaScript). */
const scrollButtons = (what: string) => h`<div class="scroll-btns" data-scroll-btns>
  <button class="scroll-btn scroll-prev" type="button" aria-label="Show previous ${what}" aria-disabled="true">${ARROW}</button>
  <button class="scroll-btn scroll-next" type="button" aria-label="Show more ${what}">${ARROW}</button>
</div>`;

const ICON: Record<string, Safe> = {
  house: icons.house, people: icons.people, leaf: icons.leaf, calendar: icons.calendar,
  shield: icons.shield, gem: icons.gem, sparkle: icons.sparkle,
};

export async function homePage(ctx: RenderCtx, cat: Catalogue): Promise<Response> {
  const latest = await cat.featured(6);
  const isDemo = ctx.meta.mode === 'demo';
  const statBySlug = new Map(ctx.stats.map((s) => [s.slug, s]));
  const withStock = SITE_CATEGORIES.filter((c) => (statBySlug.get(c.slug)?.count || 0) > 0);
  const hasStock = latest.length > 0;

  const main = h`
<section class="hero hero-v2">
 <div class="wrap hero-inner">
  <div class="hero-copy">
    <h1><span class="eyebrow">${COPY.hero.eyebrow}</span>${COPY.hero.headline.map((l) => h`<span>${l}</span> `)}</h1>
    <p class="lede">${COPY.hero.text}</p>
    <p class="hero-actions"><a class="btn" href="/shop">${COPY.hero.primary}${icons.arrow}</a> <a class="btn btn-outline" href="/about">${COPY.hero.secondary}</a></p>
    <p class="handwritten">${COPY.hero.handwritten}<span class="hand-underline" aria-hidden="true"></span></p>
  </div>
  <div class="hero-media">
    <picture>
      <source media="(max-width: 760px)" srcset="/assets/img/hero-lamps-sm.webp">
      <img src="/assets/img/hero-lamps.webp" width="1800" height="1200" alt="Two Tiffany-style stained-glass lamps on a polished sideboard with a vintage clock, brass urns, a railway plate and a Sony record player" fetchpriority="high">
    </picture>
  </div>
 </div>
</section>

<section class="assure" aria-label="Why people trust us">
  <ul class="wrap assure-list assure-4">
    ${COPY.trust.map((t) => h`<li>${ICON[t.icon]}<span>${t.text}</span></li>`)}
  </ul>
</section>

<section class="wrap section" aria-labelledby="why-h">
  <div class="section-head">
    <h2 id="why-h" class="section-title">${COPY.why.heading}</h2>
    <p class="section-tag">${COPY.why.tagline}<span class="tag-rule" aria-hidden="true"></span></p>
  </div>
  <ul class="why-grid">
    ${COPY.why.cards.map((c) => h`<li class="why-card">${ICON[c.icon]}<h3>${c.title}</h3><p>${c.text}</p></li>`)}
  </ul>
</section>

${withStock.length ? h`<section class="wrap section" aria-labelledby="cats-h">
  <div class="cat-head">
    <h2 id="cats-h" class="section-title">${COPY.categories.heading}</h2>
    <a class="text-link cat-all" href="/shop">${COPY.categories.link}${icons.arrow}</a>
    ${scrollButtons('categories')}
  </div>
  <div class="cat-scroller" data-scroller><ul class="cat-tiles cat-tiles-6">
    ${withStock.map((c) => h`<li><a class="cat-tile" href="/category/${c.slug}">
        <span class="cat-img"><img src="${c.cover}" alt="${c.name}: ${c.coverAlt}" width="640" height="640" loading="lazy" decoding="async"></span>
        <span class="cat-name">${c.name}${icons.arrow}</span></a></li>`)}
    ${withStock.length % 6 !== 0 ? h`<li><a class="cat-tile cat-tile-all" href="/shop">
        <span class="cat-img cat-img-all">${icons.search}<strong>See everything</strong>${ctx.meta.itemCount ? h`<small>${ctx.meta.itemCount} items in stock</small>` : ''}</span>
        <span class="cat-name">Shop all${icons.arrow}</span></a></li>` : ''}
  </ul></div>
</section>` : ''}

<section class="about-band story-band" aria-labelledby="story-h">
  <div class="wrap about-inner">
    <div class="about-copy">
      <p class="eyebrow eyebrow-light">${COPY.story.eyebrow}</p>
      <h2 id="story-h">${COPY.story.headline.map((l) => h`<span>${l}</span> `)}</h2>
      <p>${COPY.story.text}</p>
      <p><a class="btn" href="/about">${COPY.story.button}${icons.arrow}</a></p>
    </div>
    <div class="about-media story-media">
      <picture>
        <source media="(max-width: 860px)" srcset="/assets/img/story-register-sm.webp">
        <img src="/assets/img/story-register.webp" width="1600" height="1000" alt="A worn brass vintage cash register with ivory number keys on a wooden counter" loading="lazy" decoding="async">
      </picture>
    </div>
    <div class="story-tag" aria-hidden="true">${COPY.story.tag.map((l) => h`<span>${l}</span>`)}</div>
  </div>
</section>

<section class="bulky-band" aria-labelledby="bulky-h">
  <div class="wrap bulky-inner">
    <div class="bulky-icon">${icons.van}</div>
    <div class="bulky-copy">
      <h2 id="bulky-h">${COPY.bulky.heading}</h2>
      <p>${COPY.bulky.text}</p>
    </div>
    <p class="bulky-action"><a class="btn" href="${COPY.bulky.url}" rel="noopener">${COPY.bulky.link}${icons.arrow}</a></p>
  </div>
</section>

<section class="wrap section" aria-labelledby="latest-h">
  <div class="section-head">
    <div class="section-head-left"><h2 id="latest-h" class="section-title">${COPY.latest.heading}</h2>${hasStock && !isDemo ? h`<p class="section-sub">${COPY.latest.sub}</p>` : isDemo ? h`<p class="section-sub">Illustrative products for this demo preview.</p>` : ''}</div>
    ${hasStock ? h`<a class="text-link" href="${BUSINESS.ebayStoreUrl}">${COPY.latest.link}${icons.arrow}</a>` : ''}
  </div>
  ${!isDemo && ctx.meta.itemCount && ctx.meta.lastSuccessAt ? h`<p class="stock-line">${ctx.meta.itemCount} items in stock · updated from eBay ${formatDateTime(ctx.meta.lastSuccessAt)}</p>` : ''}
  ${hasStock
    ? h`<div class="grid grid-6 latest-grid">${latest.map((l, i) => productCard(l, ctx, { eager: i < 2 }))}</div>`
    : h`<div class="empty"><p>New stock is on its way to the website. In the meantime, everything we have is on our eBay shop.</p><p><a class="btn" href="${BUSINESS.ebayStoreUrl}">Visit our eBay shop${icons.arrow}</a></p></div>`}
</section>

<section class="local-strip" aria-labelledby="local-h">
  <div class="wrap local-inner">
    ${icons.pin}
    <div>
      <h2 id="local-h">${COPY.local.heading}</h2>
      <p>${COPY.local.text} Near ${LOCAL.towns.slice(0, 6).join(', ')} or ${LOCAL.towns[6]}? <a href="/flintshire">${COPY.local.link}${icons.arrow}</a></p>
    </div>
  </div>
</section>

<section class="wrap section" aria-labelledby="qa-h">
  <div class="section-head">
    <h2 id="qa-h" class="section-title">${COPY.quickAnswers.heading}</h2>
    <a class="text-link" href="/faq">${COPY.quickAnswers.link}${icons.arrow}</a>
  </div>
  <dl class="qa-grid">${FAQS.filter((f) => ['How do I buy something?', 'Can I collect an item in Flintshire?', 'Where does your stock come from?', 'Do you deliver?'].includes(f.q)).map((f) => h`<div><dt>${f.q}</dt><dd>${f.a}</dd></div>`)}</dl>
</section>

<section class="cta-band" aria-labelledby="cta-h">
  <div class="wrap cta-inner">
    <div class="cta-copy">
      <h2 id="cta-h">${COPY.cta.heading}</h2>
      <p>${COPY.cta.text}</p>
    </div>
    <p class="cta-action"><a class="btn" href="${BUSINESS.ebayStoreUrl}">${COPY.cta.button}${icons.arrow}</a></p>
    <ul class="cta-ticks">${COPY.cta.ticks.map((t) => h`<li>${icons.check}${t}</li>`)}</ul>
  </div>
</section>`;

  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BUSINESS.name,
    url: ctx.origin + '/',
    publisher: { '@id': ctx.origin + '/#store' },
    inLanguage: 'en-GB',
    potentialAction: { '@type': 'SearchAction', target: `${ctx.origin}/shop?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };

  return page(ctx, {
    title: `Second-hand furniture & vintage finds in ${LOCAL.county} | ${BUSINESS.name}`,
    description: `Pre-loved furniture, collectables and vintage finds from a ${LOCAL.county} second-hand shop, rescued from house clearances. Browse here and buy on eBay.`,
    canonicalPath: '/',
    structuredData: isDemo
      ? []
      : [
          storeData(ctx.origin),
          site,
          ...(latest.length
            ? [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Latest finds', itemListElement: latest.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.title, url: ctx.origin + itemPath(l) })) }]
            : []),
        ],
    main,
    bodyClass: 'home',
  });
}
