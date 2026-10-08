# Price Scanner setup

The scanner lives at `/staff/scan` (staff sign-in required). Photos → AI identification → one-tap price research → draft listing.

## One-off setup (about 10 minutes)

1. **Anthropic API key.** console.anthropic.com → API Keys → Create key. Add a little prepaid credit (identification costs
   roughly 1–2p per item). In Cloudflare: Workers & Pages → second-chance-goods → Settings → Variables and Secrets → Add,
   type **Secret**, name `ANTHROPIC_API_KEY`.
2. **Photo bucket.** Cloudflare → R2 → Create bucket, name `scg-scans` (no public access needed). Then in GitHub, edit the
   top-level `wrangler.toml` and add above `[vars]`:
   ```
   [[r2_buckets]]
   binding = "SCANS"
   bucket_name = "scg-scans"
   ```
3. **Database table.** Cloudflare → Storage & databases → D1 → scg-catalogue → Console. Paste the contents of
   `migrations/0002_scans.sql` and run it.
4. Commit, wait for the deploy, then open `https://www.secondchancegoodsltd.co.uk/staff/scan`.

The current-asking-prices panel uses the sync Worker (`SYNC_WORKER_URL` + `SYNC_TOKEN`, already set up for the Facebook button).

## Image search and Google Lens
- **Looks like these on eBay**: every scan also runs eBay's official search-by-image on the first photo. The matching
  listings are shown on the result page and their titles are passed to the identifier as clues.
- **Lens** button under each photo: opens Google Lens with that photo. Google has no Lens API, so this uses a
  time-limited (1 hour) signed link to the photo; it isn't indexed and can't be guessed.

## Using it
1. Take or choose photos (labels, model numbers and damage help most). Photos are shrunk on the phone before upload.
2. Add a note if something isn't visible (tested/working, missing parts, size).
3. Identify & price → the item is named, with:
   - **Sold on eBay** – opens eBay's sold & completed results for that exact item (prices that actually sold)
   - **Terapeak research** – eBay's own 90-day sold-price tool
   - **Active listings** and a summary of current UK asking prices
4. Correct the draft, type the price, Save, then copy the title/specifics/description into eBay (Stage 2 will list directly).

Settings: `ANTHROPIC_MODEL` (optional) picks the Claude model; the house style is in `src/scan.ts`.
