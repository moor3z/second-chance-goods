/** A fake eBay: OAuth token endpoint + Trading API GetSellerList/GetUser, with fault injection. */
export interface MockItem {
  id: string; title: string; price: string; type?: 'FixedPriceItem' | 'Chinese' | 'StoresFixedPrice' | 'AdType';
  status?: 'Active' | 'Completed' | 'Ended'; qty?: number; sold?: number; bids?: number; bin?: string;
  category?: string; categoryId?: string; pictures?: string[]; condition?: string; bestOffer?: boolean; start?: string;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function itemXml(i: MockItem): string {
  return `<Item><ItemID>${i.id}</ItemID><Title>${esc(i.title)}</Title><ListingType>${i.type || 'FixedPriceItem'}</ListingType>
<Quantity>${i.qty ?? 1}</Quantity><Currency>GBP</Currency><Site>UK</Site>
<SellingStatus><CurrentPrice currencyID="GBP">${i.price}</CurrentPrice><QuantitySold>${i.sold ?? 0}</QuantitySold><BidCount>${i.bids ?? 0}</BidCount><ListingStatus>${i.status || 'Active'}</ListingStatus></SellingStatus>
${i.bin ? `<BuyItNowPrice currencyID="GBP">${i.bin}</BuyItNowPrice>` : ''}
<BestOfferDetails><BestOfferEnabled>${i.bestOffer ? 'true' : 'false'}</BestOfferEnabled></BestOfferDetails>
${i.condition ? `<ConditionDisplayName>${esc(i.condition)}</ConditionDisplayName>` : ''}
<PrimaryCategory><CategoryID>${i.categoryId || '1'}</CategoryID><CategoryName>${esc(i.category || 'Collectables:Other Collectable Items')}</CategoryName></PrimaryCategory>
<PictureDetails>${(i.pictures ?? [`https://i.ebayimg.com/images/g/${i.id}/s-l1600.jpg`]).map((p) => `<PictureURL>${esc(p)}</PictureURL>`).join('')}</PictureDetails>
<ListingDetails><StartTime>${i.start || '2026-09-01T10:00:00.000Z'}</StartTime><EndTime>2026-10-15T10:00:00.000Z</EndTime><ViewItemURL>https://www.ebay.co.uk/itm/${i.id}</ViewItemURL></ListingDetails></Item>`;
}

export interface MockOptions {
  items: MockItem[];
  pageSize?: number;
  /** Return an HTTP error for these page numbers (every attempt). */
  failPages?: number[];
  /** Fail this page transiently the first N times, then succeed. */
  flakyPage?: { page: number; times: number };
  /** Change the reported total on this page (simulates listings added mid-sync). */
  shiftTotalOnPage?: number;
  /** Report a total that doesn't match the items delivered. */
  lieAboutTotal?: number;
  tokenError?: 'invalid_grant' | 'http500';
  /** First Trading call returns an expired-token error. */
  expireFirstToken?: boolean;
  rateLimit?: boolean;
  /** Running coded coupons returned by the mock Marketing API. */
  coupons?: { code: string; percent?: number; amountOff?: number; maxOff?: number; minAmount?: number; all?: boolean; listingIds?: string[]; type?: 'PUBLIC_SINGLE_SELLER_COUPON' | 'PRIVATE_SINGLE_SELLER_COUPON'; endDate?: string }[];
  /** Simulate a token without the marketing scope. */
  marketingForbidden?: boolean;
}

export function mockEbay(opts: MockOptions) {
  const calls: { url: string; callName?: string; page?: number; token?: string; body?: string }[] = [];
  const flaky = { ...(opts.flakyPage || { page: -1, times: 0 }) };
  let tokenCount = 0;
  let expiredOnce = false;
  const pageSize = opts.pageSize || 2;

  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const body = String(init?.body || '');
    if (url.includes('/oauth2/token')) {
      calls.push({ url, body });
      if (opts.tokenError === 'invalid_grant') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      if (opts.tokenError === 'http500') return new Response('oops', { status: 500 });
      tokenCount++;
      return Response.json({ access_token: `v^1.1#i^1#TESTTOKEN${tokenCount}xxxxxxxxxxxxxxxx`, expires_in: 7200 });
    }
    if (url.includes('/sell/marketing/v1/')) {
      calls.push({ url });
      if (opts.marketingForbidden) return new Response('{"errors":[{"errorId":1100,"message":"Access denied"}]}', { status: 403 });
      const cs = opts.coupons || [];
      if (url.includes('/promotion?')) {
        return Response.json({ total: cs.length, promotions: cs.map((c, i) => ({ promotionId: `p${i}`, promotionType: 'CODED_COUPON', promotionStatus: 'RUNNING', promotionHref: `https://api.ebay.com/sell/marketing/v1/item_promotion/p${i}@EBAY_GB` })) });
      }
      const m = /item_promotion\/p(\d+)|promotion\/p(\d+)@EBAY_GB\/get_listing_set/.exec(url);
      const c = cs[Number(m?.[1] ?? m?.[2])];
      if (!c) return new Response('{}', { status: 404 });
      if (url.includes('get_listing_set')) return Response.json({ total: (c.listingIds || []).length, listings: (c.listingIds || []).map((id) => ({ listingId: id })) });
      return Response.json({
        name: `Coupon ${c.code}`, promotionStatus: 'RUNNING', promotionType: 'CODED_COUPON', startDate: '2026-09-01T00:00:00.000Z', endDate: c.endDate ?? '2026-10-31T22:59:59.000Z',
        couponConfiguration: { couponCode: c.code, couponType: c.type || 'PUBLIC_SINGLE_SELLER_COUPON', maxCouponRedemptionPerUser: 1 },
        inventoryCriterion: c.all ? { inventoryCriterionType: 'INVENTORY_ANY' } : { inventoryCriterionType: 'INVENTORY_BY_RULE' },
        discountRules: [{ discountBenefit: c.percent ? { percentageOffOrder: String(c.percent) } : { amountOffOrder: { value: String(c.amountOff), currency: 'GBP' } },
          discountSpecification: c.minAmount ? { minAmount: { value: String(c.minAmount), currency: 'GBP' } } : {}, ...(c.maxOff ? { maxDiscountAmount: { value: String(c.maxOff), currency: 'GBP' } } : {}) }],
      });
    }
    const headers = new Headers(init?.headers);
    const callName = headers.get('x-ebay-api-call-name') || '';
    const token = headers.get('x-ebay-api-iaf-token') || '';
    const page = Number(/<PageNumber>(\d+)<\/PageNumber>/.exec(body)?.[1] || 0);
    calls.push({ url, callName, page, token, body });
    if (opts.rateLimit) return new Response('', { status: 429 });
    if (opts.expireFirstToken && !expiredOnce) {
      expiredOnce = true;
      return xml(callName, `<Ack>Failure</Ack><Errors><ShortMessage>Auth token is hard expired.</ShortMessage><ErrorCode>932</ErrorCode><SeverityCode>Error</SeverityCode></Errors>`);
    }
    if (callName === 'GetUser') return xml('GetUser', '<Ack>Success</Ack><User><PositiveFeedbackPercent>99.8</PositiveFeedbackPercent></User>');
    if (opts.failPages?.includes(page)) return new Response('bad gateway', { status: 502 });
    if (flaky.page === page && flaky.times > 0) {
      flaky.times--;
      return new Response('unavailable', { status: 503 });
    }
    const total = opts.lieAboutTotal ?? opts.items.length + (opts.shiftTotalOnPage === page ? 1 : 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const slice = opts.items.slice((page - 1) * pageSize, page * pageSize);
    return xml(
      'GetSellerList',
      `<Ack>Success</Ack><PaginationResult><TotalNumberOfPages>${pages}</TotalNumberOfPages><TotalNumberOfEntries>${total}</TotalNumberOfEntries></PaginationResult>
<HasMoreItems>${page < pages}</HasMoreItems><ItemArray>${slice.map(itemXml).join('')}</ItemArray><PageNumber>${page}</PageNumber>`,
    );
  };
  return { fetch, calls };
}

function xml(call: string, inner: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><${call}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Timestamp>2026-09-30T12:00:00.000Z</Timestamp>${inner}<Version>1451</Version></${call}Response>`, {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  });
}
