import type { Env } from '../../../src/config';
import { appContext } from '../../../src/app';
import { isStaff } from '../../../src/staff';
import { scanHome, type ScanRow } from '../../../src/pages/scan';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await isStaff(request, env))) return Response.redirect(new URL('/staff', request.url).toString(), 302);
  const { ctx } = await appContext(request, env);
  let recent: ScanRow[] = [];
  try {
    recent = env.DB ? (await env.DB.prepare("SELECT * FROM scans WHERE status != 'discarded' ORDER BY created_at DESC LIMIT 20").all<ScanRow>()).results : [];
  } catch {
    recent = []; // table not migrated yet
  }
  return scanHome(ctx, recent, !!(env.ANTHROPIC_API_KEY && env.SCANS));
};
