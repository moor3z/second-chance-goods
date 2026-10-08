import { ASSET_VERSION, BUSINESS } from '../config';
import { h, raw, type Safe } from '../html';
import { page, type RenderCtx } from '../ui';
import { researchLinks, lensUrl, type ScanResult } from '../scan';
import { formatDateTime, formatMoney } from '../format';

export interface ScanRow { id: string; created_at: string; photo_keys: string; result: string | null; edited: string | null; status: string; ebay_item_id: string | null }

const noStore = (res: Response) => new Response(res.body, { headers: { ...Object.fromEntries(res.headers), 'cache-control': 'no-store' } });

export function scanHome(ctx: RenderCtx, recent: ScanRow[], ready: boolean): Response {
  const main = h`
<div class="wrap page-head">
  <nav class="staff-tabs" aria-label="Staff tools"><a href="/staff/marketplace">Marketplace</a><a href="/staff/vinted">Vinted</a><a href="/staff/scan" aria-current="page">Price Scanner</a></nav>
  <h1 class="page-title">Price Scanner</h1>
  <p class="page-intro">Take photos of an item. It’s identified for you, with sold statistics and one-tap links to what the same item sold for, so you can price it quickly.</p>
  ${ready ? '' : h`<div class="staff-warn" role="note"><strong>Not set up yet.</strong> The website needs the ANTHROPIC_API_KEY secret and the SCANS photo bucket (see docs/SCANNER-SETUP.md).</div>`}
</div>
<div class="wrap">
  <form class="scan-form" id="scan-form" method="post" action="/staff/scan/identify" enctype="multipart/form-data"${ready ? '' : h` hidden`}>
    <label class="scan-drop" for="scan-photos">
      <input id="scan-photos" name="photos" type="file" accept="image/*" multiple>
      <span class="scan-drop-text"><strong>Take or choose photos</strong><br>Up to 12. Include labels, model numbers and any damage.</span>
    </label>
    <ul class="scan-thumbs" id="scan-thumbs" aria-live="polite"></ul>
    <label for="scan-notes">Anything the photos don’t show (optional)</label>
    <input id="scan-notes" name="notes" type="text" placeholder="e.g. tested and working, missing remote, 45cm wide">
    <button class="btn" type="submit" id="scan-go">Identify &amp; price${raw('<span class="icon"></span>')}</button>
    <p class="scan-status" id="scan-status" role="status"></p>
  </form>
  ${recent.length ? h`<h2 class="section-title scan-recent-h">Recent scans</h2>
  <ul class="scan-recent">${recent.map((r) => {
    let title = 'Unidentified';
    try { title = (JSON.parse(r.edited || r.result || '{}') as ScanResult).title || title; } catch { /* ignore */ }
    return h`<li><a href="/staff/scan/${r.id}"><span>${title}</span><small>${formatDateTime(r.created_at)}${r.status === 'listed' ? ' · listed' : ''}</small></a></li>`;
  })}</ul>` : ''}
</div>
<script src="/assets/js/scan.js?v=${ASSET_VERSION}" defer></script>`;
  return noStore(page(ctx, { title: 'Price Scanner', description: 'Staff only.', canonicalPath: null, noindex: true, main, bodyClass: 'staff' }));
}

const field = (label: string, id: string, value: string, opts: { multiline?: boolean; max?: number; hint?: string } = {}): Safe => h`
  <div class="lf">
    <label for="${id}">${label}${opts.max ? h` <span class="lf-count" data-count-for="${id}">${value.length}/${opts.max}</span>` : ''}</label>
    <div class="lf-row">
      ${opts.multiline ? h`<textarea id="${id}" name="${id}" rows="5" data-edit>${value}</textarea>` : h`<input id="${id}" name="${id}" type="text" value="${value}"${opts.max ? h` maxlength="${opts.max}"` : ''} data-edit>`}
      <button class="btn btn-small copy-btn" type="button" data-copy="${id}">Copy</button>
    </div>
    ${opts.hint ? h`<p class="fb-note">${opts.hint}</p>` : ''}
  </div>`;

export function scanResultPage(ctx: RenderCtx, row: ScanRow, result: ScanResult & { pricePounds?: string }, photoUrls: string[], compsUrl: string, lensPhotoUrls: string[] = [], statsUrl = ''): Response {
  const links = researchLinks(result.searchQuery);
  const specificsText = result.specifics.map((s) => `${s.name}: ${s.value}`).join('\n');
  const main = h`
<div class="wrap page-head">
  <nav class="staff-tabs" aria-label="Staff tools"><a href="/staff/scan">← Price Scanner</a></nav>
  <h1 class="page-title">${result.title || 'Unidentified item'}</h1>
  <p class="page-intro">${result.itemType}${result.brand ? h` · ${result.brand}` : ''}${result.model ? h` ${result.model}` : ''} · confidence: <strong>${result.confidence}</strong></p>
  ${result.checkFirst.length ? h`<div class="staff-warn" role="note"><strong>Check before listing:</strong> ${result.checkFirst.join(' · ')}</div>` : ''}
</div>
<div class="wrap scan-result" data-scan="${row.id}">
  <ul class="scan-thumbs scan-thumbs-static">${photoUrls.map((u, i) => h`<li><a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Photo ${i + 1}"></a>${lensPhotoUrls[i] ? h`<a class="lens-btn" href="${lensUrl(lensPhotoUrls[i])}" target="_blank" rel="noopener" title="Search this photo with Google Lens">Lens</a>` : ''}</li>`)}</ul>
  ${lensPhotoUrls.length ? h`<p class="fb-note">Tap <strong>Lens</strong> under a photo for a Google Lens second opinion (links work for one hour).</p>` : ''}

  <section class="matches comps-section" aria-label="On eBay right now">
    <div class="comps" id="comps" data-comps-url="${compsUrl}"><p class="fb-note">Loading current asking prices…</p></div>
  </section>

  ${result.ebayMatches && result.ebayMatches.length ? h`<section class="matches" aria-labelledby="mt-h">
    <h2 id="mt-h">Looks like these on eBay</h2>
    <p class="fb-note">eBay’s own image search, from your first photo. Check the exact model before trusting a price.</p>
    <ul class="comps-list">${result.ebayMatches.slice(0, 8).map((m) => h`<li>${m.image ? h`<img src="${m.image}" alt="" loading="lazy">` : h`<span class="comps-noimg"></span>`}<a href="${m.url}" target="_blank" rel="noopener">${m.title}</a><span class="comps-price">${m.pricePence ? formatMoney(m.pricePence, 'GBP') : ''}</span><small>${m.condition}</small></li>`)}</ul>
  </section>` : ''}

  <section class="price-panel" aria-labelledby="pp-h">
    <h2 id="pp-h">Price it</h2>
    <p class="price-query">Search used: <strong>${result.searchQuery}</strong> <button class="text-link" type="button" data-edit-query>change</button></p>
    <ul class="price-links">
      <li><a class="btn" href="${links.sold}" target="_blank" rel="noopener" data-link="sold">Sold on eBay</a><p>What the last ones <strong>actually sold for</strong>. Start here: price to match recent sales.</p></li>
      <li><a class="btn btn-outline" href="${links.terapeak}" target="_blank" rel="noopener" data-link="terapeak">Terapeak research</a><p>eBay’s own stats: average sold price and how many sell. Use for anything valuable or when the sold results are all over the place. Needs the shop’s eBay login.</p></li>
      <li><a class="btn btn-outline" href="${links.active}" target="_blank" rel="noopener" data-link="active">Active listings</a><p>What others are <strong>asking</strong> right now. Useful to see the competition, but asking isn’t selling.</p></li>
    </ul>
    <div class="stats" id="stats" data-stats-url="${statsUrl}"><p class="fb-note">Loading sold statistics…</p></div>
  </section>

  <section class="draft" aria-labelledby="notes-h">
    <h2 id="notes-h">Your decision</h2>
    ${field('Title (for your records)', 'title', result.title, { max: 80 })}
    ${field('Price you’ve decided on (£)', 'price', result.pricePounds || '', { hint: 'Saved with the scan so you can find it again.' })}
    ${field('Notes', 'description', result.description, { multiline: true, hint: 'Condition notes from the photos. Edit as you like.' })}
    <div class="scan-actions">
      <button class="btn" type="button" data-save>Save</button>
      <button class="text-link" type="button" data-discard>Discard scan</button>
      <span class="fb-status" role="status"></span>
    </div>
  </section>
</div>
<script src="/assets/js/scan.js?v=${ASSET_VERSION}" defer></script>`;
  return noStore(page(ctx, { title: `${result.title || 'Scan'} – Price Scanner`, description: 'Staff only.', canonicalPath: null, noindex: true, main, bodyClass: 'staff' }));
}

export function scanErrorPage(ctx: RenderCtx, message: string): Response {
  const main = h`<div class="wrap page-head narrow"><h1 class="page-title">Couldn’t identify that</h1><p class="staff-error">${message}</p><p><a class="btn" href="/staff/scan">Try again</a></p></div>`;
  return noStore(page(ctx, { title: 'Price Scanner', description: 'Staff only.', canonicalPath: null, noindex: true, main, bodyClass: 'staff' }));
}
