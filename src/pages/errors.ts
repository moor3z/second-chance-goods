import { BUSINESS } from '../config';
import { h } from '../html';
import { icons, page, type RenderCtx } from '../ui';

export function notFoundPage(ctx: RenderCtx, message = 'That page doesn’t exist or has moved.', status = 404): Response {
  const res = page(ctx, {
    title: status === 410 ? 'No longer listed' : 'Page not found',
    description: message,
    canonicalPath: null,
    noindex: true,
    main: h`<div class="wrap page-head narrow">
      <h1 class="page-title">${status === 410 ? 'This item is no longer listed' : 'Nothing here'}</h1>
      <p class="page-intro">${message}</p>
      <p class="actions"><a class="btn" href="/shop">Browse the collection${icons.arrow}</a> <a class="text-link" href="${BUSINESS.ebayStoreUrl}">Open our eBay shop${icons.arrow}</a></p>
    </div>`,
  });
  return new Response(res.body, { status, headers: res.headers });
}
