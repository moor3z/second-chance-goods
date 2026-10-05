import type { Env } from '../../src/config';
import { appContext } from '../../src/app';
import { isStaff } from '../../src/staff';
import { marketplaceLister, VINTED_CATEGORIES } from '../../src/pages/staff';

const PER_PAGE = 30;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await isStaff(request, env))) return Response.redirect(new URL('/staff', request.url).toString(), 302);
  const { ctx, cat } = await appContext(request, env);
  let fbPosted: Record<string, string> = {};
  try {
    fbPosted = JSON.parse((await cat.stateValue('fb_posted_items')) || '{}') || {};
  } catch {
    fbPosted = {};
  }
  const fbEnabled = !!(env.SYNC_WORKER_URL && env.SYNC_TOKEN);
  const url = new URL(request.url);
  const all = (await cat.allItems()).filter((l) => url.searchParams.get('all') === '1' || VINTED_CATEGORIES.includes(l.siteCategory));
  const pageNo = Math.max(1, Math.min(Math.ceil(all.length / PER_PAGE) || 1, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  return marketplaceLister(ctx, all.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE), pageNo, PER_PAGE, all.length, 'vinted', fbPosted, fbEnabled);
};
