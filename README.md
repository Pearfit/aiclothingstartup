# aiclothingstartup

Pearfit: a store-agnostic clothing size predictor. It tells a shopper what size to buy and which
shirt they already own it fits like.

## Map
| Folder | What it is | Start with |
| --- | --- | --- |
| `engine/` | The matching engine and its terminal runners | `engine/README.md` |
| `webscraper/` | The scraper app that collects fit values and size charts | `webscraper/README.md` |
| `website/` | The marketing page, published as-is | `website/README.md` |
| `scripts/` | Build scripts for the Vercel deploy | `docs/deploy.md` |
| `data/samples/` | Sample scraper output, for reference only | |
| `docs/` | Background and cross-cutting reference | `docs/README.md` |

Working rules for people and AI agents are in `AGENTS.md`.

## Run the scraper

```bash
cd webscraper
npm install
npm run dev
```

Open http://127.0.0.1:3000. Fit numbers are pushed to the shared Supabase project. See `webscraper/README.md`.

## Run the engine

```bash
cd engine
npm install
npm run recommend -- sample
```

See `engine/README.md`.


Copyright (c) 2026 Jinyu Chen Jchen@pearfit.app
Copyright (c) 2026 Nicolas Roguski Croguski@pearfit.app
Copyright (c) 2026 Dima Sotnikov Dsotnikov@pearfit.app
Copyright (c) 2026 Alvin Sheng Asheng@pearfit.app
Copyright (c) 2026 Steven Liu Sliu@pearfit.app
All rights reserved.
