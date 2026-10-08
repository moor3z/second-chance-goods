import type { Env } from '../../../src/config';
import { appContext } from '../../../src/app';
import { isStaff } from '../../../src/staff';
import { identifyItem, ebayImageMatches } from '../../../src/scan';
import { scanErrorPage } from '../../../src/pages/scan';

const MAX_PHOTOS = 12;
const MAX_BYTES = 4_500_000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await isStaff(request, env))) return Response.redirect(new URL('/staff', request.url).toString(), 302);
  const { ctx } = await appContext(request, env);
  if (!env.ANTHROPIC_API_KEY || !env.SCANS || !env.DB) return scanErrorPage(ctx, 'The scanner isn’t set up yet (ANTHROPIC_API_KEY secret and SCANS bucket).');
  const form = await request.formData().catch(() => null);
  if (!form) return scanErrorPage(ctx, 'No photos received.');
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_PHOTOS);
  if (!files.length) return scanErrorPage(ctx, 'No photos received.');
  const notes = String(form.get('notes') || '').slice(0, 500);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const keys: string[] = [];
  const images: { data: ArrayBuffer; type: string }[] = [];
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_BYTES) return scanErrorPage(ctx, `Photo ${i + 1} is too large (${Math.round(f.size / 1e6)} MB). The page should shrink photos automatically; try again with JavaScript enabled.`);
    const data = await f.arrayBuffer();
    const type = f.type && f.type.startsWith('image/') ? f.type : 'image/jpeg';
    const key = `scans/${createdAt.slice(0, 10)}/${id}/${i + 1}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
    await env.SCANS.put(key, data, { httpMetadata: { contentType: type } });
    keys.push(key);
    images.push({ data, type });
  }
  try {
    const matches = await ebayImageMatches(env, images[0].data);
    const result = await identifyItem(env, images, notes, matches.slice(0, 8).map((m) => m.title));
    result.ebayMatches = matches;
    await env.DB.prepare('INSERT INTO scans (id, created_at, photo_keys, result, status) VALUES (?, ?, ?, ?, ?)')
      .bind(id, createdAt, JSON.stringify(keys), JSON.stringify(result), 'identified')
      .run();
    return Response.redirect(new URL(`/staff/scan/${id}`, request.url).toString(), 303);
  } catch (err) {
    return scanErrorPage(ctx, (err as Error).message);
  }
};
