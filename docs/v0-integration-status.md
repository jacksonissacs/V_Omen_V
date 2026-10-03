# OMEN V0 integration status

**Main integration:** merged via [PR #17](https://github.com/jacksonissacs/V_Omen_V/pull/17) on 2026-09-26.

| Point | SHA | Role |
| --- | --- | --- |
| Pre-integration `main` | `d044ead2e627169b764ec223723f14af4680a919` | Last commit before V0 core integration |
| Reviewed integration head | `92a6c8b2c3c75d562e8ecd56a77bcf18e4f0a234` | Independent review target; matched PR #17 head at merge |
| Merge commit on `main` | `1ee56266f01e0776c73c6aab10038da7d49d8a4d` | Normal merge of `release/omen-v0-integration` |
| Post-merge `main` tip | `1ee56266f01e0776c73c6aab10038da7d49d8a4d` | Same as merge commit (no follow-up commits yet) |

Post-merge Application CI: [run 36263316414](https://github.com/jacksonissacs/V_Omen_V/actions/runs/36263316414) — **success** (`application`, External source smoke).

Nothing in this record is deployed. Production database operations were not started.

## Merged on `main` (V0 core loop)

These capabilities are on `main` after PR #17:

- **Temporal storage** — migrations `0002`–`0005`, decimal bigint checkpoint ids, `content_md5` digests, schema version 5
- **Stored historical reconstruction** — history API and pages, verification failures surfaced honestly
- **Honest Pulse** — no fabricated metrics or unsupported “live” indicators
- **Browser-local Following** (PR #13 path) — durable watchlist per storage scope
- **CISA KEV source intake** — manual review queue, no auto-publish
- **Operator publishing** — private CLI path through `writeEventBundle` (watchlist from PR #14 not imported)
- **Archive checkpoint replay** — real checkpoint discovery and reconstruction (scripted demo Archive screen removed)
- **Production workflow proof** — `npm run test:workflow` in Application CI on `next start` + disposable PostgreSQL
- **External source smoke** — separate job for `npm run intake:check`

## Explicitly not merged

| Item | Status |
| --- | --- |
| [PR #18](https://github.com/jacksonissacs/V_Omen_V/pull/18) | **Open — do not merge.** Competing migration `0003` uses `content_sha256`; readiness ideas were adapted on the merged path. |
| PR #14 watchlist storage | Not imported; Following uses PR #13 |
| Superseded feature PRs (#8–#16 branches) | Content incorporated or superseded; closing those PRs is an owner choice |
| [PR #7](https://github.com/jacksonissacs/V_Omen_V/pull/7) beta gap matrix | Docs-only; not part of this integration |

## Independent review (PR #17)

Verdict at reviewed head `92a6c8b`: **READY FOR MERGE** with nonblocking follow-ups.

Archive **Medium** findings (pagination + replay error handling) were accepted as post-merge work. Draft issue bodies live in:

- [.github/issue-drafts/archive-a1-deep-link-pagination.md](../.github/issue-drafts/archive-a1-deep-link-pagination.md)
- [.github/issue-drafts/archive-a2-replay-error-clears-list.md](../.github/issue-drafts/archive-a2-replay-error-clears-list.md)

GitHub Issues are **disabled** on this repository; the integration agent could not open live issue URLs. Enable Issues in repository settings and file from those drafts (or import the bodies) to obtain trackable issue links.

Other review notes (not blocking merge):

- **Following (Low):** cross-tab sync when another tab clears or corrupts localStorage — see `src/lib/following/following-store.ts` `replaceFromStorageInternal`
- **Archive (Low):** optional skip of client refetch when SSR already supplied a matching reconstruction
- **Dev dependency advisories:** vitest 4+/5 and puppeteer-core major bumps deferred — see table below

## Remaining beta / owner gates

- Close or redirect superseded open PRs (#8–#16, #9, #11, #15, etc.)
- Resolve dev dependency advisories (major vitest / puppeteer upgrades)
- Archive follow-ups A1 and A2 (and optional Following tab-sync tests)
- Authentication, billing, public writes, production database provisioning, deployment — **not started**; require explicit owner approval per [omen-v0-build-contract.md](omen-v0-build-contract.md)

## Dependency advisories (unchanged at merge)

`npm audit fix --force` was not used. No production dependency advisory was reported at integration time.

| Package | Severity | Why it remains |
| --- | --- | --- |
| `vitest` and `@vitest/mocker` | moderate | GHSA-82fw-gwwq-j7x9; patched line is vitest 4.1.11+ (npm suggests 5.x major) |
| `puppeteer-core`, `@puppeteer/browsers`, `extract-zip` | high | GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3; fix is puppeteer-core 25.12.0 major |

Critical Vitest UI advisory GHSA-5xrq-8626-4rwp is addressed by `vitest@3.2.7` on `main`.

## Historical baseline (pre-merge branch)

For archaeology, the integration branch accumulated these notable commits after base `d044ead`:

| Commit | Role |
| --- | --- |
| `47585114c0c91287005b367314b5cf43eaaab309` | Production workflow + Archive label |
| `d6da4e8` | Stale replay, event selection, arbitrary-time refusal, source URL links |
| `6cf4d8f` | Vitest 3.2.7 |
| `3b046c7` | Workflow waits for Archive checkpoint panel |
| `92a6c8b` | Integration status + final Archive/history fixes |
