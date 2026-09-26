# OMEN V0 integration status

Canonical branch: `release/omen-v0-integration`
Canonical pull request: https://github.com/jacksonissacs/V_Omen_V/pull/17
Base: `main` at `d044ead2e627169b764ec223723f14af4680a919`

This file is a progress record for the integration owner. It is not independent approval, and nothing here is deployed.

## Code baseline

| Point | SHA | Role |
| --- | --- | --- |
| Inspected main | `d044ead2e627169b764ec223723f14af4680a919` | Unchanged base |
| Previously inspected integration head | `dba178754e813415851ee0c5d8e78bd066c8bb39` | Archive already connected to checkpoint replay |
| Pre-fix integration head | `47585114c0c91287005b367314b5cf43eaaab309` | Production workflow and Archive label fix already on the branch |
| Archive and history fix | `d6da4e8` | Stale replay, event selection, arbitrary-time page, source URL links |
| Vitest patch | `6cf4d8f` | `vitest@3.2.7` |
| Workflow readiness | `3b046c77c891422e063a44e8c3db796a614f83f6` | Wait for the selected checkpoint panel before reading it |

The branch tip that contains this file is the handoff head. Confirm it with `git rev-parse HEAD` and the pull request.

## What was already complete

At `4758511`, the branch already contained one canonical path:

- Temporal storage and `content_md5` checkpoints with decimal bigint ids
- Stored reconstruction, including pre-coverage and verification failure
- Honest Pulse
- Browser-local Following from PR #13
- CISA KEV intake bridged to the private publisher
- Archive reading checkpoint membership, not a scripted demo
- `test:workflow` on a production build, separate from the CISA smoke job
- Application CI success on that commit: run [36242515159](https://github.com/jacksonissacs/V_Omen_V/actions/runs/36242515159)

## Defects fixed after that head

1. Changing the Archive event kept the previous checkpoint id, so the next event was asked to replay another event's checkpoint.
2. "Load older checkpoints" could merge a late page into the event that was selected afterwards. A late replay response could also remain visible after a newer checkpoint was chosen. The view now hides a reconstruction that does not match the URL, and it drops a late page when the event or request generation has changed.
3. Archive checkpoint changes used `router.replace`, so browser Back did not return to the previous checkpoint URL. They now use `router.push`.
4. `/events/:id/history/:checkpointId?at=` and `?cutoff=` rendered the checkpoint. The history API already refused those queries. The page and its document title now refuse them without reading the checkpoint and without using the current title.
5. Evidence links accepted any stored URL string. Rendered links are limited to `http` and `https` URLs without embedded credentials.
6. `vitest@3.2.4` was in range for GHSA-5xrq-8626-4rwp (Vitest UI file read and execution). The suite runs `vitest run`, not the UI server. It is now `vitest@3.2.7`.

## Local checks

Recorded on this machine after the fixes, against disposable PostgreSQL 16 and Chrome at `/usr/local/bin/google-chrome`. Counts come from the runs, not from an older head.

| Check | Result |
| --- | --- |
| `npm ci` | PASS (install at the start of the session; lockfile then updated for vitest) |
| `npm run lint` | PASS |
| `npx next typegen` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 233 tests |
| `npm run build` | PASS — Next.js 16.3.4 |
| `npm run test:db` | PASS — 60 tests |
| `npm run test:workflow` | PASS — 31 tests. One run failed first because it read Archive before the checkpoint panel finished loading. The test now waits for that panel. The rerun passed. The dev server was `next start` after the production build. |
| `npm audit --json` | 5 advisories: 0 critical, 2 moderate, 3 high. See below. |
| `npm audit --omit=dev --json` | PASS — 0 advisories |
| `npm run intake:check` | NOT RUN locally in this pass. The previous CI job on `4758511` succeeded. It stays a separate CI job and is not part of `test:workflow`. |

`npm run test:workflow` covered the production loop: intake import without approval, explicit review, one publication, Pulse, event detail, evidence, Move Log, an earlier checkpoint, Return to present, correction stability, publication retry, Following across refresh, known and unknown checkpoint URLs, a fresh browser context, database outage, one observation, mobile and desktop, keyboard and command palette, and browser back/forward.

## Dependency advisories left in place

`npm audit fix --force` was not used.

| Package | Severity | Why it remains |
| --- | --- | --- |
| `vitest` and `@vitest/mocker` | moderate | GHSA-82fw-gwwq-j7x9. The patched line is vitest 4.1.11 or newer. npm's non-breaking fix now reports vitest 5.0.2, a major bump. The test script is `vitest run`, not the browser UI or the redirect mock server. |
| `puppeteer-core`, `@puppeteer/browsers`, `extract-zip` | high | GHSA-jmr9-qjv8-65gv and GHSA-7pqw-9j4j-h8q3. The fix is `puppeteer-core@25.12.0`. Workflow tests launch system Chrome through `puppeteer-core` and do not download a browser with `extract-zip`. A major bump was not applied. |

No production dependency advisory was reported.

## Superseded pull requests

These stay open. This list is a recommendation, not a close action.

| PR | Recommendation | Evidence |
| --- | --- | --- |
| #8 | Incorporated | `origin/cursor/trustworthy-temporal-storage-df20` has no commits that are absent from this branch. |
| #10 | Superseded by #12, which is incorporated | The remaining commit is patch-equivalent. The only file on that branch and not here is the removed scripted `archive-screen.tsx`. |
| #12 | Incorporated | No commits absent from this branch. |
| #13 | Incorporated | No commits absent from this branch. Following tests still cover refresh, empty watchlists, storage failure, catalog gaps, tab sync, and demo/database separation. |
| #16 | Incorporated | Intake modules and the publication bridge are on this branch. The branch does not add a file this head lacks except the removed scripted Archive screen. |
| #9 | Superseded | It still adds `src/app/api/archive/reconstruct/route.ts` and a separate reconstruction mapper. Archive on this branch uses checkpoint discovery and `reconstructEvent`. |
| #11 | Superseded by the reconciled reader | Its stored-reconstruction commit is not patch-equivalent. This branch already has the decimal-id `content_md5` reader, migration `0003`, and history routes. |
| #14 | Publishing incorporated; watchlist not imported | `src/lib/watchlist-storage.ts` exists only on that branch. PR #13 is the Following implementation. |
| #15 | Superseded by this branch | It uses `content_md5`, and it adds no file that this head lacks. Later Archive and workflow commits continued here. |
| #18 | Do not merge | Migration `0003` on that branch uses `content_sha256`. Its readiness ideas are already adapted here (`domcontentloaded`, workspace readiness, failure artifacts, separate CISA job). |
| #7 | Not part of this integration | Docs-only beta gap matrix. It is not a product blocker and was not edited here. |

## Owner gates

- Independent review of PR #17. This record is a self-review by the implementation agent.
- Merge to `main`, when the reviewer accepts it.
- Whether to close the superseded pull requests above.
- Whether to take the major vitest and puppeteer upgrades.
- Authentication, billing, public writes, production database changes, and deployment. None of those were started.

## Self-review

Reviewed the diff from `4758511` to this status commit. Confirmed the checkpoint identity is still `content_md5` and decimal ids, publication still goes through `writeEventBundle`, and database failure paths were not pointed at demo data. The new Archive state gate hides a reconstruction whose checkpoint id does not match the URL. The history page refuses `at` and `cutoff` before `reconstructEvent`. This is not an approval to merge or launch.
