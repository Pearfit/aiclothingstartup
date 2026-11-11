# webscraper/AGENTS.md

Rules for work inside `webscraper/`. The repo-wide rules in `../AGENTS.md` still apply.
This is a separate app with its own `package.json`: an Express server (`server.ts`) plus a
React/Vite page (`App.tsx`) that scrapes product pages into fit values and size charts.

## Layout
- The source is flat on purpose (team decision, 2026-11-08): server, UI, tests and `fit_store.sql`
  sit directly in `webscraper/`. Do not add `src/`, `server/` or `supabase/` folders.
- A test sits beside the file it tests: `sizeChart.ts` and `sizeChart.test.ts`.
- `scripts/assemble-site.mjs` is a copy of `../scripts/vercel-directory-build.mjs`. Edit the
  original; see `../docs/deploy.md`.

## Scraper rules
- The measurement rules in `../docs/data-format.md` apply to every value this app stores. A size
  chart is saved in centimeters with chest pit-to-pit, and a value the page does not state is `null`.
- Fit values go to Supabase and review text stays in SQLite. Read `../docs/fit-store.md` before you
  change `fit_store.sql`, `supabaseFit.ts` or a key.
- `.env.example` here is committed with the project URL and publishable key on purpose, and the
  Vercel build reads it. Keep `SUPABASE_SECRET_KEY` empty in it.

## Commands (run from `webscraper/`; Node 22)
- Install: `npm install`
- Run locally: `npm run dev`, then open http://127.0.0.1:3000
- Tests: `npm test`
- Typecheck: `npm run lint`
- Build the page: `npm run build`

## Where to read next
| If you are about to... | Read first |
| --- | --- |
| Set up the fit store, or debug a "not writable" or missing `list_fit_catalog` message | `README.md` |
| Change how the scraper reaches pearfit.app | `../docs/deploy.md` |
