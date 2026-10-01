import type { Env } from '../../src/config';
import { appContext } from '../../src/app';
import { checkKey, isStaff, loginCookie, staffEnabled } from '../../src/staff';
import { staffLoginPage } from '../../src/pages/staff';
import { notFoundPage } from '../../src/pages/errors';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!staffEnabled(env)) return notFoundPage((await appContext(request, env)).ctx);
  if (await isStaff(request, env)) return Response.redirect(new URL('/staff/marketplace', request.url).toString(), 302);
  return staffLoginPage((await appContext(request, env)).ctx);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!staffEnabled(env)) return notFoundPage((await appContext(request, env)).ctx);
  const form = await request.formData().catch(() => null);
  const key = String(form?.get('key') || '');
  if (!(await checkKey(key, env))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return staffLoginPage((await appContext(request, env)).ctx, true);
  }
  return new Response(null, { status: 303, headers: { location: '/staff/marketplace', 'set-cookie': await loginCookie(env), 'cache-control': 'no-store' } });
};
