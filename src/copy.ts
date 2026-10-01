/**
 * All the wording on the homepage, header and footer, in one place.
 * Edit the text here; keep the quotes and commas. Lines marked CHECK are
 * claims about the business that should be true before the site goes live.
 */
export const COPY = {
  topBar: {
    text: 'Quality finds, carefully recovered by Tidy Up Ltd.', // CHECK
    url: 'https://tidyupltd.com',
    badges: ['Sustainable', 'Local', 'Trusted'],
  },
  header: {
    searchPlaceholder: 'Search for unique furniture, homeware, collectables and more…',
    ebayButton: 'Visit our eBay shop',
  },
  hero: {
    eyebrow: 'Pre-loved. Expertly sourced. A brighter tomorrow.',
    headline: ['Great finds.', 'Second chances.'],
    text: 'Carefully recovered from house clearances by Tidy Up Ltd and given a new home. Discover quality furniture, collectables and everyday treasures worth finding again.', // CHECK
    primary: 'Explore our collection',
    secondary: 'About our story',
    handwritten: 'Remarkable items. Real stories. Less waste.',
  },
  trust: [
    { icon: 'house', text: 'Sourced through professional house clearances by Tidy Up Ltd' }, // CHECK
    { icon: 'people', text: 'Trusted across the North West and North Wales' },
    { icon: 'leaf', text: 'A sustainable alternative to buying new' },
    { icon: 'calendar', text: 'New finds added regularly – no two the same' },
  ],
  why: {
    heading: 'Why buy from us?',
    tagline: 'Good things deserve a second chance.',
    cards: [
      { icon: 'shield', title: 'Trusted provenance', text: 'All items are recovered through professional house clearances by Tidy Up Ltd.' }, // CHECK
      { icon: 'leaf', title: 'Better for the planet', text: 'Giving quality items a second life helps reduce waste and supports a more sustainable future.' },
      { icon: 'gem', title: 'Carefully selected', text: 'We sort, clean and photograph every item, so you get quality pre-owned goods ready for their next chapter.' }, // CHECK
      { icon: 'sparkle', title: 'Unique, one-off finds', text: 'From mid-century furniture to retro collectables, our stock is always changing and full of unique pieces.' },
    ],
  },
  categories: { heading: 'Shop by category', link: 'Browse the full collection' },
  story: {
    eyebrow: 'The story behind our stock',
    headline: ['From house clearances', 'to new beginnings.'],
    text: 'Every item we sell is carefully recovered through professional house clearances by Tidy Up Ltd. Instead of going to waste, these quality pieces are cleaned, photographed and given a second chance to be loved again.', // CHECK
    button: 'Our story',
    tag: ['Rescued.', 'Rehomed.', 'A second chance.'],
  },
  latest: { heading: 'Latest finds', sub: 'Freshly added from recent house clearances.', link: 'View all on eBay' }, // CHECK sub
  cta: {
    heading: 'Explore our full collection on eBay',
    text: 'Hundreds of unique finds, with new items added regularly.',
    button: 'Visit our eBay shop',
    ticks: ['Secure checkout via eBay', 'eBay buyer protection', 'New items added regularly'],
  },
  footer: {
    tagline: 'Remarkable items. Real stories. Less waste.',
    partnerHeading: 'Proudly working with',
    partnerName: 'Tidy Up Ltd',
    partnerSub: 'House clearances',
    partnerText: 'Professional, reliable house clearances across Flintshire, North Wales and the wider North West.', // CHECK
    partnerUrl: 'https://tidyupltd.com',
    localHeading: 'We’re local',
    localText: 'Based in Flintshire, serving North Wales and the North West.', // CHECK
  },
  marketplace: {
    /** Text used by the private Marketplace lister. {title}, {condition} and {extra} are filled in for each item. */
    description: 'Condition: {condition}.{extra}\n\nCollection from Flintshire, or ask about delivery. Message me with any questions.\n\nMore pre-loved finds from Second Chance Goods.', // CHECK collection area
  },
  facebookPost: {
    /** Daily Page post. {count} and {link} are filled in. */
    intro: 'New in at Second Chance Goods – {count} fresh finds today:',
    outro: 'Browse everything: {link}',
  },
} as const;
