# Minimal defect list — October baseline 2026-10-07

Milestone: **FAIL**. One product defect blocks checks 1, 2, 3, 4, 5, and 8. Checks 6 and 7 passed. Nothing below is an environment block.

## D1 — No real AI-tech event with demo intelligence disabled

The clean commit has no stored real or current AI-tech event once the seeded book is refused.

| | |
| --- | --- |
| SHA | `aea8636c555736de9d61110abc8a05a173a67d79` |
| Server | `next start`, `NODE_ENV=production`, `OMEN_STORAGE_MODE=database` |
| Database | Disposable schema-only database. `SELECT count(*) FROM events` returned 0. See `event-count.txt`. No workflow fixture was upserted. |
| Command / route | `GET /api/events` → `200` `{"storage":"database","provenance":"none","events":[]}`. Browser `/pulse` and `/events`. |
| Observed | Heading Pulse: **No events in the book yet**. Heading Explore: **0 events in view · 0 in the book**. No `/events/` links. Chip **No data** plus **PostgreSQL**. Seeded titles are absent from these pages. |
| Evidence | `browser/discover-pulse-1440.png`, `browser/discover-pulse-390.png`, `browser/discover-explore-1440.png`, `api-transcript.txt` |
| Defect | Discover cannot pass. Understand, provenance, Follow, Return, and the proof walk have no real event to open. |

Do not satisfy D1 by loading `src/data/events.ts`, `db/fixtures/test-workflow/`, or any substitute row.

## Checks that fail only because of D1

| Check | Observed on the same server | Evidence |
| --- | --- | --- |
| 2 Understand | No brief. `eventHrefs` empty. | `browser-report.json` |
| 3 Evidence / provenance | No source name or URL. Chip text is **No data**, computed display `flex` at 390×844. | `browser/discover-pulse-390.png` |
| 4 Follow | `/watchlists` heading Following, body **Nothing followed**. | `browser/return-following-1440.png` |
| 5 Return | Archive shows the empty checkpoint chooser. No completed history for a real event. | `browser/return-archive-1440.png` |
| 8 Proof run | `/` → “Explore the demo” → `/pulse` stops on **No events in the book yet**. | `browser/proof-02-after-cta-pulse-1440.png` |

## Not defects for this milestone

- Check 6 passed. Production demo mode and unset mode do not serve the seeded book. See `api-transcript.txt`, `browser/quarantine-pulse-1440.png`, `browser/quarantine-markets-1440.png`. `/graph` is HTTP 404 with the framework line “This page could not be found.” and no fixture figures (`browser/quarantine-graph-1440.png`).
- Check 7 passed on this run. Historical CI is separate: https://github.com/jacksonissacs/V_Omen_V/actions/runs/37131563152
- Share was not scored.
- The public page `/` still shows illustrative seeded titles (“Bank of Canada cuts rates in October”, “Frontier model released before December 1”) under the line that the demo is illustrative. That page is not Pulse or Explore. It was not used as a Discover pass.
- Archive’s storage sentence on the empty database says “Storage: database · Data unavailable.” while the top bar says **No data**. Observed only. Not an October row, and not repaired in this pass.
- Synthetic workflow screenshots under `synthetic-controls/` show `[SYNTHETIC TEST]` events. They are regression controls for checks 6 and 7. They are not a real AI-tech event.
