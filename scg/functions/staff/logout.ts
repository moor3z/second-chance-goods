import type { Env } from '../../src/config';
import { logoutCookie } from '../../src/staff';

export const onRequestPost: PagesFunction<Env> = async () =>
  new Response(null, { status: 303, headers: { location: '/', 'set-cookie': logoutCookie(), 'cache-control': 'no-store' } });
