// Checks the marketing site in website/ in a real browser.
//
//   node scripts/verify-website.mjs                      # serves website/ locally
//   node scripts/verify-website.mjs https://example.app  # checks a deployed URL
//   node scripts/verify-website.mjs <url> --attempts 10 --wait 30
//
// With --attempts, the whole suite re-runs until every check passes or the attempts
// run out. Use that against a fresh deploy that may still be building.
// Exits 0 when every check passes, 1 otherwise. The inquiry form is tested against a
// mocked FormSubmit endpoint, so no email is ever sent.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const website = path.join(root, 'website');

function loadPlaywright() {
  // Reuse the scraper's Playwright instead of adding a dependency to the site.
  // CI installs Playwright on its own and points NODE_PATH at it.
  try {
    return createRequire(path.join(root, 'webscraper', 'package.json'))('playwright');
  } catch {
    return createRequire(import.meta.url)('playwright');
  }
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const attempts = Math.max(1, flag('--attempts', 1));
const waitSeconds = Math.max(0, flag('--wait', 20));
const targetArg = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

const MOBILE_WIDTHS = [320, 375, 414, 768];
const ALL_WIDTHS = [...MOBILE_WIDTHS, 1280];
const MOBILE_BREAKPOINT = 960;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// Static server that behaves like Vercel for this site: /scraper rewrites to the
// scraper app, and unknown paths get 404.html with a 404 status.
function serveWebsite() {
  const server = createServer(async (req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/scraper' || (pathname.startsWith('/scraper/') && !path.extname(pathname))) {
      pathname = '/scraper/index.html';
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.join(website, pathname);
    try {
      if (!file.startsWith(website) || !(await stat(file)).isFile()) throw new Error('missing');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(await readFile(path.join(website, '404.html')));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runChecks(browser, base) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
  // A missing element fails that group of checks and the run moves on to the next group.
  const group = async (name, fn) => {
    try {
      await fn();
    } catch (err) {
      check(name, false, err.message.split('\n')[0]);
    }
  };
  const url = (p) => new URL(p, base).href;
  const year = String(new Date().getFullYear());

  const mockForm = (page, outcome) =>
    page.route('https://formsubmit.co/**', (route) =>
      outcome.value === 'ok'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' })
        : route.abort()
    );

  // Layout at every width: no horizontal scroll, and on touch sizes no field under 16px.
  for (const width of ALL_WIDTHS) {
    for (const pagePath of ['/', '/this-page-does-not-exist']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(url(pagePath), { waitUntil: 'load' });
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        view: document.documentElement.clientWidth,
        small: [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => el.name || el.id),
      }));
      check(`${pagePath} @${width}px: no horizontal scroll`, m.scroll <= m.view, `${m.scroll}px wide in ${m.view}px`);
      if (width < MOBILE_BREAKPOINT && pagePath === '/') {
        check(`/ @${width}px: form fields >= 16px`, m.small.length === 0, m.small.join(', '));
      }
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 375, height: 760 } });
  page.setDefaultTimeout(4000);
  const text = (sel) => page.textContent(sel).catch(() => '');
  const failed = [];
  page.on('response', (r) => {
    const sameSite = new URL(r.url()).origin === new URL(base).origin;
    if (sameSite && r.status() >= 400 && !r.url().includes('/api/posthog-config')) failed.push(`${r.status()} ${r.url()}`);
  });
  const formOutcome = { value: 'ok' };
  await mockForm(page, formOutcome);
  await page.goto(url('/'), { waitUntil: 'networkidle' });
  check('home: no failed same-site requests', failed.length === 0, failed.join(', '));

  // Head tags.
  const head = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    icon: document.querySelector('link[rel="icon"]')?.href || '',
  }));
  check('title is set and under 70 chars', head.title.startsWith('Pearfit') && head.title.length <= 70, head.title);
  check('meta description is 70-160 chars', head.description.length >= 70 && head.description.length <= 160, `${head.description.length} chars`);
  check('canonical link present', head.canonical, head.canonical);
  const icon = head.icon ? await page.request.get(head.icon) : null;
  check('favicon loads', icon?.ok(), head.icon);

  // Every link resolves: in-page anchors exist, same-site paths return 200.
  const hrefs = [...new Set(await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))))];
  const broken = [];
  for (const href of hrefs) {
    if (href === '#') broken.push('# (goes nowhere)');
    else if (href.startsWith('#')) {
      if (!(await page.$(href))) broken.push(href);
    } else if (href.startsWith('/')) {
      const r = await page.request.get(url(href.split('#')[0]));
      if (!r.ok()) broken.push(`${href} (${r.status()})`);
    } else if (!/^(mailto:|tel:|https?:)/.test(href)) broken.push(href);
  }
  check(`all ${hrefs.length} links resolve`, broken.length === 0, broken.join(', '));

  // Logo, email, footer.
  const logos = await page.$$eval('.brand-wordmark', (els) => els.map((e) => `${e.tagName}:${e.getAttribute('href')}`));
  check('header and footer logos link to /', logos.length >= 2 && logos.every((l) => l === 'A:/'), logos.join(', '));
  check('email is a mailto link', await page.$('a[href="mailto:customerservice@pearfit.app"]'));
  check('footer shows current copyright year', (await text('footer')).includes(`© ${year}`), year);

  await group('mobile menu works', async () => {
  const nav = '#primary-nav';
  const closedAtStart = !(await page.isVisible(nav));
  await page.click('#nav-toggle');
  const opens = (await page.isVisible(nav)) && (await page.getAttribute('#nav-toggle', 'aria-expanded')) === 'true';
  await page.keyboard.press('Escape');
  const escCloses = !(await page.isVisible(nav));
  await page.click('#nav-toggle');
  await page.click(`${nav} a[href="#faq"]`);
  const linkCloses = !(await page.isVisible(nav));
  check('mobile menu: hidden, opens, Escape closes, link closes', closedAtStart && opens && escCloses && linkCloses,
    JSON.stringify({ closedAtStart, opens, escCloses, linkCloses }));
  });

  await group('inquiry form messages work', async () => {
  const note = '#form-note';
  const fill = async () => {
    await page.fill('[name=name]', 'Verify Bot');
    await page.fill('[name=email]', 'verify@example.com');
    await page.fill('[name=store]', 'yourbrand.com');
  };
  await page.click('#pilot-submit-btn');
  check('form: empty submit shows an error message', (await page.getAttribute(note, 'class'))?.includes('form-error'), await text(note));
  await fill();
  await page.click('#pilot-submit-btn');
  const success = await page.waitForSelector('.form-success', { timeout: 5000 }).catch(() => null);
  check('form: accepted send shows a success message', success, await text(note));
  formOutcome.value = 'fail';
  await fill();
  await page.click('#pilot-submit-btn');
  const error = await page.waitForSelector('.form-error a[href^="mailto:"]', { timeout: 5000 }).catch(() => null);
  check('form: failed send shows an error with the email', error, await text(note));
  check('form: button is usable again after a send', !(await page.isDisabled('#pilot-submit-btn')));
  });
  await page.close();

  // Custom 404.
  const nf = await browser.newPage();
  const resp = await nf.goto(url('/this-page-does-not-exist'), { waitUntil: 'load' });
  check('unknown path returns 404 status', resp?.status() === 404, String(resp?.status()));
  check('unknown path shows the custom 404 page', (await nf.title()).includes('Page not found'), await nf.title());
  await nf.close();

  return results;
}

function checkPush() {
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout.trim();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  spawnSync('git', ['fetch', '-q', 'origin', branch], { cwd: root });
  const local = git('rev-parse', 'HEAD');
  const remote = git('rev-parse', `origin/${branch}`);
  const dirty = git('status', '--porcelain', '--', 'website');
  return [
    { name: `pushed: origin/${branch} matches local HEAD`, ok: Boolean(remote) && local === remote, detail: `${local.slice(0, 7)} vs ${remote.slice(0, 7) || 'none'}` },
    { name: 'no uncommitted changes in website/', ok: dirty === '', detail: dirty.replace(/\n/g, ', ') },
  ];
}

const { chromium } = loadPlaywright();
let server;
let base = targetArg;
if (!base) {
  server = await serveWebsite();
  base = `http://127.0.0.1:${server.address().port}/`;
}

let allOk = false;
for (let attempt = 1; attempt <= attempts && !allOk; attempt++) {
  const browser = await chromium.launch();
  let results;
  try {
    // In CI the checkout is the commit under test, so there is nothing to compare a push against.
    results = [...(targetArg || process.env.CI ? [] : checkPush()), ...(await runChecks(browser, base))];
  } catch (err) {
    results = [{ name: 'suite ran to completion', ok: false, detail: err.message.split('\n')[0] }];
  } finally {
    await browser.close();
  }
  allOk = results.every((r) => r.ok);
  console.log(`\nAttempt ${attempt}/${attempts} against ${base}`);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `  [${r.detail}]` : ''}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (!allOk && attempt < attempts) {
    console.log(`Retrying in ${waitSeconds}s…`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }
}

server?.close();
process.exit(allOk ? 0 : 1);
