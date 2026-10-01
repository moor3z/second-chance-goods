/// <reference types="@cloudflare/workers-types" />
import { runSync, type SyncDeps } from './sync';
import { realSleep, type EbayConfig } from './ebay';

export interface Env {
  DB: D1Database;
  EBAY_CLIENT_ID?: string;
  EBAY_CLIENT_SECRET?: string;
  EBAY_REFRESH_TOKEN?: string;
  SYNC_TOKEN?: string;
  SYNC_INTERVAL_MINUTES?: string;
  EBAY_SITE_ID?: string;
  EBAY_COMPAT_LEVEL?: string;
  EBAY_PAGE_SIZE?: string;
  EBAY_END_WINDOW_DAYS?: string;
  EBAY_USE_OUTPUT_SELECTOR?: string;
  MAX_DROP_RATIO?: string;
  /** Local testing only: point at a mock server. Snapshots from other hosts are ignored by the live site. */
  EBAY_TRADING_URL?: string;
  EBAY_OAUTH_URL?: string;
}

const num = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export function ebayConfig(env: Env): EbayConfig | null {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET || !env.EBAY_REFRESH_TOKEN) return null;
  return {
    clientId: env.EBAY_CLIENT_ID,
    clientSecret: env.EBAY_CLIENT_SECRET,
    refreshToken: env.EBAY_REFRESH_TOKEN,
    oauthUrl: env.EBAY_OAUTH_URL || 'https://api.ebay.com/identity/v1/oauth2/token',
    tradingUrl: env.EBAY_TRADING_URL || 'https://api.ebay.com/ws/api.dll',
    siteId: env.EBAY_SITE_ID || '3',
    compatLevel: env.EBAY_COMPAT_LEVEL || '1451',
    pageSize: num(env.EBAY_PAGE_SIZE, 100, 1, 200),
    endWindowDays: num(env.EBAY_END_WINDOW_DAYS, 60, 31, 119),
    useOutputSelector: (env.EBAY_USE_OUTPUT_SELECTOR || 'true') !== 'false',
    scopes: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  };
}

/** Structured logs with every secret value scrubbed, whatever the message contains. */
export function makeLogger(env: Env) {
  const secrets = [env.EBAY_CLIENT_SECRET, env.EBAY_REFRESH_TOKEN, env.SYNC_TOKEN, env.EBAY_CLIENT_ID].filter((s): s is string => !!s && s.length >= 8);
  return (event: string, data: Record<string, unknown> = {}) => {
    let line = JSON.stringify({ event, ...data });
    for (const s of secrets) line = line.split(s).join('[redacted]');
    line = line.replace(/(v\^1\.1#[^"\s]{10,})/g, '[redacted-token]'); // eBay user token shape
    console.log(line);
  };
}

function deps(env: Env, cfg: EbayConfig): SyncDeps {
  return {
    db: env.DB,
    cfg,
    fetch: (input, init) => fetch(input, init),
    sleep: realSleep,
    now: () => new Date(),
    log: makeLogger(env),
    newId: () => crypto.randomUUID(),
  };
}

async function sync(env: Env, trigger: 'cron' | 'manual', force: boolean) {
  const cfg = ebayConfig(env);
  if (!cfg) {
    makeLogger(env)('sync_not_configured', { missing: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN'].filter((k) => !env[k as keyof Env]) });
    return { status: 'failed' as const, message: 'eBay credentials are not configured' };
  }
  return runSync(deps(env, cfg), {
    trigger,
    force,
    intervalMinutes: num(env.SYNC_INTERVAL_MINUTES, 30, 5, 300),
    maxDropRatio: num(env.MAX_DROP_RATIO, 0.5, 0.05, 1),
  });
}

function sameSecret(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await sync(env, 'cron', false);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });

    if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 24) return json({ error: 'Manual sync is disabled until SYNC_TOKEN (24+ characters) is set' }, 503);
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ') || !sameSecret(auth.slice(7), env.SYNC_TOKEN)) return json({ error: 'Unauthorised' }, 401);

    if (url.pathname === '/sync' && request.method === 'POST') {
      const result = await sync(env, 'manual', url.searchParams.get('force') === '1');
      return json(result, result.status === 'success' ? 200 : result.status === 'locked' ? 409 : 502);
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      const [state, runs] = await Promise.all([
        env.DB.prepare("SELECT key, value FROM sync_state WHERE key IN ('current_snapshot','last_success_at','item_count','source','seller_feedback_percent')").all(),
        env.DB.prepare('SELECT id, trigger, started_at, finished_at, status, item_count, pages, message FROM sync_runs ORDER BY started_at DESC LIMIT 10').all(),
      ]);
      return json({ state: state.results, recentRuns: runs.results });
    }
    return json({ error: 'Not found' }, 404);
  },
};
