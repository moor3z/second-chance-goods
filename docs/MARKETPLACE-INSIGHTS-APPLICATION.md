# Applying for eBay's Marketplace Insights API

Marketplace Insights is eBay's official sold-items API (last 90 days). It is a limited release: access is granted by
eBay's business team on request. Without it there is no official way to pull sold prices automatically.

## How to apply
1. Sign in at developer.ebay.com with the account that owns the Price Scanner keyset.
2. Go to **Support → Developer Technical Support** (or developer.ebay.com/my/support/tickets) and open a ticket.
3. Subject: **Request for Marketplace Insights API access (Buy APIs)**.
4. Paste the message below, filling in anything in [brackets], and attach nothing else unless asked.
5. eBay may ask for the Buy APIs application form; complete it with the same details. Expect a few weeks.

## Message

Hello,

I'd like to request production access to the Marketplace Insights API (item_sales search) for our application.

**Who we are.** Second Chance Goods Ltd (eBay seller `second_chance_goods_ltd`, business seller since 2010,
15,000+ items sold, 99.8% positive feedback). We are a UK limited company (CRN 15930907, VAT GB 517632002) that
resells pre-owned goods recovered through our house-clearance businesses, Tidy Up Ltd and HouseClear.

**Application.** App ID `TidyUpLt-PriceSca-PRD-218349980-7e3ef0e9` ("Price Scanner"). It is an internal tool for
our listing team at https://www.secondchancegoodsltd.co.uk (staff-only pages). The team photographs an item, the
tool identifies it, and shows recent eBay sales so they can price it to sell. We already use the Trading API
(GetSellerList) to publish our inventory on our website and the Browse API for current asking prices.

**How we would use Marketplace Insights.** One `item_sales/search` request per scanned item (roughly 50–150 per day),
by keyword on EBAY_GB, to display: number sold in the last 90 days, the sold price range and average, and sale dates.
Results are shown to our own staff only, cached for no longer than 24 hours, never redistributed, resold, exported
in bulk or shown to the public, and never used to build a dataset. Categories: general second-hand goods
(furniture, homeware, collectables, electronics, books, music, toys, tools, fashion).

**Why.** Accurate sold-price research is the slowest step in listing 2,000+ unique pre-owned items. Terapeak gives
us this by hand; the API would let us put the same eBay data in front of staff automatically, which means better
priced listings and faster sell-through on eBay.

We are happy to complete any additional forms, limit categories or request volume as required, and comply fully
with the eBay API License Agreement and Buy API usage requirements.

Thank you,
Steven Moore
Director, Second Chance Goods Ltd
steven@tidyupltd.com
