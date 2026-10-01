import type { Env } from '../../src/config';
import { getCatalogue } from '../../src/catalogue';

// Public, non-sensitive health info: when the catalogue last synced and how many items it holds.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const m = await getCatalogue(env).meta();
    return Response.json(
      { mode: m.mode, lastSuccessAt: m.lastSuccessAt, itemCount: m.itemCount, stale: m.stale },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'catalogue unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};
