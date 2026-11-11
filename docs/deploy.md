# Deploy

Read this before you change `website/`, `scripts/`, a `vercel.json` or `.github/workflows/pages.yml`.

## What deploys from where
| Target | Source | Config |
| --- | --- | --- |
| `www.pearfit.app` (Vercel project rooted at `website/`) | `website/` as checked in; no build step | `website/vercel.json` |
| Vercel project rooted at the repo root | `scripts/assemble-site.mjs` builds `site/` and `api/` | `vercel.json` |
| GitHub Pages | `website/` uploaded as-is on a push to `main` that touches `website/**` | `.github/workflows/pages.yml` |

`/` is the marketing page and `/scraper` is the scraper app. `/scraper/api/*` is rewritten to the
serverless function `api/scraper/[[...path]].js`.

## Generated files (do not edit by hand)
`node scripts/assemble-site.mjs`, run from the repo root, builds the scraper and rewrites these:
- `website/scraper/**`: the built scraper page.
- `website/api/scraper/[[...path]].js`: the bundled scraper server.
- `website/api/scraper/.env.example`: a copy of `webscraper/.env.example`.
- `site/` and `/api/`: gitignored build output for the repo-root project.

The files under `website/` are checked in because the `website/` project has no build step. A
scraper change reaches `www.pearfit.app` only after you rerun the script and commit its output.

## Rules
- Everything in `website/` is published. Do not put notes, agent files or secrets there.
- `scripts/vercel-directory-build.mjs` is the original for two copies:
  `webscraper/scripts/assemble-site.mjs` and `website/scraper/scripts/assemble-site.mjs`. A Vercel
  project rooted at one of those folders still runs the repo build command, which looks for
  `scripts/assemble-site.mjs`. Edit the original, then update the copies.
- The root `vercel.json` and `website/vercel.json` carry the same rewrites and function settings.
  Change both together.
- The root `package.json` and `website/package.json` exist only to install the scraper function's
  native dependencies on Vercel. They are not a workspace.

## Related
- What the hosted scraper can and cannot do (SQLite lifetime, headless budget): `webscraper/README.md`.
- The marketing page itself: `website/README.md`.
