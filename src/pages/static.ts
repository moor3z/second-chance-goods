import { BUSINESS } from '../config';
import { formatDate } from '../format';
import { h } from '../html';
import { icons, page, type RenderCtx } from '../ui';

export function aboutPage(ctx: RenderCtx): Response {
  const feedback = ctx.meta.sellerFeedbackPercent ? `${ctx.meta.sellerFeedbackPercent}%` : BUSINESS.verified.feedbackPercent;
  const main = h`
<div class="wrap page-head narrow">
  <h1 class="page-title">More character. Less waste.</h1>
  <p class="page-intro">Second Chance Goods gives useful, unusual and much-loved things a new home.</p>
</div>
<div class="wrap prose">
  <p>We sell pre-loved furniture, collectables, vintage pieces and everyday favourites through our eBay shop. Each item has its own eBay listing with photos and a full description, and new finds are added regularly.</p>
  <h2>How buying works</h2>
  <p>This website is our catalogue. Browse and search here, then use the “View on eBay” link to see the full listing and buy. Payment, delivery, collection options and returns are handled on eBay under eBay’s terms and the details shown on each listing.</p>
  <h2>Our eBay record</h2>
  <p>On eBay we have ${feedback} positive feedback and ${BUSINESS.verified.itemsSoldFloor} items sold, as shown on our <a href="${BUSINESS.ebayFeedbackUrl}">eBay shop</a> (checked ${formatDate(BUSINESS.verified.checkedOn + 'T12:00:00Z')}).</p>
  <h2>Get in touch</h2>
  <p>The quickest way to reach us about an item is through eBay’s messaging, which keeps the conversation linked to the listing.</p>
  <p class="actions"><a class="btn" href="${BUSINESS.ebayContactUrl}">Contact us on eBay${icons.arrow}</a> <a class="text-link" href="/shop">Browse the collection${icons.arrow}</a></p>
</div>`;
  return page(ctx, {
    title: 'About us',
    description: 'Second Chance Goods Ltd sells pre-loved furniture, collectables and vintage finds through eBay. Browse the catalogue here and buy on eBay.',
    canonicalPath: '/about',
    main,
  });
}

export function privacyPage(ctx: RenderCtx): Response {
  const main = h`
<div class="wrap page-head narrow"><h1 class="page-title">Privacy notice</h1><p class="page-intro">How this website handles information.</p></div>
<div class="wrap prose">
  <p>This website is run by ${BUSINESS.legalName}. It is a catalogue of our eBay listings. There are no accounts, basket or checkout here, and we don’t ask you for any personal information on this site.</p>
  <h2>What this site collects</h2>
  <p>We don’t set advertising or analytics cookies and we don’t use tracking scripts. Your search terms are used only to show results and are not stored by us.</p>
  <p>The site is hosted on Cloudflare. Like any web host, Cloudflare processes technical information such as your IP address and browser details to deliver pages and protect the site from abuse. Product photos are loaded from eBay’s image servers, which will also receive this technical information.</p>
  <h2>Buying and contacting us through eBay</h2>
  <p>When you view a listing, buy or message us on eBay, eBay’s own privacy notice applies. We receive the order and contact details eBay shares with sellers, and use them only to fulfil and support your purchase.</p>
  <h2>Your rights</h2>
  <p>You can ask us what personal information we hold about you and ask us to correct or delete it, by contacting us through eBay. If you’re unhappy with how we handle your information, you can complain to the Information Commissioner’s Office (ico.org.uk).</p>
</div>`;
  return page(ctx, { title: 'Privacy notice', description: `How the ${BUSINESS.name} website handles information.`, canonicalPath: '/privacy', main });
}

export function termsPage(ctx: RenderCtx): Response {
  const main = h`
<div class="wrap page-head narrow"><h1 class="page-title">Terms of use</h1><p class="page-intro">The short version: browse here, buy on eBay.</p></div>
<div class="wrap prose">
  <p>This website is operated by ${BUSINESS.legalName} and shows items we have listed for sale on eBay.</p>
  <h2>Purchases</h2>
  <p>You can’t buy directly on this website. Every sale is made on eBay, under eBay’s user agreement and the terms shown on the individual eBay listing, including delivery, collection and returns.</p>
  <h2>Accuracy</h2>
  <p>Listing information is copied from eBay periodically, so prices, bids and availability here can be briefly out of date. The eBay listing is always the up-to-date and binding version. If anything differs, eBay is correct.</p>
  <h2>Photos and content</h2>
  <p>Product photos and descriptions come from our own eBay listings. Please don’t reuse them without permission.</p>
  <h2>Contact</h2>
  <p>Questions about an item or an order are best sent through <a href="${BUSINESS.ebayContactUrl}">eBay messaging</a>.</p>
</div>`;
  return page(ctx, { title: 'Terms of use', description: `Terms for using the ${BUSINESS.name} catalogue website.`, canonicalPath: '/terms', main });
}
