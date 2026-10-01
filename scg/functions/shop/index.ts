import type { Env } from '../../src/config';
import { appContext } from '../../src/app';
import { parseQuery } from '../../src/catalogue';
import { catalogueView, preferredUrl } from '../../src/pages/shop';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const q = parseQuery(url);
  // Category-only filters live at /category/<slug>; tidy default parameters (e.g. sort=newest, empty q).
  const preferred = preferredUrl(q);
  if (preferred !== url.pathname + url.search) {
    return Response.redirect(new URL(preferred, url).toString(), preferred.startsWith('/category/') ? 301 : 302);
  }
  const { ctx, cat } = await appContext(request, env);
  return catalogueView(ctx, cat, q, null);
};
