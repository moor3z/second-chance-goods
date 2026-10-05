/// <reference types="@cloudflare/workers-types" />
import { runSync, type SyncDeps } from './sync';
import { realSleep, type EbayConfig } from './ebay';
import { autoPostNewItems, maybePostDailyDigest, postSingleItem, type FacebookConfig } from './facebook';
import { checkSyncHealth, type AlertConfig } from './alerts';

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
  /** Facebook Page posting (optional). FB_PAGE_TOKEN is a secret; the rest are vars. */
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  FB_GRAPH_VERSION?: string;
  FB_POST_HOUR?: string;
  FB_POST_MAX_ITEMS?: string;
  SITE_URL?: string;
  FB_POST_INTRO?: string;
  FB_POST_OUTRO?: string;
  FB_AUTO_POST_MIN_PRICE?: string;
  FB_AUTO_POST_MAX_PER_DAY?: string;
  /** Email alerts when syncing keeps failing (optional). RESEND_API_KEY is a secret; the rest are vars. */
  RESEND_API_KEY?: string;
  ALERT_EMAIL_TO?: string;
  ALERT_EMAIL_FROM?: string;
  ALERT_AFTER_FAILURES?: string;
}

function alertConfig(env: Env, request?: Request): AlertConfig | null {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO || !env.ALERT_EMAIL_FROM) return null;
  return {
    to: env.ALERT_EMAIL_TO,
    from: env.ALERT_EMAIL_FROM,
    apiKey: env.RESEND_API_KEY,
    afterFailures: num(env.ALERT_AFTER_FAILURES, 2, 1, 50),
    remindEvery: 8,
    statusUrl: request ? new URL('/status', request.url).toString() : 'the Worker /status endpoint',
    siteUrl: env.SITE_URL || '',
  };
}

function facebookConfig(env: Env): FacebookConfig | null {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) return null;
  return {
    pageId: env.FB_PAGE_ID,
    pageToken: env.FB_PAGE_TOKEN,
    graphVersion: env.FB_GRAPH_VERSION || 'v26.0',
    postHour: num(env.FB_POST_HOUR, 18, 0, 23),
    maxItems: num(env.FB_POST_MAX_ITEMS, 10, 1, 10),
    siteUrl: env.SITE_URL || '',
    storeUrl: 'https://www.ebay.co.uk/str/secondchancegoodsltd',
    intro: env.FB_POST_INTRO || 'New in at Second Chance Goods – {count} fresh finds today:',
    outro: env.FB_POST_OUTRO || 'Browse everything: {link}',
    autoMinPricePence: Math.round(Math.max(0, Number(env.FB_AUTO_POST_MIN_PRICE) || 0) * 100),
    autoMaxPerDay: num(env.FB_AUTO_POST_MAX_PER_DAY, 6, 0, 50),
  };
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
  const secrets = [env.EBAY_CLIENT_SECRET, env.EBAY_REFRESH_TOKEN, env.SYNC_TOKEN, env.EBAY_CLIENT_ID, env.FB_PAGE_TOKEN, env.RESEND_API_KEY].filter((s): s is string => !!s && s.length >= 8);
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

async function sync(env: Env, trigger: 'cron' | 'manual', force: boolean, request?: Request) {
  const cfg = ebayConfig(env);
  if (!cfg) {
    makeLogger(env)('sync_not_configured', { missing: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN'].filter((k) => !env[k as keyof Env]) });
    return { status: 'failed' as const, message: 'eBay credentials are not configured' };
  }
  const result = await runSync(deps(env, cfg), {
    trigger,
    force,
    intervalMinutes: num(env.SYNC_INTERVAL_MINUTES, 30, 5, 300),
    maxDropRatio: num(env.MAX_DROP_RATIO, 0.5, 0.05, 1),
  });
  const alerts = alertConfig(env, request);
  if (alerts && result.status !== 'skipped' && result.status !== 'locked') {
    await checkSyncHealth(env.DB, alerts, (i, init) => fetch(i, init), makeLogger(env));
  }
  return result;
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
    const fb = facebookConfig(env);
    if (fb) {
      try {
        await autoPostNewItems(env.DB, fb, (i, init) => fetch(i, init), new Date(), makeLogger(env));
        await maybePostDailyDigest(env.DB, fb, (i, init) => fetch(i, init), new Date(), makeLogger(env));
      } catch (err) {
        makeLogger(env)('facebook_unexpected_error', { message: (err as Error).message });
      }
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });

    if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 24) return json({ error: 'Manual sync is disabled until SYNC_TOKEN (24+ characters) is set' }, 503);
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ') || !sameSecret(auth.slice(7), env.SYNC_TOKEN)) return json({ error: 'Unauthorised' }, 401);

    if (url.pathname === '/sync' && request.method === 'POST') {
      const result = await sync(env, 'manual', url.searchParams.get('force') === '1', request);
      return json(result, result.status === 'success' ? 200 : result.status === 'locked' ? 409 : 502);
    }
    if (url.pathname === '/facebook-post' && request.method === 'POST') {
      const fb = facebookConfig(env);
      if (!fb) return json({ error: 'Facebook posting is not set up (FB_PAGE_ID and FB_PAGE_TOKEN)' }, 503);
      const preview = url.searchParams.get('preview') === '1';
      const result = await maybePostDailyDigest(env.DB, fb, (i, init) => fetch(i, init), new Date(), makeLogger(env), { force: true, preview });
      return json(result, result.status === 'failed' ? 502 : 200);
    }
    if (url.pathname === '/facebook-post-item' && request.method === 'POST') {
      const fb = facebookConfig(env);
      if (!fb) return json({ status: 'failed', message: 'Facebook posting is not set up yet (FB_PAGE_ID and FB_PAGE_TOKEN)' }, 503);
      const body = (await request.json().catch(() => ({}))) as { itemId?: string; message?: string; force?: boolean };
      const itemId = String(body.itemId || '').trim();
      if (!/^\d{6,20}$/.test(itemId)) return json({ status: 'failed', message: 'itemId missing' }, 400);
      const result = await postSingleItem(env.DB, fb, (i, init) => fetch(i, init), itemId, typeof body.message === 'string' ? body.message.slice(0, 5000) : null, new Date(), makeLogger(env), { force: !!body.force });
      return json(result, result.status === 'posted' ? 200 : result.status === 'failed' ? 502 : 409);
    }
    if (url.pathname === '/alert-test' && request.method === 'POST') {
      const alerts = alertConfig(env, request);
      if (!alerts) return json({ error: 'Alerts are not set up (RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM)' }, 503);
      try {
        const { sendEmail } = await import('./alerts');
        await sendEmail(alerts, (i, init) => fetch(i, init), 'Second Chance Goods: test alert', `This is a test from the eBay sync Worker. Alerts are working.\n\nYou will be emailed after ${alerts.afterFailures} failed syncs in a row, and again when it recovers.`);
        return json({ ok: true, sentTo: alerts.to });
      } catch (err) {
        return json({ error: (err as Error).message }, 502);
      }
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
