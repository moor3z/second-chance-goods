/**
 * Email alerts when the eBay sync keeps failing, and an all-clear when it recovers. Sent through Resend.
 * Settings: ALERT_EMAIL_TO, ALERT_EMAIL_FROM (vars), RESEND_API_KEY (secret), ALERT_AFTER_FAILURES (var, default 2).
 */
/// <reference types="@cloudflare/workers-types" />
import type { FetchFn } from './ebay';

export interface AlertConfig {
  to: string;
  from: string;
  apiKey: string;
  afterFailures: number;
  /** Send a reminder every this many further failures while it stays broken. */
  remindEvery: number;
  statusUrl: string;
  siteUrl: string;
}

interface Run { status: string; started_at: string; finished_at: string | null; message: string | null }

const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : 'unknown');

export async function sendEmail(cfg: AlertConfig, fetchFn: FetchFn, subject: string, text: string): Promise<void> {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend refused the email: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

export type AlertOutcome = 'none' | 'alert' | 'reminder' | 'recovered';

/** Call after every sync attempt. Looks at the run history, so it needs no extra bookkeeping from the sync itself. */
export async function checkSyncHealth(db: D1Database, cfg: AlertConfig, fetchFn: FetchFn, log: (e: string, d?: Record<string, unknown>) => void): Promise<AlertOutcome> {
  const { results: runs } = await db
    .prepare("SELECT status, started_at, finished_at, message FROM sync_runs WHERE status IN ('success','failed','rejected') ORDER BY started_at DESC LIMIT 50")
    .all<Run>();
  let streak = 0;
  for (const r of runs) {
    if (r.status === 'success') break;
    streak++;
  }
  const st = Object.fromEntries((await db.prepare("SELECT key, value FROM sync_state WHERE key IN ('alert_sent_at_streak','last_success_at')").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
  const sentAt = Number(st.alert_sent_at_streak || 0);
  const set = (v: string) => db.prepare("INSERT INTO sync_state (key, value) VALUES ('alert_sent_at_streak', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(v).run();

  try {
    if (streak === 0) {
      if (sentAt > 0) {
        await sendEmail(cfg, fetchFn, 'Second Chance Goods: eBay sync is working again',
          `Good news – the eBay sync has succeeded again after ${sentAt} failed attempts.\n\nLast successful sync: ${fmt(st.last_success_at || null)} (UK time).\nThe website is showing current prices again.\n\n${cfg.siteUrl ? `Website: ${cfg.siteUrl}\n` : ''}Status: ${cfg.statusUrl}`);
        await set('0');
        log('alert_recovered_sent', { afterFailures: sentAt });
        return 'recovered';
      }
      return 'none';
    }
    const due = streak >= cfg.afterFailures && (sentAt === 0 || streak - sentAt >= cfg.remindEvery);
    if (!due) return 'none';
    const recent = runs.slice(0, Math.min(streak, 5)).map((r) => `• ${fmt(r.started_at)}: ${r.status} – ${r.message || 'no message'}`).join('\n');
    const lastOk = st.last_success_at || null;
    const hours = lastOk ? Math.round((Date.now() - Date.parse(lastOk)) / 3_600_000) : null;
    const text = `The eBay sync for the Second Chance Goods website has failed ${streak} time${streak === 1 ? '' : 's'} in a row.

Last successful sync: ${fmt(lastOk)} (UK time)${hours !== null ? `, about ${hours} hour${hours === 1 ? '' : 's'} ago` : ''}.
The website keeps showing the last good catalogue. After 6 hours without a successful sync it hides prices and sends people to eBay.

Most recent attempts:
${recent}

What to do:
1. If the message mentions "refresh token" or "authorisation": run  npm run ebay:auth  on the PC.
2. If it mentions "rate limited" or code 518: wait; eBay's daily limit resets overnight.
3. If it mentions listings "fell from": check eBay, then run the manual sync with ?force=1 if the drop is genuine.
4. Anything else: send the message to Claude.

Status: ${cfg.statusUrl}
Cloudflare logs: scg-ebay-sync → Observability

You'll get another email if it is still failing after ${cfg.remindEvery} more attempts, and one when it recovers.`;
    await sendEmail(cfg, fetchFn, `Second Chance Goods: eBay sync has failed ${streak} times in a row`, text);
    await set(String(streak));
    log(sentAt === 0 ? 'alert_sent' : 'alert_reminder_sent', { streak });
    return sentAt === 0 ? 'alert' : 'reminder';
  } catch (err) {
    log('alert_email_failed', { message: (err as Error).message, streak });
    return 'none';
  }
}
