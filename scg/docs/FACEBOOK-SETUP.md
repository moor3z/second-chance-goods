# Facebook and Marketplace setup

Three separate features. Do them in any order; each works on its own.

## 1. Marketplace lister (private page for you)

1. Cloudflare → **Workers & Pages → second-chance-goods → Settings → Variables and Secrets → Add**.
   Type **Secret**, name `STAFF_KEY`, value: a password of at least 12 characters. Save and redeploy if asked.
2. On your phone, open `https://<your site>/staff`, enter the password. It remembers you for 90 days.
3. Bookmark `https://<your site>/staff/marketplace` (or add it to your home screen).

Each item has Copy buttons for the title, price and description, suggested Marketplace category and
condition, and its photos (tap one to open it full size, then save it). Tick "Listed on Marketplace"
when done; the ticks are remembered on that device only.

**When something sells locally, end the eBay listing straight away.** The website updates itself.

## 2. Facebook Shop catalogue (automatic)

The site publishes your stock as a product feed at `https://<your site>/feeds/facebook.csv`
(buy-it-now items with photos; auctions are left out). Meta reads it on a schedule.

1. Go to **business.facebook.com → Commerce Manager → Add catalogue**, type **E-commerce**.
2. In the catalogue: **Data sources → Add items → Data feed → Use a URL**, paste the feed address.
3. Schedule: **Hourly**. Currency **GBP**.
4. Connect the catalogue to the Second Chance Goods Page to show a Shop on the Page (Commerce Manager
   walks you through it). Product links go to your website, then eBay.

Meta reviews the products before showing them. Meta decides whether they also appear on Marketplace.

## 3. Daily "new in" post on your Facebook Page (automatic)

Posts once a day (after 18:00 UK by default) with up to 10 new listings and their photos. Nothing is posted
on days with no new stock.

1. **developers.facebook.com → My Apps → Create app.** Type **Business** (or "Other" then "Business").
2. In **App settings → Basic**: add a privacy policy URL (`https://<your site>/privacy`) and an app icon.
   Switch the app to **Live** at the top of the dashboard. Posts from an app in Development mode may
   only be visible to you.
3. Open the **Graph API Explorer** (developers.facebook.com/tools/explorer): choose your app, under
   Permissions add `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, then
   **Generate Access Token** and choose the Second Chance Goods Page when Facebook asks.
4. On your PC, in the project folder: `npm run facebook:auth`. Paste the app ID, app secret
   (App settings → Basic) and the Explorer token. It saves the Page token to the Worker.
5. In GitHub, edit `sync-worker/wrangler.toml`: set `FB_PAGE_ID` to the number the script printed.
   Optionally set `SITE_URL` to your domain so posts link to the website. Commit.

Preview the next post without sending it:
`curl.exe -X POST -H "Authorization: Bearer YOUR_SYNC_TOKEN" "https://scg-ebay-sync.<you>.workers.dev/facebook-post?preview=1"`
Remove `?preview=1` to post immediately.

If Meta asks for App Review for `pages_manage_posts`, stop and get in touch: for your own Page, an app
with you as admin normally doesn't need it, but Meta changes this from time to time.
