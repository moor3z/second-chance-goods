#!/usr/bin/env node
/**
 * One-off helper: authorise the sync Worker to read your eBay listings.
 * It opens eBay's consent page, swaps the returned code for a long-lived refresh token,
 * and stores that token directly as a Cloudflare secret. The token is not written to disk.
 *
 * Usage (from the project folder):  npm run ebay:auth
 * Needs: Node 18+, wrangler logged in (npx wrangler login), and from developer.ebay.com:
 *   Production App ID (Client ID), Cert ID (Client Secret) and RuName (eBay Redirect URL name).
 */
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { stdin, stdout, env, exit } from 'node:process';

const SCOPE = 'https://api.ebay.com/oauth/api_scope';
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, fallback) => fallback || (await rl.question(q)).trim();

const clientId = await ask('eBay Production App ID (Client ID): ', env.EBAY_CLIENT_ID);
const clientSecret = await ask('eBay Production Cert ID (Client Secret): ', env.EBAY_CLIENT_SECRET);
const ruName = await ask('eBay RuName (Redirect URL name): ', env.EBAY_RUNAME);
if (!clientId || !clientSecret || !ruName) {
  console.error('All three values are needed.');
  exit(1);
}

const consent = new URL('https://auth.ebay.com/oauth2/authorize');
consent.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: ruName, scope: SCOPE, prompt: 'login' }).toString();
console.log('\n1. Open this link and sign in as the Second Chance Goods eBay seller account:\n');
console.log(consent.toString());
console.log('\n2. Agree to the access request. eBay then sends you to your "accept" URL.');
const landed = await ask('3. Paste the full address from your browser bar here: ');

let code = '';
try {
  code = new URL(landed).searchParams.get('code') || '';
} catch {
  code = /code=([^&\s]+)/.exec(landed)?.[1] ? decodeURIComponent(/code=([^&\s]+)/.exec(landed)[1]) : '';
}
if (!code) {
  console.error('No ?code= found in that address. Run the script again and paste the whole URL.');
  exit(1);
}

const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
  },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ruName }).toString(),
});
const json = await res.json().catch(() => ({}));
if (!res.ok || !json.refresh_token) {
  console.error(`eBay refused the code: ${json.error || res.status} ${json.error_description || ''}`.trim());
  console.error('Codes expire after a few minutes and can only be used once. Run the script again.');
  exit(1);
}
const days = Math.round((json.refresh_token_expires_in || 0) / 86400);
console.log(`\nGot a refresh token, valid for about ${days} days. Saving it to Cloudflare...`);

const put = (name, value) =>
  new Promise((resolve) => {
    const p = spawn('npx', ['wrangler', 'secret', 'put', name], { cwd: new URL('../sync-worker/', import.meta.url), stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    p.stdin.end(value);
    p.on('close', (c) => resolve(c === 0));
  });

const ok = (await put('EBAY_REFRESH_TOKEN', json.refresh_token)) && (await put('EBAY_CLIENT_ID', clientId)) && (await put('EBAY_CLIENT_SECRET', clientSecret));
if (!ok) {
  console.error('\nCouldn\'t save with wrangler (check `npx wrangler login` and that the Worker is deployed).');
  const show = await rl.question('Show the refresh token so you can paste it into the Cloudflare dashboard instead? (y/N) ');
  if (show.trim().toLowerCase() === 'y') {
    console.log('\nWorkers & Pages > scg-ebay-sync > Settings > Variables and Secrets > Add > type "Secret", name EBAY_REFRESH_TOKEN:\n');
    console.log(json.refresh_token + '\n');
    console.log('Clear your terminal afterwards. Also add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET the same way.');
  }
  rl.close();
  exit(ok ? 0 : 1);
}
console.log(`\nDone. Put a reminder in your diary for ${new Date(Date.now() + (days - 30) * 86400_000).toDateString()} to run this again before the token expires.`);
rl.close();
