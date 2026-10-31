// Headless-browser page loader for live storefronts.
//
// Most retailers (H&M, UNIQLO, ...) load reviews with JavaScript after the page
// renders, so a plain HTTP fetch never sees them. This loads the page in Chromium,
// scrolls to trigger lazy review widgets, clicks "load more" buttons, and pulls out
// each review card as a text block for parseRawReviewBatch.
//
// It deliberately does NOT try to evade bot protection: no stealth plugins, no
// spoofed fingerprints, no CAPTCHA solving. It honours robots.txt, and if a site
// blocks automated access it reports that and stops.

import type { Browser, Page } from 'playwright';
import { normalizeFitTag, type RawScrapedReview } from './src/utils/fitAnalyzer.ts';

export interface RenderedPage {
  status: number;
  finalUrl: string;
  html: string;
  reviewBlocks: string[];
  // Structured reviews read from the storefront's own paginated reviews API, if
  // the page used one.
  apiReviews: RawScrapedReview[];
}

export class ScrapeBlockedError extends Error {}

const USER_AGENT_TOKEN = 'FitPulseBot';
const NAV_TIMEOUT_MS = 45_000;
const STEP_WAIT_MS = 1_500;
const MAX_REVIEWS = Number(process.env.MAX_REVIEWS_PER_PRODUCT || 500);
const MAX_SCROLL_ROUNDS = 80;
const API_PAGE_DELAY_MS = 800;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import('playwright').then(({ chromium }) =>
      chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
    );
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function isBrowserAvailable(): Promise<boolean> {
  try {
    await getBrowser();
    return true;
  } catch {
    return false;
  }
}

// Minimal robots.txt check: applies the "*" and FitPulseBot groups, longest match wins.
async function isAllowedByRobots(target: URL): Promise<boolean> {
  if (process.env.IGNORE_ROBOTS_TXT === 'true') return true;
  let text: string;
  try {
    const res = await fetch(new URL('/robots.txt', target.origin), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return true;
    text = await res.text();
  } catch {
    return true;
  }

  const rules: { allow: boolean; path: string }[] = [];
  let groupApplies = false;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      const applies = value === '*' || value.toLowerCase() === USER_AGENT_TOKEN.toLowerCase();
      groupApplies = lastWasAgent ? groupApplies || applies : applies;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (groupApplies && (key === 'allow' || key === 'disallow') && value) {
      rules.push({ allow: key === 'allow', path: value });
    }
  }

  const path = target.pathname + target.search;
  let best: { allow: boolean; path: string } | null = null;
  for (const rule of rules) {
    const pattern = new RegExp(
      '^' + rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')
    );
    if (pattern.test(path) && (!best || rule.path.length > best.path.length)) best = rule;
  }
  return !best || best.allow;
}

export async function renderProductPage(
  url: string,
  { maxLoadMoreClicks = 15 }: { maxLoadMoreClicks?: number } = {}
): Promise<RenderedPage> {
  const target = new URL(url);
  if (!(await isAllowedByRobots(target))) {
    throw new ScrapeBlockedError(
      `${target.hostname}'s robots.txt disallows automated access to this page.`
    );
  }

  const browser = await getBrowser();
  const context = await browser.newContext({ locale: 'en-CA' });
  // tsx/esbuild wraps named functions in a __name() helper; define it in the page so
  // functions passed to page.evaluate still run.
  await context.addInitScript('window.__name = (fn) => fn;');
  const page = await context.newPage();
  // Remember paginated review API calls the page itself makes, e.g.
  // UNIQLO's /products/<id>/reviews?limit=5&offset=0.
  const reviewApiCalls: { url: string; headers: Record<string, string> }[] = [];
  page.on('response', (res) => {
    const u = res.url();
    if (
      /review/i.test(new URL(u).pathname) &&
      /[?&](offset|page|start)=\d+/i.test(u) &&
      /json/i.test(res.headers()['content-type'] || '') &&
      res.ok()
    ) {
      // Keep the app's own x-* headers (e.g. UNIQLO's x-fr-clientid) to repeat them.
      const headers = Object.fromEntries(
        Object.entries(res.request().headers()).filter(([k]) => k.startsWith('x-'))
      );
      reviewApiCalls.push({ url: u, headers });
    }
  });
  const apiFound = () => reviewApiCalls.length > 0;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const title = (await page.title()).toLowerCase();
    if (status === 403 || status === 429 || /access denied|captcha|are you a robot|verify you are human/.test(title)) {
      throw new ScrapeBlockedError(
        `${target.hostname} blocked automated access (HTTP ${status}). FitPulse does not bypass bot protection.`
      );
    }

    const reviewBlocks = await collectReviewBlocks(page, maxLoadMoreClicks, apiFound);
    const html = await page.content();

    // Product pages often show a handful of reviews and link to a full reviews page.
    const allReviewsHref = await page.evaluate(findAllReviewsLinkInPage);
    if (!apiFound() && allReviewsHref && new URL(allReviewsHref).origin === target.origin) {
      if (await isAllowedByRobots(new URL(allReviewsHref))) {
        await page.goto(allReviewsHref, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        for (const block of await collectReviewBlocks(page, maxLoadMoreClicks, apiFound)) {
          if (!reviewBlocks.includes(block)) reviewBlocks.push(block);
        }
      }
    }

    const apiReviews = reviewApiCalls.length
      ? await pageThroughReviewApi(page, reviewApiCalls[0]).catch(() => [])
      : [];

    return { status, finalUrl: page.url(), html, reviewBlocks, apiReviews };
  } finally {
    await context.close();
  }
}

// Requests further pages from the review API the storefront already called, from
// inside the page (same origin and session the site uses), until every review is
// fetched or the cap is reached.
async function pageThroughReviewApi(
  page: Page,
  sample: { url: string; headers: Record<string, string> }
): Promise<RawScrapedReview[]> {
  const base = new URL(sample.url);
  const pageParam = ['offset', 'start', 'page'].find((p) => base.searchParams.has(p))!;
  const byPage = pageParam === 'page';
  // Ask for bigger pages to cut the number of requests, stepping down to the site's
  // own page size if the API refuses (UNIQLO caps it at 25).
  const siteLimit = base.searchParams.get('limit');
  const limitLadder =
    siteLimit && !byPage ? [50, 25, Number(siteLimit)].filter((n, i, a) => n >= Number(siteLimit) && a.indexOf(n) === i) : [];
  if (limitLadder.length) base.searchParams.set('limit', String(limitLadder.shift()));

  const seen = new Set<string>();
  const reviews: RawScrapedReview[] = [];
  let cursor = byPage ? 1 : 0;

  for (let requestCount = 0; requestCount < 200 && reviews.length < MAX_REVIEWS; requestCount++) {
    const url = new URL(base);
    url.searchParams.set(pageParam, String(cursor));
    if (requestCount > 0) await new Promise((r) => setTimeout(r, API_PAGE_DELAY_MS));
    const json = await page.evaluate(
      async ([u, headers]) => {
        const res = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json', ...headers } });
        return res.ok ? res.json().catch(() => null) : null;
      },
      [url.toString(), sample.headers] as const
    );
    const items = json ? findReviewArray(json) : null;
    if (!items || items.length === 0) {
      if (reviews.length === 0 && limitLadder.length) {
        base.searchParams.set('limit', String(limitLadder.shift()));
        continue;
      }
      break;
    }

    let added = 0;
    for (const item of items) {
      const review = toRawReview(item, reviews.length);
      const key = String(item.reviewId ?? item.id ?? review?.body ?? '');
      if (!review || seen.has(key)) continue;
      seen.add(key);
      reviews.push(review);
      added++;
    }
    const total = findTotal(json);
    if (added === 0 || (total !== undefined && seen.size >= total)) break;
    cursor += byPage ? 1 : items.length;
  }
  return reviews;
}

const TEXT_KEYS = ['comment', 'reviewText', 'body', 'text', 'content', 'reviewBody'];
const RATING_KEYS = ['rate', 'rating', 'ratingValue', 'stars', 'score'];

function findReviewArray(node: any, depth = 0): any[] | null {
  if (!node || typeof node !== 'object' || depth > 5) return null;
  if (Array.isArray(node)) {
    const first = node.find((x) => x && typeof x === 'object');
    if (first && TEXT_KEYS.some((k) => typeof first[k] === 'string') && RATING_KEYS.some((k) => first[k] != null)) {
      return node;
    }
    return null;
  }
  for (const value of Object.values(node)) {
    const found = findReviewArray(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function findTotal(json: any): number | undefined {
  const candidates = [
    json?.result?.pagination?.total,
    json?.pagination?.total,
    json?.totalResults,
    json?.total,
    json?.totalCount,
    json?.result?.total,
  ];
  const n = candidates.find((v) => typeof v === 'number');
  return n;
}

const FIT_SCALE: Record<number, string> = {
  1: 'Runs Small',
  2: 'Slightly Small',
  3: 'True to Size',
  4: 'Slightly Large',
  5: 'Runs Large',
};

function toRawReview(o: any, index: number): RawScrapedReview | null {
  const pick = (keys: string[]) => keys.map((k) => o?.[k]).find((v) => v != null && v !== '');
  const asText = (v: any) => (v && typeof v === 'object' ? v.name ?? v.value ?? v.label ?? '' : v ?? '');

  const size = String(asText(pick(['purchasedSize', 'sizePurchased', 'sizeBought', 'size', 'purchasedSizeName']))).trim();
  const body = String(pick(TEXT_KEYS) || '').trim();
  if (!size || !body) return null; // can't attribute fit without a size

  const rawRating = Number(pick(RATING_KEYS));
  const rawFit = pick(['fit', 'fitRating', 'howItFits', 'sizeFit']);
  const declaredFitTag =
    typeof rawFit === 'number' ? FIT_SCALE[Math.round(rawFit)] : rawFit ? normalizeFitTag(String(asText(rawFit))) : undefined;

  const rawDate = pick(['createDate', 'submissionTime', 'date', 'createdAt', 'datePublished']);
  const date =
    typeof rawDate === 'number'
      ? new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate).toISOString().slice(0, 10)
      : String(rawDate || '').slice(0, 10);

  return {
    id: `api-rev-${o.reviewId ?? o.id ?? index + 1}`,
    author: String(pick(['name', 'nickname', 'userNickname', 'author']) || `Reviewer #${index + 1}`),
    sizePurchased: size,
    rating: Number.isFinite(rawRating) && rawRating > 0 ? Math.min(5, Math.max(1, Math.round(rawRating))) : 3,
    title: String(pick(['title', 'headline']) || body.slice(0, 48)),
    body,
    date,
    verifiedPurchase: true,
    declaredFitTag,
    reviewerHeight: String(pick(['heightRange', 'height']) || '') || undefined,
  };
}

async function collectReviewBlocks(
  page: Page,
  maxLoadMoreClicks: number,
  apiFound: () => boolean
): Promise<string[]> {
  // Open a collapsed reviews tab/accordion if there is one.
  await clickFirstVisible(page, /^(customer\s+)?reviews?(\s*\(\s*\d+\s*\))?$/i);

  // Keep scrolling (for lazy widgets and infinite scroll) and clicking "load more"
  // until the number of review cards stops growing.
  let blocks: string[] = [];
  let stalledRounds = 0;
  for (let round = 0; round < MAX_SCROLL_ROUNDS && blocks.length < MAX_REVIEWS; round++) {
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(300);
    }
    if (round < maxLoadMoreClicks) {
      await clickFirstVisible(
        page,
        /^(load|show|see|view|read)\s+(more|all)(\s+reviews?)?(\s*\(\s*\d+\s*\))?$|^more reviews$/i
      );
    }
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(STEP_WAIT_MS);

    const next = await page.evaluate(extractReviewBlocksInPage);
    stalledRounds = next.length > blocks.length ? 0 : stalledRounds + 1;
    blocks = next;
    // Once the page's reviews API has been seen, pageThroughReviewApi fetches the rest.
    if (stalledRounds >= 2 || (apiFound() && round >= 1)) break;
  }
  return blocks.slice(0, MAX_REVIEWS);
}

// Runs inside the page: the href of a "See all N reviews" style link, if any.
function findAllReviewsLinkInPage(): string | null {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const link =
    // e.g. UNIQLO: a "(467)" count linking to .../reviews
    links.find((a) => /\/reviews?\/?$/i.test(a.pathname) && !a.search) ||
    links.find((a) =>
      /^(see|view|read|show)\s+all(\s+\d+)?\s+reviews?(\s*\(\s*\d+\s*\))?$|^all reviews$/i.test((a.innerText || '').trim())
    );
  return link && !link.getAttribute('href')!.startsWith('#') ? link.href : null;
}

// Clicks the first visible button whose text matches. Links are only clicked when
// they don't navigate away (no href or a "#" href).
async function clickFirstVisible(page: Page, pattern: RegExp): Promise<boolean> {
  const candidates = page.locator('button, [role="button"], a:not([href]), a[href="#"], a[href^="#"]');
  const count = Math.min(await candidates.count(), 400);
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    const text = ((await el.innerText().catch(() => '')) || '').trim();
    if (!text || text.length > 60 || !pattern.test(text)) continue;
    if (!(await el.isVisible().catch(() => false))) continue;
    try {
      await el.click({ timeout: 3_000 });
      return true;
    } catch {
      // Covered or detached; try the next one.
    }
  }
  return false;
}

// Runs inside the page. Finds the elements that label a reviewer's purchased size,
// then climbs to the largest ancestor that still holds exactly one such label:
// that ancestor is one review card.
function extractReviewBlocksInPage(): string[] {
  const SIZE_LABEL =
    /\b(purchased size|size purchased|size bought|bought size|size ordered|size worn|size\s*:\s*\S+.*\b(fit|fits)\b)/i;
  const FIT_LABEL = /\b(how it fits|fit\s*[:\-]|runs? (small|large|big)|true to size|a bit (tight|loose))\b/i;

  const all = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
  const labels = all.filter((el) => {
    if (el.children.length > 3) return false;
    const text = el.innerText || '';
    return text.length < 160 && SIZE_LABEL.test(text);
  });
  // Keep only the innermost matches.
  const leaves = labels.filter((el) => !labels.some((other) => other !== el && el.contains(other)));

  const countLabels = (root: Element) => leaves.filter((l) => root.contains(l)).length;
  const cards = new Set<HTMLElement>();
  for (const leaf of leaves) {
    let card: HTMLElement = leaf;
    while (card.parentElement && card.parentElement !== document.body && countLabels(card.parentElement) === 1) {
      card = card.parentElement;
    }
    cards.add(card);
  }

  const blocks: string[] = [];
  for (const card of cards) {
    let text = (card.innerText || '').replace(/\s*\n\s*/g, ' | ').trim();
    if (text.length < 30 || !(FIT_LABEL.test(text) || SIZE_LABEL.test(text))) continue;
    // Star ratings are usually icons; read them from aria-labels or titles.
    const ratingHost = Array.from(card.querySelectorAll('[aria-label],[title]')).find((el) =>
      /\d(\.\d)?\s*(out of|\/|of)\s*5/i.test(el.getAttribute('aria-label') || el.getAttribute('title') || '')
    );
    const ratingText = ratingHost?.getAttribute('aria-label') || ratingHost?.getAttribute('title') || '';
    const rating = ratingText.match(/(\d(?:\.\d)?)\s*(?:out of|\/|of)\s*5/i)?.[1];
    if (rating && !/\bRating\s*[:=-]/i.test(text)) text = `Rating: ${rating} | ${text}`;
    // Normalise "Purchased size | M" (label and value in separate elements) to "Purchased size: M".
    text = text.replace(/\b(purchased size|size purchased|size bought|size ordered|size)\s*:?\s*\|\s*/gi, '$1: ');
    blocks.push(text);
  }
  return blocks;
}
