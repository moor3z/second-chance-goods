/**
 * Website display groups, mapped from eBay's category paths.
 * eBay returns PrimaryCategory.CategoryName as a colon-separated path,
 * e.g. "Home, Furniture & DIY:DIY Tools & Workshop Equipment:Power Tools".
 */
export interface SiteCategory {
  slug: string;
  name: string;
  description: string;
  /** Shown as a picture tile on the homepage when it has stock. */
  featured: boolean;
  demoCover?: string;
}

export const SITE_CATEGORIES: SiteCategory[] = [
  { slug: 'collectables', name: 'Collectables', featured: true, demoCover: '/assets/img/demo/cat-collectables.webp',
    description: 'Figures, memorabilia, advertising, militaria, coins, stamps and other collectable finds.' },
  { slug: 'vintage-antiques', name: 'Vintage & antiques', featured: true, demoCover: '/assets/img/demo/cat-vintage.webp',
    description: 'Antiques, art, pottery, ceramics and glass with some age and character.' },
  { slug: 'home-furniture', name: 'Home & furniture', featured: true, demoCover: '/assets/img/demo/cat-home.webp',
    description: 'Furniture, lighting, clocks, kitchenware, home décor, appliances and garden pieces.' },
  { slug: 'toys-games', name: 'Toys & games', featured: true, demoCover: '/assets/img/demo/cat-toys.webp',
    description: 'Vintage and modern toys, games, puzzles, diecast, dolls and bears.' },
  { slug: 'music-vinyl', name: 'Music & vinyl', featured: true, demoCover: '/assets/img/demo/cat-music.webp',
    description: 'Vinyl records, CDs, cassettes, music memorabilia and instruments.' },
  { slug: 'retro-tech', name: 'Retro tech & cameras', featured: false,
    description: 'Hi-fi, radios, TVs, cameras, computers, phones and video games.' },
  { slug: 'books-film', name: 'Books & films', featured: false,
    description: 'Books, comics, magazines, DVDs and other films and TV.' },
  { slug: 'tools-diy', name: 'Tools & DIY', featured: false,
    description: 'Hand and power tools, workshop equipment, office and vehicle parts.' },
  { slug: 'fashion-jewellery', name: 'Fashion & jewellery', featured: false,
    description: 'Clothes, shoes, bags, watches, jewellery and grooming.' },
  { slug: 'hobbies-sport', name: 'Hobbies, crafts & sport', featured: false,
    description: 'Craft supplies, sporting goods and sports memorabilia.' },
  { slug: 'other', name: 'Other finds', featured: false,
    description: 'Useful and unusual things that don’t fit anywhere else.' },
];

const BY_SLUG = new Map(SITE_CATEGORIES.map((c) => [c.slug, c]));
export const getCategory = (slug: string) => BY_SLUG.get(slug) || null;

/** Optional exact overrides by eBay category ID (leaf or any ancestor you know). */
const CATEGORY_ID_OVERRIDES: Record<string, string> = {};

const TOP_LEVEL: Record<string, string> = {
  'collectables': 'collectables',
  'coins': 'collectables',
  'stamps': 'collectables',
  'antiques': 'vintage-antiques',
  'art': 'vintage-antiques',
  'pottery, ceramics & glass': 'vintage-antiques',
  'pottery, porcelain & glass': 'vintage-antiques',
  'home, furniture & diy': 'home-furniture',
  'garden & patio': 'home-furniture',
  'toys & games': 'toys-games',
  'dolls & bears': 'toys-games',
  'music': 'music-vinyl',
  'musical instruments & dj equipment': 'music-vinyl',
  'musical instruments': 'music-vinyl',
  'sound & vision': 'retro-tech',
  'cameras & photography': 'retro-tech',
  'computers/tablets & networking': 'retro-tech',
  'mobile phones & communication': 'retro-tech',
  'video games & consoles': 'retro-tech',
  'books, comics & magazines': 'books-film',
  'books': 'books-film',
  'films & tv': 'books-film',
  'business, office & industrial': 'tools-diy',
  'vehicle parts & accessories': 'tools-diy',
  'clothes, shoes & accessories': 'fashion-jewellery',
  'jewellery & watches': 'fashion-jewellery',
  'health & beauty': 'fashion-jewellery',
  'crafts': 'hobbies-sport',
  'sporting goods': 'hobbies-sport',
  'sports memorabilia': 'hobbies-sport',
};

const SECOND_LEVEL: Record<string, string> = {
  'home, furniture & diy>diy tools & workshop equipment': 'tools-diy',
  'home, furniture & diy>diy materials': 'tools-diy',
  'collectables>tools & collectable hardware': 'collectables',
};

export function mapCategory(categoryId: string | null, categoryPath: string | null): string {
  if (categoryId && CATEGORY_ID_OVERRIDES[categoryId]) return CATEGORY_ID_OVERRIDES[categoryId];
  if (!categoryPath) return 'other';
  const parts = categoryPath.split(':').map((p) => p.trim().toLowerCase());
  const second = parts.length > 1 ? SECOND_LEVEL[`${parts[0]}>${parts[1]}`] : undefined;
  return second || TOP_LEVEL[parts[0]] || 'other';
}
