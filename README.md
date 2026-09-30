# Second Chance Goods Ltd: catalogue website

A Cloudflare Pages catalogue of the **Second Chance Goods Ltd** eBay shop
(<https://www.ebay.co.uk/str/secondchancegoodsltd>). You list on eBay once; a scheduled
Worker copies your active listings into a D1 database; the website shows them. Every product
links to its own eBay listing, and all buying happens on eBay.

```
eBay (Trading API: GetSellerList) ──► sync Worker (every 30 min) ──► D1 database ──► Pages website
```

## What's in the folder

| Path | What it is |
|---|---|
| `public/` | Static files: CSS, JS, fonts, logo, images, `_headers`, `_routes.json` |
| `functions/` | Pages Functions (the page routes). Rendered on the server, so search engines see every product |
| `src/` | Shared site code: pages, layout, catalogue queries, category mapping, demo data |
| `sync-worker/` | The scheduled eBay sync Worker (separate Cloudflare Worker) |
| `migrations/0001_init.sql` | Database tables |
| `scripts/ebay-auth.mjs` | One-off eBay authorisation helper |
| `tests/` | Automated tests (mock eBay, fake D1) |
| `docs/` | Verification report, Google Business Profile checklist, screenshots |

**Why no Astro:** the pages are rendered by Pages Functions straight from D1 with no framework
and no build step. That keeps it indexable, fast and small (about 75 KB of server code, one
2 KB script in the browser), and it matches your usual GitHub-upload workflow.

## Costs

- Pages and D1 fit in Cloudflare's free allowance at this size.
- **The sync Worker needs Workers Paid (about $5/month).** On the Free plan a cron job gets 10 ms of
  CPU; parsing ~500 listings took about 290 ms in testing, so free-plan runs would be cut off.

## Setup (in order)

### 1. eBay developer account (one-off)
1. Join the eBay Developers Program at developer.ebay.com using a business email (approval takes about a day).
2. Create a **Production** keyset. You'll see an "account deletion notifications" requirement:
   choose to **opt out** if you agree the app stores no eBay users' personal data (it only stores your own
   listings), or subscribe instead. The keyset stays disabled until you do one or the other.
3. Under **User Tokens**, create a **RuName** (redirect URL name). For the "auth accepted URL" any page
   you control works, e.g. your website's home page; you only need to copy the address it lands on.
4. Note the **App ID (Client ID)**, **Cert ID (Client Secret)** and **RuName**.

### 2. Cloudflare D1 database
1. Dashboard → Storage & Databases → D1 → **Create** → name it `scg-catalogue`.
2. Open its **Console**, paste the whole of `migrations/0001_init.sql`, run it.
3. Copy the database ID into **both** `wrangler.toml` and `sync-worker/wrangler.toml`
   (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

### 3. Website (Cloudflare Pages)
1. Upload the project to a GitHub repo (everything except `node_modules/`, `.wrangler/`, `.dev.vars`).
2. Workers & Pages → Create → Pages → connect the repo.
   Framework preset **None**, build command **empty**, output directory **public**.
3. Pages reads settings from `wrangler.toml`. When you have your domain, set in that file:
   `SITE_URL = "https://www.yourdomain.co.uk"` and `PRODUCTION_HOSTS = "www.yourdomain.co.uk"`,
   then add the custom domain in the Pages project. Until then the site works but tells search engines not to index it.

### 4. Sync Worker
1. Workers & Pages → Create → Worker → **Import a repository** → same repo, **root directory `sync-worker`**,
   deploy command `npx wrangler deploy`. (Or from a PC: `cd sync-worker && npx wrangler deploy`.)
2. Upgrade to **Workers Paid** (see Costs).
3. Add secrets (Worker → Settings → Variables and Secrets, type **Secret**):
   - `SYNC_TOKEN`: a long random string (24+ characters) for manual syncs
   - `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`: easiest via step 5
4. Never put these values in `wrangler.toml`, GitHub, or chat.

### 5. Authorise eBay (on a PC with Node 18+)
```bash
npm install
npx wrangler login
npm run ebay:auth
```
Sign in as the Second Chance Goods seller account, accept, paste back the address you land on.
The script saves the refresh token straight into the Worker's secrets. eBay refresh tokens last about
18 months; the script tells you the date to redo it.

### 6. First sync and checks
```bash
curl -X POST -H "Authorization: Bearer YOUR_SYNC_TOKEN" https://scg-ebay-sync.<your-subdomain>.workers.dev/sync
curl -H "Authorization: Bearer YOUR_SYNC_TOKEN" https://scg-ebay-sync.<your-subdomain>.workers.dev/status
```
Then open `https://your-site/api/status` to confirm the site sees the items. After that it runs by itself.

If the first sync fails with an eBay error mentioning `OutputSelector`, set
`EBAY_USE_OUTPUT_SELECTOR = "false"` in `sync-worker/wrangler.toml` and redeploy (it only trims the response size).

## How the sync keeps the site safe

- Fetches **every page** of active listings, checks the count matches eBay's reported total, and only then
  writes a new snapshot. The site switches to it in one step.
- A failed, partial or suspicious sync (e.g. zero items, or a drop of more than 50%) **leaves the previous
  catalogue live** and deletes the incomplete data. Genuine big clear-outs: run a manual sync with `?force=1`.
- Transient eBay errors retry up to 3 times with backoff; rate limits are not hammered; an expired access token
  is refreshed once; overlapping runs are blocked by a lock; every run is recorded (`/status`).
- Ended, sold-out and non-buyable listings are left out; auctions show "Current bid" / "Starting bid" with bid
  count and end time, fixed-price items show the price (and "or Best Offer" where enabled).
- eBay's licence allows displayed listing data to be at most **6 hours** behind eBay. If syncing stalls past that,
  the site keeps the items but hides prices and says to check eBay.
- Photos are loaded from eBay's image servers, not copied.

## Everyday changes

| To change | Edit |
|---|---|
| Category groups / mapping | `src/categories.ts` |
| eBay figures on the homepage | `src/config.ts` (`BUSINESS.verified`); feedback % also updates automatically |
| Sync frequency | `SYNC_INTERVAL_MINUTES` in both `wrangler.toml` files (keep ≤ 60) |
| Colours, fonts, spacing | `public/assets/css/site.css` (bump `ASSET_VERSION` in `src/config.ts` after CSS/JS edits) |
| Hero / About photos | replace `public/assets/img/hero.webp`, `hero-sm.webp`, `about.webp` (same names) |

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev          # demo mode: illustrative data, clearly labelled, never indexed
npm test             # 20 automated tests (mock eBay + in-memory database), needs Node 22+
npm run typecheck
```
Demo mode is refused on any hostname listed in `PRODUCTION_HOSTS`, so demo data can't reach the real site.
