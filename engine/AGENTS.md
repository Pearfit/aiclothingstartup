# engine/AGENTS.md

Rules for work inside `engine/`. The repo-wide rules in `../AGENTS.md` still apply.
The data format is fixed by the team: read `../docs/data-format.md` before you touch a measurement,
a wardrobe file or a candidate file.

## Architecture
- `engine/src/` is the matching engine: pure functions, no I/O, no network, no LLM, no framework
  imports. Shared types live in `engine/src/types.ts`.
- `engine/cli/` does file loading/validation and the terminal runners. It calls the engine;
  the engine never calls it.

## Engine rules
- Weights, thresholds and the % scale live in `engine/src/config.ts`, one config per garment
  category. No magic numbers elsewhere.
- Missing dimensions must not make a shirt look closer: normalize by the weights actually present.
- The review signal only breaks ties between close sizes; it never overrides measurements.
- Every engine change ships with a unit test using hand-computed numbers.

## Commands (engine, run from `engine/`; Node 22.18+)
- Install dev deps: `npm install`
- Recommend: `npm run recommend -- <owner> [candidateId]`
- Eval against ground truth: `npm run eval`
- Tests: `npm test`
- Typecheck: `npm run typecheck`

## Where to read next
| If you are about to... | Read first |
| --- | --- |
| Run scraped data, read the eval's miss analysis, or add wardrobes, candidates or cases | `README.md` |
| Change what the engine optimizes for, or what counts as a correct eval case | `docs/model-decisions.md` |
| Use the team's real Pilot 1 wardrobes | `docs/wardrobe-test-data.md` |
| Read candidates from Supabase (`cli/export-candidates.ts --source supabase`) | `../docs/fit-store.md` |
