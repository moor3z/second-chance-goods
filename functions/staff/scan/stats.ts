import type { Env } from '../../../src/config';
import { isStaff } from '../../../src/staff';

// Sold statistics from your own listing history (held by the sync Worker).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await isStaff(request, env))) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!env.SYNC_WORKER_URL || !env.SYNC_TOKEN) return Response.json({ error: 'SYNC_WORKER_URL / SYNC_TOKEN not set' }, { status: 503 });
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120);
  if (!q) return Response.json({ error: 'q missing' }, { status: 400 });
  try {
    const res = await fetch(`${env.SYNC_WORKER_URL.replace(/\/+$/, '')}/sold-stats?q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${env.SYNC_TOKEN}` } });
    const text = await res.text();
    if (!res.ok) return Response.json({ error: `sync Worker replied ${res.status}` }, { status: 502 });
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=300' } });
  } catch (err) {
    return Response.json({ error: `couldn’t reach the sync Worker (${(err as Error).message})` }, { status: 502 });
  }
};
