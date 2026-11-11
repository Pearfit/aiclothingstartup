# Fit store (Supabase and SQLite)

Read this before you touch Supabase, SQLite, `webscraper/fit_store.sql` or any key.

## The rule
- Supabase is the team's shared fit store (adopted Nov 2026). The scraper pushes fit values to
  the shared Supabase project via the `commit_fit_report` RPC. Review text stays in SQLite
  (`webscraper/commercial_fit.db`). The candidate export (`engine/cli/export-candidates.ts`) can read
  its source rows from the shared Supabase store with `--source supabase`; local SQLite is the default
  and the fallback. Only `engine/cli/` does that I/O: the engine (`engine/src/`) stays pure and never
  touches Supabase or the network. The publishable/anon key is safe to commit — tables have RLS, anon
  can only write through the commit function, and can read only the three export tables
  (`commercial_skus`, `sku_size_chart`, `brand_offsets`) through select policies in
  `webscraper/fit_store.sql`; `SUPABASE_SECRET_KEY` goes in `.env.local`, never committed. Auth is not
  in use yet.

## Where things are
| What | Where |
| --- | --- |
| Schema, RLS policies, RPCs (`commit_fit_report`, `list_fit_catalog`, `delete_fit_sku`) | `webscraper/fit_store.sql` |
| Scraper's Supabase client | `webscraper/supabaseFit.ts` |
| Engine-side read for the export | `engine/cli/export-candidates.ts` |
| Project URL and publishable key | `webscraper/.env.example` (committed on purpose) |
| Key names the engine export needs | `engine/.env.example` |
| First-time setup and the delete-SKU behavior | `webscraper/README.md` |
| An old sample dump of the scraper's tables | `data/samples/scraper-commercial-db-dump.sql` |
