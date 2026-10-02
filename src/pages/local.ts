import { BUSINESS } from '../config';
import { FAQS, LOCAL } from '../local';
import { SITE_CATEGORIES } from '../categories';
import { h } from '../html';
import { breadcrumbs, icons, page, productCard, type RenderCtx } from '../ui';
import type { Catalogue } from '../catalogue';

export function faqData(ctx: RenderCtx) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: ctx.origin + '/faq',
    mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function faqPage(ctx: RenderCtx): Response {
  const crumbs = breadcrumbs(ctx, [{ name: 'Home', path: '/' }, { name: 'Questions', path: '/faq' }]);
  const main = h`
<div class="wrap page-head narrow">${crumbs.html}
  <h1 class="page-title">Questions and answers</h1>
  <p class="page-intro">Quick answers about buying from ${BUSINESS.name}, collection in ${LOCAL.county} and delivery.</p>
</div>
<div class="wrap prose faq">
  ${FAQS.map((f) => h`<section class="faq-item"><h2>${f.q}</h2><p>${f.a}</p></section>`)}
  <p class="actions"><a class="btn" href="/shop">Browse the collection${icons.arrow}</a> <a class="text-link" href="${BUSINESS.ebayContactUrl}">Ask us on eBay${icons.arrow}</a></p>
</div>`;
  return page(ctx, {
    title: `Questions | ${BUSINESS.name}, ${LOCAL.county}`,
    description: `How to buy from ${BUSINESS.name}: collection in ${LOCAL.county}, UK delivery through eBay, returns, discount codes and where our stock comes from.`,
    canonicalPath: '/faq',
    structuredData: [faqData(ctx), crumbs.data],
    main,
  });
}

export async function flintshirePage(ctx: RenderCtx, cat: Catalogue): Promise<Response> {
  const latest = await cat.featured(8);
  const stat = new Map(ctx.stats.map((s) => [s.slug, s.count]));
  const cats = SITE_CATEGORIES.filter((c) => (stat.get(c.slug) || 0) > 0);
  const crumbs = breadcrumbs(ctx, [{ name: 'Home', path: '/' }, { name: `Second-hand finds in ${LOCAL.county}`, path: '/flintshire' }]);
  const main = h`
<div class="wrap page-head">${crumbs.html}
  <h1 class="page-title">Second-hand furniture and finds in ${LOCAL.county}</h1>
  <p class="page-intro">${BUSINESS.name} is a ${LOCAL.county}-based second-hand shop. ${LOCAL.sourceText}</p>
</div>
<div class="wrap prose local-prose">
  <h2>Buy local, or have it delivered</h2>
  <p>Everything we sell is listed on our eBay shop and shown here. ${LOCAL.collectionText} ${LOCAL.deliveryText}</p>
  <p>Handy if you’re in ${LOCAL.towns.slice(0, -1).join(', ')} or ${LOCAL.towns[LOCAL.towns.length - 1]}, or nearby in Chester, the Wirral and the rest of North Wales.</p>
  <h2>What we sell</h2>
  <ul class="local-cats">${cats.map((c) => h`<li><a href="/category/${c.slug}">${c.name}</a> <span>${c.description}</span></li>`)}</ul>
</div>
${latest.length ? h`<section class="wrap section" aria-labelledby="local-latest-h">
  <div class="section-head"><h2 id="local-latest-h" class="section-title">Latest finds</h2><a class="text-link" href="/shop">See everything${icons.arrow}</a></div>
  <div class="grid grid-4">${latest.map((l) => productCard(l, ctx))}</div>
</section>` : ''}
<div class="wrap prose local-prose">
  <p class="actions"><a class="btn" href="/shop">Browse the collection${icons.arrow}</a> <a class="text-link" href="/faq">Questions about collection and delivery${icons.arrow}</a></p>
</div>`;
  const place = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Second-hand furniture and finds in ${LOCAL.county}`,
    url: ctx.origin + '/flintshire',
    about: { '@type': 'Place', name: `${LOCAL.county}, Wales`, address: { '@type': 'PostalAddress', addressRegion: LOCAL.county, addressCountry: LOCAL.country } },
    isPartOf: { '@id': ctx.origin + '/#store' },
  };
  return page(ctx, {
    title: `Second-hand furniture and collectables in ${LOCAL.county}`,
    description: `Pre-loved furniture and collectables from a ${LOCAL.county} second-hand shop. Collect locally near ${LOCAL.towns.slice(0, 3).join(', ')} or buy with UK delivery on eBay.`,
    canonicalPath: '/flintshire',
    structuredData: [place, crumbs.data],
    main,
  });
}
