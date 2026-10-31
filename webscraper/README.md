# FitPulse scraper

Scrapes customer reviews from apparel product pages and turns them into a per-size fit report
(runs small / true to size / runs large), stored in a local SQLite database (`commercial_fit.db`).

## Run it on your machine

```bash
bun install                # npm install hits an esbuild peer-dependency conflict
npm run setup:browser      # one-time: downloads the Chromium build Playwright uses
npm run dev                # http://localhost:3000
```

Paste a product URL into the app, or use the command line:

```bash
npm run scrape -- https://www.uniqlo.com/ca/en/products/E450179-000/00
npm run scrape -- --file urls.txt
```

## How live pages are scraped

Most storefronts load reviews with JavaScript after the page renders, so the scraper opens each
URL in headless Chromium. It:

1. scrolls the page and opens a collapsed reviews section,
2. if the page calls a paginated reviews API (UNIQLO does), requests the remaining pages from inside
   the page, the same way the site loads more reviews,
3. otherwise clicks "load more" buttons, follows a "see all reviews" link on the same site, and reads
   each review card,
4. keeps only reviews that state the purchased size. A review with no size can't be attributed to
   one, so it's skipped rather than guessed.

The scraper does not try to get around bot protection. It honours `robots.txt` and doesn't use
stealth plugins, spoofed fingerprints or CAPTCHA solving. If a site blocks it (HTTP 403/429 or a
challenge page), that URL is reported as blocked and skipped. Check each retailer's terms of use
before scraping it at volume.

Pages that don't need a browser still work if Chromium isn't installed: the server falls back to a
plain HTTP fetch, which is enough for sites that render reviews server-side or in JSON-LD.

## Hands-off mode

List product URLs in a file (one per line, `#` for comments) and set:

| Variable | Effect |
| --- | --- |
| `SCRAPE_URLS_FILE=urls.txt` | Scrape every URL in the file at startup |
| `RESCRAPE_INTERVAL_HOURS=24` | Re-scrape the file's URLs and every stored product on this interval |
| `SCRAPE_DELAY_SECONDS=5` | Pause between products (default 5) |
| `MAX_REVIEWS_PER_PRODUCT=500` | Cap per product (default 500) |
| `CHROMIUM_PATH=/path/to/chrome` | Use a specific Chromium/Chrome binary |

```bash
SCRAPE_URLS_FILE=urls.txt RESCRAPE_INTERVAL_HOURS=24 npm run dev
```

Re-scraping a URL updates its existing record (the SKU comes from the page's product ID or the URL).
To run on a schedule without keeping the server's timer, call the CLI from cron while the server
is running, e.g. `0 6 * * * cd /path/to/webscraper && npm run scrape -- --file urls.txt`.

## API

- `POST /api/scrape` — `{ "url": "..." }` or `{ "rawHtml": "..." }` (pasted page source or review text)
- `POST /api/scrape/batch` — `{ "urls": ["...", "..."] }`
- `GET /api/db/records`, `GET /api/db/dump.sql`, `GET /api/db/dump.json`, `DELETE /api/db/sku/:sku`
