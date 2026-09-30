import type { Env } from '../src/config';
import { appContext } from '../src/app';
import { homePage } from '../src/pages/home';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { ctx, cat } = await appContext(request, env);
  return homePage(ctx, cat);
};
