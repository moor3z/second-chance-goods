/**
 * Local facts and FAQ, used by the Flintshire page, FAQ page, structured data and llms.txt.
 * Everything here is said publicly about the business: lines marked CHECK must be true before launch.
 */
import { BUSINESS } from './config';

export const LOCAL = {
  county: 'Flintshire',
  region: 'North Wales',
  /** ISO 3166-2 code for Flintshire. */
  isoRegion: 'GB-FLN',
  country: 'GB',
  /** Towns and areas named on the Flintshire page (buyers nearby who may want to collect). */
  towns: ['Mold', 'Flint', 'Buckley', 'Connah’s Quay', 'Holywell', 'Deeside', 'Shotton', 'Queensferry', 'Hawarden', 'Saltney', 'Broughton', 'Ewloe'],
  /** Wider areas we sell to (via eBay delivery, or collection if local). */
  areaServed: ['Flintshire', 'North Wales', 'Cheshire', 'Wirral', 'Chester', 'North West England', 'United Kingdom'],
  localCollection: true, // CHECK: local buyers can collect items
  collectionText: 'Local collection from Flintshire is available on many items; arrange it through eBay messages after buying, or check the listing.', // CHECK
  deliveryText: 'Delivery options and costs are shown on each eBay listing. Most smaller items are posted anywhere in the UK.', // CHECK
  sourceText: 'Our stock is recovered through professional house clearances carried out by Tidy Up Ltd, so items have been rescued rather than thrown away.', // CHECK
};

export interface Faq {
  q: string;
  a: string;
}

/** Plain question-and-answer pairs: shown on /faq, marked up as FAQPage, and listed in llms.txt. */
export const FAQS: Faq[] = [
  { q: 'What is Second Chance Goods?', a: `${BUSINESS.legalName} is a second-hand shop based in ${LOCAL.county}, ${LOCAL.region}. We sell pre-loved furniture, homeware, collectables, vintage pieces and everyday items through our eBay shop, and this website is our catalogue.` },
  { q: 'Where are you based?', a: `We are based in ${LOCAL.county}, North Wales, close to Chester and the Wirral. We sell to buyers across the UK through eBay.` }, // CHECK
  { q: 'How do I buy something?', a: 'Find the item on this website and tap “View on eBay”. You buy it on eBay, which handles payment, delivery and buyer protection.' },
  { q: 'Can I collect an item in Flintshire?', a: LOCAL.collectionText },
  { q: 'Do you deliver?', a: LOCAL.deliveryText + ' For large or bulky items we don’t offer delivery on, AnyVan’s furniture couriers can collect from us; their website calculator gives a delivery price.' },
  { q: 'Where does your stock come from?', a: LOCAL.sourceText },
  { q: 'How often do you add new items?', a: 'New finds are listed regularly, and this website updates automatically from our eBay shop about every 15 minutes.' },
  { q: 'Do you accept returns?', a: 'Returns are handled on eBay under eBay’s rules and the return policy shown on each listing.' },
  { q: 'Do you have discount codes?', a: 'When we run an eBay coupon, the code and the reduced price are shown on this website. Enter the code at eBay checkout.' },
  { q: 'Can I ask a question about an item?', a: 'Yes. Use “Ask us a question on eBay” on any item page, or message us through our eBay shop.' },
];

/** The business as structured data. Referenced from other pages by @id. */
export function storeData(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': origin + '/#store',
    name: BUSINESS.legalName,
    alternateName: BUSINESS.name,
    url: origin + '/',
    logo: origin + '/assets/img/logo.png',
    image: origin + '/assets/img/hero-lamps.webp',
    description: `Second-hand shop based in ${LOCAL.county}, ${LOCAL.region}, selling pre-loved furniture, homeware, collectables and vintage finds through eBay. ${LOCAL.sourceText}`,
    address: { '@type': 'PostalAddress', addressRegion: LOCAL.county, addressCountry: LOCAL.country },
    areaServed: LOCAL.areaServed.map((name) => ({ '@type': name === 'United Kingdom' ? 'Country' : 'AdministrativeArea', name })),
    knowsAbout: ['Second-hand furniture', 'Vintage collectables', 'Antiques', 'Pre-owned homeware', 'House clearance finds'],
    sameAs: [BUSINESS.ebayStoreUrl, BUSINESS.facebookUrl].filter(Boolean),
  };
}
