import type { Env } from '../../src/config';
import { appContext } from '../../src/app';
import { parseQuery } from '../../src/catalogue';
import { catalogueView } from '../../src/pages/shop';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const url = new URL(request.url);
  const slug = String(params.slug || '');
  const q = { ...parseQuery(url), category: slug };
  const { ctx, cat } = await appContext(request, env);
  return catalogueView(ctx, cat, q, slug);
};
