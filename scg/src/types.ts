export type ListingType = 'fixed' | 'auction';

/** One active eBay listing, normalised for the catalogue. Prices are in minor units (pence). */
export interface Listing {
  itemId: string;
  title: string;
  listingType: ListingType;
  /** Fixed price, or the current bid for auctions. */
  pricePence: number;
  currency: string;
  /** Auction "Buy it now" price, if the seller set one. */
  buyItNowPence: number | null;
  bidCount: number | null;
  bestOffer: boolean;
  condition: string | null;
  ebayCategoryId: string | null;
  ebayCategoryPath: string | null;
  siteCategory: string;
  images: string[];
  url: string;
  quantityAvailable: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface CatalogueMeta {
  mode: 'live' | 'demo';
  snapshotId: string | null;
  lastSuccessAt: string | null;
  itemCount: number;
  /** True when the last good sync is older than the permitted display age. */
  stale: boolean;
  sellerFeedbackPercent: string | null;
  /** Raw JSON of coupons synced from eBay, if any. */
  couponsJson: string | null;
}

export type SortKey = 'newest' | 'price-asc' | 'price-desc';

export interface CatalogueQuery {
  q: string;
  category: string;
  sort: SortKey;
  page: number;
  pageSize: number;
}

export interface CategoryStat {
  slug: string;
  count: number;
  cover: string | null;
}
