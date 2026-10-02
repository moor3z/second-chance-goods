import type { Env } from '../src/config';
import { appContext } from '../src/app';
import { flintshirePage } from '../src/pages/local';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { ctx, cat } = await appContext(request, env);
  return flintshirePage(ctx, cat);
};
