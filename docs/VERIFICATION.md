# Verification report (30 September 2026)

**Important:** nothing here has connected to your real eBay account. All eBay behaviour was tested against a
local mock of eBay's OAuth and Trading API endpoints built from eBay's documented request/response format.
The first real run happens after the setup steps in the README.

## Checks that were run

| Check | How | Result |
|---|---|---|
| Type checks (site and Worker) | `tsc --noEmit` on both projects | Pass |
| Production builds | `wrangler pages functions build`, `wrangler deploy --dry-run` | Pass (site functions 75 KB, Worker 170 KB) |
| Automated tests | `npm test`: 20 tests with mock eBay + in-memory SQLite standing in for D1 | 20 / 20 pass |
| Real Worker, end-to-end | `wrangler dev` Worker → local mock eBay → local D1 → live-mode site | Pass (details below) |
| Browser tests | Playwright/Chromium against the local live-mode site | 43 / 43 pass |
| Secret exposure | Scanned site files, rendered pages, Worker bundle and Worker logs | No secrets found |

### Sync behaviour covered by automated tests
Multi-page fetch (4 pages) · new, changed, ended and sold-out listings · pruning of old snapshots ·
persistent page failure keeps previous catalogue and removes partial rows · transient errors retried 3 times then
give up · rate limit (HTTP 429) not retried · total-count mismatch rejected · listings changing mid-sync
(one retry, then fail safely) · >50% drop refused unless forced · zero items refused unless forced ·
expired access token refreshed once · rejected refresh token fails with a clear message · overlapping runs blocked
by the lock, expired lock taken over · cron interval gating · database failure while publishing keeps the old
snapshot · auction / Best Offer / quantity / picture / category parsing · eBay item IDs kept as exact strings ·
logs scrub secrets and tokens.

### End-to-end run (real Worker code, mock eBay)
- Manual sync without or with a wrong token: **401**.
- Manual sync: published **58** listings across 3 pages; the ended and sold-out fixtures were left out.
- Injected an HTTP 502 on page 2: retried and completed.
- Scheduled trigger straight after a sync: correctly skipped (not due).
- Site `/api/status` reported the new snapshot; demo mode refused on a production hostname (**503**).

### Browser checks (live mode, mock data)
Header search · category filter and sort reflected in the URL · price ordering · "Clear filters" · category-only
filters land on `/category/…` · pagination (24 per page, last page, disabled Next) · empty search state ·
every card's "View on eBay" goes to its own listing · auction shows bid wording, no Product markup ·
fixed-price Product JSON-LD with GBP offer · no review/rating markup · gallery thumbnails · ended listing returns
**410** · skip link first in tab order, visible focus outline · all form controls labelled · no broken images or
missing alt text · mobile menu opens, closes with Escape and returns focus · mobile tap targets ≥ 24 px ·
no horizontal overflow at 320, 390 and 768 px, including **200% text size** at 320 and 390 px · menu visible
without JavaScript · menu button keeps its accessible name at 320 px · no console errors (the only logged
error is the deliberate 410).

Also checked by hand: stale data (last sync 9+ hours old) hides all prices, shows the refresh notice and drops
Product markup; `robots.txt`, sitemap, canonical and `noindex` rules behave correctly on production vs preview
hostnames.

## Fixed during verification
- Hero headline and item details overflowed at 200% text size on small phones.
- Menu button had no accessible name at very narrow widths.
- About-band button inherited the serif font.
- Placeholder "music" photo from the mock-up showed a recognisable album cover; replaced with plain record spines.

## Not verified (needs your accounts or a real deployment)
- A real eBay connection: OAuth consent, GetSellerList against your ~500 live listings, real field values.
  Two points to watch on the first run: whether eBay accepts the `OutputSelector` trimming (switchable off),
  and whether any of your listings use multi-variation or unusual formats.
- Deployment on Cloudflare itself (Pages Git build, Workers Builds, D1 binding, cron firing on schedule).
- Real Workers Free vs Paid CPU usage (the local benchmark strongly suggests Paid is required).
- Screen-reader testing with NVDA/VoiceOver, and Safari/Firefox rendering (only Chromium was automated).
