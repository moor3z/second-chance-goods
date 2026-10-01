import type { Env } from '../../src/config';
import { appContext } from '../../src/app';
import { isStaff } from '../../src/staff';
import { marketplaceLister } from '../../src/pages/staff';

const PER_PAGE = 30;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await isStaff(request, env))) return Response.redirect(new URL('/staff', request.url).toString(), 302);
  const { ctx, cat } = await appContext(request, env);
  const all = await cat.allItems();
  const pageNo = Math.max(1, Math.min(Math.ceil(all.length / PER_PAGE) || 1, parseInt(new URL(request.url).searchParams.get('page') || '1', 10) || 1));
  return marketplaceLister(ctx, all.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE), pageNo, PER_PAGE, all.length);
};
