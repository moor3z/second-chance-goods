import type { Env } from '../../src/config';
import { appContext } from '../../src/app';
import { itemPage } from '../../src/pages/item';
import { notFoundPage } from '../../src/pages/errors';

// /item/<ebayItemId>/<slug>
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const parts = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean).map(String);
  const { ctx, cat } = await appContext(request, env);
  const id = parts[0] ? decodeURIComponent(parts[0]) : '';
  if (!id || parts.length > 2 || !/^[A-Za-z0-9-]{1,40}$/.test(id)) return notFoundPage(ctx);
  return itemPage(ctx, cat, id, parts[1] ?? '');
};
