import { BUSINESS, dataMode, siteOrigin, type Env } from '../src/config';
import { getCatalogue } from '../src/catalogue';
import { SITE_CATEGORIES } from '../src/categories';
import { FAQS, LOCAL } from '../src/local';

// Plain-text summary for AI assistants and answer engines (llmstxt.org format).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = siteOrigin(env, request);
  let counts = new Map<string, number>();
  let total = 0;
  if (dataMode(env) === 'live') {
    try {
      const cat = getCatalogue(env);
      const [meta, stats] = await Promise.all([cat.meta(), cat.categoryStats()]);
      total = meta.itemCount;
      counts = new Map(stats.map((s) => [s.slug, s.count]));
    } catch {
      /* summary still useful without counts */
    }
  }
  const cats = SITE_CATEGORIES.filter((c) => (counts.get(c.slug) || 0) > 0 || !counts.size);
  const body = `# ${BUSINESS.legalName}

> ${BUSINESS.name} is a second-hand shop based in ${LOCAL.county}, ${LOCAL.region}, UK. It sells pre-loved furniture, homeware, collectables, vintage pieces and everyday items through its eBay shop. ${LOCAL.sourceText}

Key facts:
- Location: ${LOCAL.county}, ${LOCAL.region} (near Chester and the Wirral)
- How to buy: every item is sold on eBay (${BUSINESS.ebayStoreUrl}); this website is a catalogue that links to each eBay listing
- Collection: ${LOCAL.collectionText}
- Delivery: ${LOCAL.deliveryText}
- Stock: ${total ? `about ${total} items listed, ` : ''}updated automatically from eBay about every 15 minutes; prices and availability on eBay are authoritative
- Areas served: ${LOCAL.areaServed.join(', ')}

## Pages
- [Shop all](${origin}/shop): everything currently listed
- [Buying in ${LOCAL.county}](${origin}/flintshire): local collection and delivery
- [Questions and answers](${origin}/faq): how buying, collection, delivery and returns work
- [About us](${origin}/about): who we are and key facts

## Categories
${cats.map((c) => `- [${c.name}](${origin}/category/${c.slug}): ${c.description}`).join('\n')}

## Questions
${FAQS.map((f) => `- ${f.q} ${f.a}`).join('\n')}
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
