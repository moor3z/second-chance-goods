import type { Env } from '../../src/config';
import { isStaff } from '../../src/staff';

// Staff-only bridge: forwards a "post this item" request to the sync Worker, which holds the Facebook token.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await isStaff(request, env))) return Response.json({ status: 'failed', message: 'Not signed in' }, { status: 401 });
  if (!env.SYNC_WORKER_URL || !env.SYNC_TOKEN) return Response.json({ status: 'failed', message: 'Facebook posting is not configured on the website (SYNC_WORKER_URL / SYNC_TOKEN)' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { itemId?: string; message?: string; force?: boolean };
  if (!/^\d{6,20}$/.test(String(body.itemId || ''))) return Response.json({ status: 'failed', message: 'Missing item' }, { status: 400 });
  const target = env.SYNC_WORKER_URL.replace(/\/+$/, '') + '/facebook-post-item';
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.SYNC_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: String(body.itemId), message: typeof body.message === 'string' ? body.message.slice(0, 5000) : null, force: !!body.force }),
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ status: 'failed', message: `Couldn’t reach the sync Worker: ${(err as Error).message}` }, { status: 502 });
  }
};
