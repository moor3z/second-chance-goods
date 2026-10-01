#!/usr/bin/env node
/**
 * One-off helper: lets the sync Worker post to your Facebook Page.
 * Swaps a short-lived token from Meta's Graph API Explorer for a long-lived Page token
 * and stores it straight in the Worker as the FB_PAGE_TOKEN secret.
 *
 * Usage (from the project folder):  npm run facebook:auth
 */
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { stdin, stdout, exit } from 'node:process';

const GRAPH = 'https://graph.facebook.com/v26.0';
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q) => (await rl.question(q)).trim();

console.log('You need: your Meta app ID and app secret, plus a token from the Graph API Explorer');
console.log('with pages_show_list, pages_read_engagement and pages_manage_posts ticked.\n');
const appId = await ask('Meta App ID: ');
const appSecret = await ask('Meta App Secret: ');
const shortToken = await ask('Token from Graph API Explorer: ');
if (!appId || !appSecret || !shortToken) {
  console.error('All three are needed.');
  exit(1);
}

const get = async (url) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json;
};

let longUser;
try {
  const q = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken });
  longUser = (await get(`${GRAPH}/oauth/access_token?${q}`)).access_token;
} catch (e) {
  console.error(`Meta refused the token swap: ${e.message}`);
  console.error('Explorer tokens expire after about an hour. Generate a fresh one and run this again.');
  exit(1);
}

let pages;
try {
  pages = (await get(`${GRAPH}/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=${encodeURIComponent(longUser)}`)).data || [];
} catch (e) {
  console.error(`Couldn't list your Pages: ${e.message}`);
  exit(1);
}
if (!pages.length) {
  console.error('No Pages found. Make sure you ticked pages_show_list and chose the Second Chance Goods Page when Facebook asked.');
  exit(1);
}
console.log('\nYour Pages:');
pages.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
const pick = pages.length === 1 ? 1 : Number(await ask('Which number is Second Chance Goods? '));
const page = pages[pick - 1];
if (!page) {
  console.error('That number isn’t in the list.');
  exit(1);
}
if (Array.isArray(page.tasks) && !page.tasks.includes('CREATE_CONTENT')) {
  console.error('Your Facebook account can’t create posts on that Page. You need to be a Page admin or editor.');
  exit(1);
}

console.log(`\nSaving a Page token for "${page.name}" to Cloudflare...`);
const ok = await new Promise((resolve) => {
  const p = spawn('npx', ['wrangler', 'secret', 'put', 'FB_PAGE_TOKEN'], { cwd: new URL('../sync-worker/', import.meta.url), stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  p.stdin.end(page.access_token);
  p.on('close', (c) => resolve(c === 0));
});
if (!ok) {
  const show = await ask('Couldn’t save with wrangler. Show the token to paste into the dashboard instead? (y/N) ');
  if (show.toLowerCase() === 'y') console.log(`\nAdd it as a Secret called FB_PAGE_TOKEN on the scg-ebay-sync Worker:\n\n${page.access_token}\n`);
  rl.close();
  exit(1);
}
console.log(`\nDone. Last step: in GitHub, edit sync-worker/wrangler.toml and set\n\n  FB_PAGE_ID = "${page.id}"\n\nthen commit. Page tokens made this way don't expire unless you change your Facebook password or remove the app.`);
rl.close();
