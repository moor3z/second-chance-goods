import type { Env } from '../../../../src/config';
import { isStaff } from '../../../../src/staff';

// Serves a scan photo from R2 to signed-in staff.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await isStaff(request, env))) return new Response('Not signed in', { status: 401 });
  if (!env.SCANS) return new Response('No bucket', { status: 503 });
  const parts = Array.isArray(params.key) ? params.key : [String(params.key || '')];
  const key = decodeURIComponent(parts.join('/'));
  if (!key.startsWith('scans/')) return new Response('Not found', { status: 404 });
  const obj = await env.SCANS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
};
