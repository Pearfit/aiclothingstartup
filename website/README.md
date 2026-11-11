# Pearfit Marketing Site

Static landing page for **Pearfit**. No build step.

The page describes what exists today: a scraper that stores numerical fit values, and a separate comparison engine. The hero silhouette and the size matrix are samples. The ROI calculator uses the numbers a visitor types in.

## Contents
- `index.html` — Page markup.
- `styles.css` — Stylesheet, including a dark color scheme.
- `app.js` — Sample silhouette, sample size matrix, ROI model, and the inquiry form.
- `404.html` — Not-found page. Vercel serves it for any unknown path outside `/scraper`.
- `favicon.svg` — Site icon.

## Preview
Open `website/index.html` in a browser, or run `npx serve website`.

`website/vercel.json` is what `www.pearfit.app` deploys. `/` is this page and `/scraper` is the built scraper checked in under `website/scraper`. Refresh those files with `node scripts/assemble-site.mjs` from the repo root.

## Inquiries
The form posts the inquiry to `customerservice@pearfit.app` through FormSubmit. The first submission asks that inbox to confirm the address. After that, each form send delivers the email.

## Verify
From the repo root, `npm run verify:website` serves `website/` the way Vercel does and checks it in a
headless browser at 320 to 1280px: no horizontal scroll, 16px form fields on touch sizes, every link
resolves, favicon, title and description, logo links, mobile menu, copyright year, the inquiry form's
success and error messages (FormSubmit is mocked, so no email is sent), and the 404 page. It also
checks that your branch is pushed. Pass a URL to check a deploy, and `--attempts`/`--wait` to retry
while it builds:

```bash
node scripts/verify-website.mjs https://your-preview.vercel.app --attempts 10 --wait 30
```
