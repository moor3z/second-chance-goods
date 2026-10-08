import type { Env } from '../../../src/config';
import { appContext } from '../../../src/app';
import { isStaff } from '../../../src/staff';
import { scanResultPage, scanErrorPage, type ScanRow } from '../../../src/pages/scan';
import { signedPhotoUrl, type ScanResult } from '../../../src/scan';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await isStaff(request, env))) return Response.redirect(new URL('/staff', request.url).toString(), 302);
  const { ctx } = await appContext(request, env);
  if (!env.DB) return scanErrorPage(ctx, 'No database binding.');
  const id = String(params.id || '');
  const row = /^[0-9a-f-]{36}$/.test(id) ? await env.DB.prepare('SELECT * FROM scans WHERE id = ?').bind(id).first<ScanRow>() : null;
  if (!row || !row.result) return scanErrorPage(ctx, 'That scan doesn’t exist.');
  const result = JSON.parse(row.edited || row.result) as ScanResult;
  const keys = JSON.parse(row.photo_keys) as string[];
  const photoUrls = keys.map((k) => `/staff/scan/photo/${encodeURIComponent(k)}`);
  const lensUrls = env.STAFF_KEY ? await Promise.all(keys.map((k) => signedPhotoUrl(ctx.origin, k, env.STAFF_KEY!))) : [];
  return scanResultPage(ctx, row, result, photoUrls, `/staff/scan/comps?q=${encodeURIComponent(result.searchQuery)}`, lensUrls);
};

/** Save edits, the chosen price, or discard. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await isStaff(request, env))) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!env.DB) return Response.json({ error: 'No database' }, { status: 503 });
  const id = String(params.id || '');
  const row = /^[0-9a-f-]{36}$/.test(id) ? await env.DB.prepare('SELECT * FROM scans WHERE id = ?').bind(id).first<ScanRow>() : null;
  if (!row || !row.result) return Response.json({ error: 'Not found' }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; edits?: Record<string, unknown> };
  if (body.action === 'discard') {
    await env.DB.prepare("UPDATE scans SET status = 'discarded' WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  }
  const current = JSON.parse(row.edited || row.result) as ScanResult & { pricePounds?: string };
  const e = body.edits || {};
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const merged = {
    ...current,
    title: str(e.title, 80) ?? current.title,
    description: str(e.description, 2000) ?? current.description,
    searchQuery: str(e.searchQuery, 100) ?? current.searchQuery,
    condition: typeof e.condition === 'string' ? (e.condition as ScanResult['condition']) : current.condition,
    specifics: typeof e.specifics === 'string'
      ? e.specifics.split('\n').map((l) => l.split(':')).filter((p) => p.length >= 2).map((p) => ({ name: p[0].trim().slice(0, 60), value: p.slice(1).join(':').trim().slice(0, 120) })).slice(0, 30)
      : current.specifics,
    pricePounds: str(e.price, 20) ?? current.pricePounds,
  };
  await env.DB.prepare('UPDATE scans SET edited = ? WHERE id = ?').bind(JSON.stringify(merged), id).run();
  return Response.json({ ok: true });
};
