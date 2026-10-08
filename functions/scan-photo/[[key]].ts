import type { Env } from '../../src/config';
import { verifyPhotoSig } from '../../src/scan';

// Time-limited public link to a scan photo, used only so Google Lens can fetch it.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.SCANS || !env.STAFF_KEY) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const parts = Array.isArray(params.key) ? params.key : [String(params.key || '')];
  const key = decodeURIComponent(parts.join('/'));
  if (!key.startsWith('scans/') || !(await verifyPhotoSig(key, url.searchParams.get('e') || '', url.searchParams.get('s') || '', env.STAFF_KEY))) return new Response('Link expired', { status: 403 });
  const obj = await env.SCANS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex' } });
};
