# October baseline matrix — 2026-10-07

**Decision: FAIL.** 2 of 8 checks passed. No row is environment-blocked. Share is not a row.

| Field | Value |
| --- | --- |
| Baseline SHA | `aea8636c555736de9d61110abc8a05a173a67d79` |
| Checkout | Clean detached worktree `/tmp/omen-004-baseline`. `git status --porcelain` empty before the first command and after every command. |
| Agent | Same Grok 4.7 agent `bc-105e4c9a-0993-440d-b397-f14cc50b9491` |
| Product server | `next start`, `NODE_ENV=production` |
| Real-event book | Fresh migrated empty database `omen_004_baseline_empty`, identity `test`, zero rows in `events`. Dropped after the capture. |
| Synthetic controls | `npm run test:workflow` on the same SHA. Not used as Discover proof. |

| # | Check | Result | Class | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Discover | **FAIL** | product-failed | Pulse and Explore on the empty production database show no event. `GET /api/events` is `200` `{"storage":"database","provenance":"none","events":[]}`. `events` count is 0. Screenshots `browser/discover-pulse-1440.png`, `browser/discover-pulse-390.png`, `browser/discover-explore-1440.png`. |
| 2 | Understand | **FAIL** | product-failed | No event link exists to open. `eventHrefs` is `[]` on Pulse and Explore. No brief, question, current state, or supporting evidence was shown. |
| 3 | Evidence / provenance | **FAIL** | product-failed | No source name or URL is on screen because no event is on screen. The chip is **No data**, display `flex` at 390. That is an empty-book label, not source identity for an AI-tech event. |
| 4 | Follow | **FAIL** | product-failed | There is no real event to follow. `/watchlists` says **Nothing followed**. Screenshot `browser/return-following-1440.png`. |
| 5 | Return | **FAIL** | product-failed | Following has no followed event. Archive has no published checkpoint for a real event. Screenshot `browser/return-archive-1440.png`. |
| 6 | Reality guard | **PASS** | pass | Workflow suite exit 0 on this SHA, and its `headSha` is this SHA. Production `OMEN_STORAGE_MODE=demo` and unset mode return `503` `{"storage":"misconfigured","error":"Event storage is unavailable"}` with no `evt-boc-cut`. Legacy routes are 404 without fixture copy. Pulse in demo-production mode says **Workspace data unavailable**, not the seeded book. |
| 7 | Regression | **PASS** | pass | This baseline, not the historical Actions run: `npm ci` 0, `npm run lint` 0, `npx next typegen` 0, `npm run typecheck` 0, `npm test` 0 (48 files, 338 tests), `npm run build` 0, `npm run test:db` 0 (6 files, 79 tests), `npm run test:workflow` 0 (2 files, 33 tests). Log: `commands.log`. |
| 8 | Proof run | **FAIL** | product-failed | One production browser session opened `/`, activated “Explore the demo”, and landed on `/pulse`. The walk stopped there: **No events in the book yet**. No Brief, Evidence, Follow, or Archive checkpoint followed. Screenshots `browser/proof-01-marketing-1440.png`, `browser/proof-02-after-cta-pulse-1440.png`. |

Historical CI, not this baseline: https://github.com/jacksonissacs/V_Omen_V/actions/runs/37131563152 succeeded on this SHA on 2026-10-03, including lint, typegen, typecheck, unit, build, database, and production workflow. The Pages site is not product QA. This run’s job list has `application` and `External source smoke` only.
