# D1 rerun matrix — 2026-10-07

Tested code SHA: `79596c41232b092dbf5640979039d14f49a0d83c`

Clean worktree, porcelain empty, before the first command. Commands and exit codes: `commands.log`.

Production servers were `next start` on that worktree after `npm run build`. Database mode used disposable database `omen_d1_receipt_20261007` (development identity, migrations 0001–0010). The event was created by `intake stage`, `review approve`, then `publish approved`. It was not inserted first and was not published with `publish run`.

| # | Check | Result | Class | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Discover | **PASS** | pass | Pulse and Explore show “Gemini 4.0 released by October 31, 2026?” at 1440 and 390. Provenance chip Sourced. `browser/discover-pulse-1440.png`, `browser/discover-explore-390.png`. |
| 2 | Understand | **PASS** | pass | Brief shows the question, current probability 94.5%, one observation, change not computable, and three evidence records. `browser/brief-evidence-1440.png`. |
| 3 | Evidence / provenance | **PASS** | pass | Polymarket gamma API, Polymarket, and Google blog are named. Sourced is visible. At 390 the `event-provenance` chip display is `flex`, not `none` (`browser/report.json`). Reliability is “Not recorded”. Polymarket source publication is “Not stated by source”. |
| 4 | Follow | **PASS** | pass | Follow writes `omen-v0-following/v1/database` with `evt-gemini-4-public-2026-10-31`. The Unfollow control and that key survive reload. |
| 5 | Return | **PASS** | pass | `/watchlists` lists the event after reload. Archive opens checkpoint id 1 at `/archive?event=evt-gemini-4-public-2026-10-31&checkpoint=1`. `browser/return-following-1440.png`, `browser/return-archive-1440.png`. |
| 6 | Reality guard | **PASS** | pass | `npm run test:workflow` exit 0. No seeded titles in the production pages. `OMEN_STORAGE_MODE=demo` and unset mode: `GET /api/events` is 503 `{"storage":"misconfigured","error":"Event storage is unavailable"}`. `/markets`, `/signals`, `/agents`, `/research`, `/relations`, `/alerts`, `/graph` are 404. `/pulse` shows Data unavailable. `api-transcript.txt`. |
| 7 | Regression | **PASS** | pass | `npm ci`, `npm run lint`, `npx next typegen`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db`, `CHROME_PATH=/usr/bin/chromium npm run test:workflow` all exit 0. Historical CI https://github.com/jacksonissacs/V_Omen_V/actions/runs/37131563152 is context only. |
| 8 | Proof run | **PASS** | pass | One Chromium session on `next start`: Pulse → brief → evidence → follow → reload → Following → Archive checkpoint. `browser/report.json`. |
| | **This rerun** | **8/8** | | Independent review of this pack is still required. Share is not a row. |

Synthetic workflow screenshots stay inside the workflow suite artifacts and are not this event.
