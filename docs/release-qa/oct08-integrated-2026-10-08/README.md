# OCT08 integrated V0 proof

This is an isolated integration of two pinned heads. It does not replace either original branch.

| Input | SHA |
| --- | --- |
| PR #34 `cursor/d1-real-event-publish-0343` | `1fa914127bf6bb56978eb8debe7fcd61eb645734` |
| PR #36 `cursor/task14-brief-action-row-a822` | `1629bff1534c0f5997626b6a2ec7263ee529f8a3` |
| Recorded `main` | `aea8636c555736de9d61110abc8a05a173a67d79` |
| Integrated commit | `d4ee41203a6474ae06a5982aaf34a905a3ab46b3` |
| Integrated tree | `00913940fb5e59f96c97270b191e663ad130f903` |

Parents of `d4ee412` are the two pins, in that order. The merge auto-merged `event-intelligence-view.test.tsx`. There were no conflict markers.

Product diff of `d4ee412` against tested publication code `79596c41232b092dbf5640979039d14f49a0d83c` is only:

- `src/app/aion-workspace.css`
- `src/components/intelligence/event-intelligence-view.tsx`
- `src/components/intelligence/event-intelligence-view.test.tsx`

Those are the PR #36 brief-action placement: Inspect evidence, Follow, and Open recorded history sit after the question and before the full resolution rule. Phone action controls use a 44px minimum height.

Both original branch tips still matched these pins when this pack was written. This commit does not update them.

## Deploy stay-off

`.github/workflows/application-ci.yml` runs on push to `main` and `cursor/omen-v0-event-detail-94d3`, and on pull requests to `main`. It has no deploy job. `.github/workflows/cloud-agent-environment.yml` runs on pull requests that change `.cursor` or that workflow. No pull request was opened for this integration branch, so neither workflow runs from the branch push.

## Checks on `d4ee412`

Clean tree. `commands.log`. Fresh `npm ci`, then lint, `npx next typegen`, typecheck, unit, build, database, and workflow. All exited 0.

| Check | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run lint` | exit 0 (two existing warnings in the PR #36 capture script) |
| `npx next typegen` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 48 files, 345 tests passed |
| `npm run build` | exit 0 |
| `npm run test:db` | 6 files, 81 tests passed |
| `CHROME_PATH=/usr/bin/chromium npm run test:workflow` | 2 files, 33 tests passed |

Prior separate-PR CI was not counted as this combined run.

## Disposable publication

New local database on `127.0.0.1` only, identity `development` / `oct08 integrated disposable`, migrations 0001–0010. Not a hosted or production database.

`intake stage` then `review approve` left the event count at 0. `publish approved` with the existing idempotency key inserted one sourced event. Replay of the same key did not add a second checkpoint. `checkpoint verify --id 1` returned ok.

Stored observation: probability `94.50`, `observed_at` `2026-10-07 14:50:34.604+00`, `captured_at` `2026-10-07 14:53:51.789+00`, provenance `sourced`. Three evidence rows, reliability null. Google `source_published_at` `2026-09-30 20:00:00+00`. Polymarket publication times null. One checkpoint, sequence 1. Zero move logs.

The 7 October quote is the stored historical observation. It is not relabeled as an 8 October market quote. The brief says the observation is not a live feed.

## Browser proof

`next start` of this build, `NODE_ENV=production`, `OMEN_STORAGE_MODE=database`, port `3310`.

`harness/walk.mjs` drives headed Chromium on the local display and records one continuous ffmpeg session per viewport. `browser/oct08-desktop-walkthrough.mp4` is the 1440×900 page. `browser/oct08-phone-walkthrough.mp4` is the 390×844 page. Both files are 1920×1200 screen recordings of that Chromium window, about 9 seconds, H.264. They are the live session, not a slideshow.

Each recording goes Pulse → brief → keyboard Inspect evidence → Follow → reload → Following → `/archive?event=evt-gemini-4-public-2026-10-31&checkpoint=1`, then a reduced-motion reload. Stills from the same sessions are `browser/desktop-*.png` and `browser/phone-*.png`.

Phone action row, measured in the 390×844 viewport: Inspect evidence, Follow, and Open recorded history are each 44px tall and sit above the resolution rule. `browser/phone-02-brief-actions.png`.

Phone evidence after scroll: `browser/phone-source-polymarket-gamma-api.png`, `browser/phone-source-polymarket.png`, `browser/phone-source-google-blog.png`. Visible text includes the source name, Sourced, Not recorded, and either Not stated by source or 30 Sept, 20:00 UTC.

Follow storage after reload: `omen-v0-following/v1/database` with `evt-gemini-4-public-2026-10-31` and `userSaved: true`. A separate fresh context stays on Nothing followed after refresh (`browser/empty-following-refresh.png`).

Archive deep link keeps `checkpoint=1` and shows verified checkpoint #1, the stored question, and 94.5% on the desktop reconstruction (`browser/desktop-07-archive.png`).

Reduced motion: the action button computed `transition-duration` is `0s`.

## Reality guard

| Surface | Result |
| --- | --- |
| `GET /api/events` on 3310 | 200, one event, timestamp `2026-10-07T14:50:34.604Z` |
| Demo mode port 3312 `GET /api/events` | 503 `{"storage":"misconfigured","error":"Event storage is unavailable"}` |
| Unset mode port 3314 | same 503 misconfigured body |
| Database pointed at a missing local database, port 3316 | 503 `{"storage":"database","error":"Event storage is unavailable"}` |
| `/markets` `/signals` `/agents` `/research` `/relations` `/alerts` `/graph` | 404 |
| Pulse on demo, unset, and the missing database | Data unavailable / Workspace data unavailable |
| Seeded Bank of Canada / `evt-boc-cut` text | absent from the sourced Pulse page |

## Eight rows on the combined candidate

| # | Row | Result |
| --- | --- | --- |
| 1 | Discover | PASS |
| 2 | Understand | PASS |
| 3 | Evidence / provenance | PASS |
| 4 | Follow | PASS |
| 5 | Return / Archive | PASS |
| 6 | Reality guard | PASS |
| 7 | Regression | PASS |
| 8 | Proof run | PASS |

This implementer does not treat that table as independent review, and it does not certify `main` or any deployment.

## Safe sequence for a later owner decision

Review `d4ee412` and this evidence commit first. The two original pulls combine without conflicts, so a later merge of PR #34 and then PR #36 (or the reverse) is the sequence that keeps each pull's history. Do not merge this integration branch in place of that review. No merge and no deploy is authorized here.
