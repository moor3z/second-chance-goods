/**
 * eBay access: OAuth user-token refresh and Trading API (XML) calls.
 * GetSellerList returns every listing the authorised seller has, however it was created
 * (eBay website, app, bulk tools), which the Inventory API does not.
 */
import { XMLParser } from 'fast-xml-parser';
import { mapCategory } from '../../src/categories';
import type { Listing } from '../../src/types';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  oauthUrl: string;
  tradingUrl: string;
  siteId: string;
  compatLevel: string;
  pageSize: number;
  endWindowDays: number;
  useOutputSelector: boolean;
  scopes: string;
}

export type EbayErrorKind = 'auth' | 'rate_limit' | 'transient' | 'api' | 'invalid';

export class EbayError extends Error {
  constructor(message: string, readonly kind: EbayErrorKind, readonly code?: string) {
    super(message);
    this.name = 'EbayError';
  }
}

/* ---------------------------------------------------------------- retries */
export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry transient failures with exponential backoff. Auth, rate-limit and API errors are not retried. */
export async function withRetry<T>(fn: () => Promise<T>, sleep: Sleep, attempts = 3, baseMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = err instanceof EbayError ? err.kind === 'transient' : err instanceof TypeError; // TypeError = network failure
      if (!transient || i === attempts - 1) throw err;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw lastErr;
}

function httpError(status: number, context: string): EbayError {
  if (status === 429) return new EbayError(`${context}: rate limited (HTTP 429)`, 'rate_limit');
  if (status === 401 || status === 403) return new EbayError(`${context}: not authorised (HTTP ${status})`, 'auth');
  if (status >= 500) return new EbayError(`${context}: eBay server error (HTTP ${status})`, 'transient');
  return new EbayError(`${context}: unexpected HTTP ${status}`, 'api');
}

/* ---------------------------------------------------------------- OAuth */
export async function getAccessToken(cfg: EbayConfig, fetchFn: FetchFn): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refreshToken, scope: cfg.scopes });
  const res = await fetchFn(cfg.oauthUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + btoa(`${cfg.clientId}:${cfg.clientSecret}`),
    },
    body: body.toString(),
  });
  if (!res.ok) {
    let code = '';
    try {
      code = String(((await res.json()) as { error?: string }).error || '');
    } catch {
      /* not JSON */
    }
    if (code === 'invalid_grant') {
      throw new EbayError('eBay rejected the refresh token (expired or revoked). Re-run the eBay authorisation step.', 'auth', code);
    }
    if (code === 'invalid_client') throw new EbayError('eBay rejected the app credentials (client ID/secret).', 'auth', code);
    throw httpError(res.status, 'Token refresh');
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new EbayError('Token refresh returned no access token', 'api');
  return json.access_token;
}

/* ---------------------------------------------------------------- Trading API */
const ARRAY_PATHS = new Set([
  'GetSellerListResponse.ItemArray.Item',
  'GetSellerListResponse.ItemArray.Item.PictureDetails.PictureURL',
  'GetSellerListResponse.Errors',
  'GetUserResponse.Errors',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false, // keep ItemIDs and prices as exact strings
  parseAttributeValue: false,
  trimValues: true,
  isArray: (_name, jpath) => ARRAY_PATHS.has(String(jpath)),
});

// Trading API error codes that mean the access token is bad or expired.
const AUTH_ERROR_CODES = new Set(['931', '932', '21916984', '21917053']);
const RATE_LIMIT_CODES = new Set(['518']);
const TRANSIENT_CODES = new Set(['10007']);

type XmlNode = Record<string, any>;

export async function tradingCall(cfg: EbayConfig, fetchFn: FetchFn, token: string, callName: string, bodyXml: string): Promise<XmlNode> {
  const res = await fetchFn(cfg.tradingUrl, {
    method: 'POST',
    headers: {
      'content-type': 'text/xml; charset=utf-8',
      'x-ebay-api-siteid': cfg.siteId,
      'x-ebay-api-compatibility-level': cfg.compatLevel,
      'x-ebay-api-call-name': callName,
      'x-ebay-api-iaf-token': token,
    },
    body: `<?xml version="1.0" encoding="utf-8"?>\n<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">${bodyXml}</${callName}Request>`,
  });
  if (!res.ok) throw httpError(res.status, callName);
  const text = await res.text();
  let root: XmlNode | undefined;
  try {
    root = parser.parse(text)?.[`${callName}Response`];
  } catch {
    root = undefined;
  }
  if (!root) throw new EbayError(`${callName}: response was not valid Trading API XML`, 'transient');
  const errors = ((root.Errors as XmlNode[]) || []).filter((e) => e.SeverityCode !== 'Warning');
  if (root.Ack === 'Failure' || root.Ack === 'PartialFailure' || errors.length) {
    const first = errors[0] || {};
    const code = String(first.ErrorCode || '');
    const msg = `${callName} failed: ${first.ShortMessage || 'unknown error'}${code ? ` (code ${code})` : ''}`;
    if (AUTH_ERROR_CODES.has(code)) throw new EbayError(msg, 'auth', code);
    if (RATE_LIMIT_CODES.has(code)) throw new EbayError(msg, 'rate_limit', code);
    if (TRANSIENT_CODES.has(code)) throw new EbayError(msg, 'transient', code);
    throw new EbayError(msg, 'api', code);
  }
  return root;
}

const OUTPUT_SELECTORS = [
  'Ack', 'Errors', 'HasMoreItems', 'PageNumber', 'PaginationResult', 'ReturnedItemCountActual',
  'ItemArray.Item.ItemID', 'ItemArray.Item.Title', 'ItemArray.Item.ListingType', 'ItemArray.Item.Quantity',
  'ItemArray.Item.SellingStatus', 'ItemArray.Item.BuyItNowPrice', 'ItemArray.Item.StartPrice',
  'ItemArray.Item.BestOfferDetails', 'ItemArray.Item.ConditionDisplayName', 'ItemArray.Item.PrimaryCategory',
  'ItemArray.Item.PictureDetails', 'ItemArray.Item.ListingDetails', 'ItemArray.Item.Currency', 'ItemArray.Item.Site',
];

export interface SellerListPage {
  items: XmlNode[];
  totalEntries: number;
  totalPages: number;
  pageNumber: number;
}

export function sellerListBody(cfg: EbayConfig, page: number, endFrom: Date, endTo: Date): string {
  return [
    '<ErrorLanguage>en_GB</ErrorLanguage>',
    '<WarningLevel>High</WarningLevel>',
    '<DetailLevel>ReturnAll</DetailLevel>',
    `<EndTimeFrom>${endFrom.toISOString()}</EndTimeFrom>`,
    `<EndTimeTo>${endTo.toISOString()}</EndTimeTo>`,
    '<IncludeWatchCount>false</IncludeWatchCount>',
    `<Pagination><EntriesPerPage>${cfg.pageSize}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>`,
    ...(cfg.useOutputSelector ? OUTPUT_SELECTORS.map((s) => `<OutputSelector>${s}</OutputSelector>`) : []),
  ].join('');
}

export async function getSellerListPage(cfg: EbayConfig, fetchFn: FetchFn, token: string, page: number, endFrom: Date, endTo: Date): Promise<SellerListPage> {
  const root = await tradingCall(cfg, fetchFn, token, 'GetSellerList', sellerListBody(cfg, page, endFrom, endTo));
  const pr = root.PaginationResult;
  const totalEntries = Number(pr?.TotalNumberOfEntries);
  const totalPages = Number(pr?.TotalNumberOfPages);
  if (!Number.isInteger(totalEntries) || !Number.isInteger(totalPages) || totalEntries < 0 || totalPages < 0) {
    throw new EbayError('GetSellerList response had no usable PaginationResult', 'invalid');
  }
  return { items: (root.ItemArray?.Item as XmlNode[]) || [], totalEntries, totalPages, pageNumber: page };
}

/** Seller's positive feedback percentage, e.g. "99.8". Optional: failures are ignored by the caller. */
export async function getFeedbackPercent(cfg: EbayConfig, fetchFn: FetchFn, token: string): Promise<string | null> {
  const root = await tradingCall(cfg, fetchFn, token, 'GetUser', '<DetailLevel>ReturnAll</DetailLevel>');
  const pct = Number(root.User?.PositiveFeedbackPercent);
  return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? String(Math.round(pct * 10) / 10) : null;
}

/* ---------------------------------------------------------------- normalisation */
const text = (v: unknown): string => (v && typeof v === 'object' ? String((v as XmlNode)['#text'] ?? '') : String(v ?? '')).trim();
const money = (v: unknown): { pence: number; currency: string | null } | null => {
  const n = Number(text(v));
  if (!text(v) || !Number.isFinite(n) || n < 0) return null;
  const cur = v && typeof v === 'object' ? (v as XmlNode)['@_currencyID'] : null;
  return { pence: Math.round(n * 100), currency: cur ? String(cur) : null };
};
const int = (v: unknown): number | null => {
  const n = Number(text(v));
  return text(v) && Number.isFinite(n) ? Math.trunc(n) : null;
};

export type SkipReason = 'not_active' | 'unsupported_type' | 'sold_out' | 'missing_fields';

export function normaliseItem(raw: XmlNode): { listing: Listing } | { skip: SkipReason; itemId: string } {
  const itemId = text(raw.ItemID);
  const title = text(raw.Title);
  const ss = raw.SellingStatus || {};
  if (!itemId || !/^\d{6,20}$/.test(itemId) || !title) return { skip: 'missing_fields', itemId };
  if (text(ss.ListingStatus) !== 'Active') return { skip: 'not_active', itemId };

  const type = text(raw.ListingType);
  const listingType = type === 'Chinese' ? 'auction' : type === 'FixedPriceItem' || type === 'StoresFixedPrice' ? 'fixed' : null;
  if (!listingType) return { skip: 'unsupported_type', itemId };

  const qty = int(raw.Quantity);
  const sold = int(ss.QuantitySold) ?? 0;
  const available = qty === null ? null : qty - sold;
  if (available !== null && available <= 0) return { skip: 'sold_out', itemId };

  const price = money(ss.CurrentPrice) || money(raw.StartPrice);
  if (!price) return { skip: 'missing_fields', itemId };
  const currency = price.currency || text(raw.Currency) || 'GBP';
  const bin = listingType === 'auction' ? money(raw.BuyItNowPrice) : null;

  const pics = ([] as unknown[]).concat(raw.PictureDetails?.PictureURL || []).map(text);
  const gallery = text(raw.PictureDetails?.GalleryURL);
  const images = [...pics, ...(pics.length ? [] : [gallery])].filter((u) => /^https:\/\//i.test(u)).slice(0, 24);

  const viewUrl = text(raw.ListingDetails?.ViewItemURL);
  const url = /^https?:\/\/([a-z0-9-]+\.)*ebay\.[a-z.]+\//i.test(viewUrl) ? viewUrl.replace(/^http:/i, 'https:') : `https://www.ebay.co.uk/itm/${itemId}`;

  const categoryId = text(raw.PrimaryCategory?.CategoryID) || null;
  const categoryPath = text(raw.PrimaryCategory?.CategoryName) || null;

  return {
    listing: {
      itemId,
      title,
      listingType,
      pricePence: price.pence,
      currency,
      buyItNowPence: bin && bin.pence > 0 ? bin.pence : null,
      bidCount: listingType === 'auction' ? int(ss.BidCount) ?? 0 : null,
      bestOffer: text(raw.BestOfferDetails?.BestOfferEnabled) === 'true',
      condition: text(raw.ConditionDisplayName) || null,
      ebayCategoryId: categoryId,
      ebayCategoryPath: categoryPath,
      siteCategory: mapCategory(categoryId, categoryPath),
      images,
      url,
      quantityAvailable: available,
      startTime: text(raw.ListingDetails?.StartTime) || null,
      endTime: text(raw.ListingDetails?.EndTime) || null,
    },
  };
}
