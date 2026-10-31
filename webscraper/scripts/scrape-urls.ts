// Scrape product URLs through a running FitPulse server and store the reports.
//
//   npm run scrape -- https://www2.hm.com/... https://www.uniqlo.com/...
//   npm run scrape -- --file urls.txt      (one URL per line, # for comments)
//
// FITPULSE_URL overrides the server address (default http://localhost:3000).

import { readFileSync } from 'fs';

const server = process.env.FITPULSE_URL || 'http://localhost:3000';
const args = process.argv.slice(2);
const urls: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') {
    urls.push(
      ...readFileSync(args[++i], 'utf8')
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*/, '').trim())
        .filter(Boolean)
    );
  } else {
    urls.push(args[i]);
  }
}

if (urls.length === 0) {
  console.error('Usage: npm run scrape -- <url...>  or  npm run scrape -- --file urls.txt');
  process.exit(1);
}

const res = await fetch(`${server}/api/scrape/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls }),
});
const body = (await res.json()) as {
  results?: { url: string; ok: boolean; name?: string; totalReviews?: number; error?: string }[];
  error?: string;
};
if (!res.ok || !body.results) {
  console.error(body.error || `Server returned HTTP ${res.status}`);
  process.exit(1);
}
for (const r of body.results) {
  console.log(r.ok ? `OK    ${r.name} (${r.totalReviews} reviews)  ${r.url}` : `FAIL  ${r.url}\n      ${r.error}`);
}
process.exit(body.results.every((r) => r.ok) ? 0 : 2);
