# OMEN beta gap matrix

Audit of what exists for a working MVP and a monetizable public beta. This document records observed state. It does not change product scope, merge pull requests, or authorize production writes.

**First audit:** 2026-09-25  
**Recheck:** 2026-09-26 (live; earlier findings updated, not assumed)  
**Repository:** `jacksonissacs/V_Omen_V`  
**Product line audited:** `origin/main` @ `d044ead2e627169b764ec223723f14af4680a919` (PR [#6](https://github.com/jacksonissacs/V_Omen_V/pull/6) merged 2026-09-25)  
**Open integration:** PR [#8](https://github.com/jacksonissacs/V_Omen_V/pull/8) `cursor/trustworthy-temporal-storage-df20` @ `eddc175` (Task 04A — trustworthy temporal storage)  
**This docs branch:** `cursor/beta-gap-inventory-6a92` (see PR [#7](https://github.com/jacksonissacs/V_Omen_V/pull/7) for commit SHA after the recheck commit)

Related progress, blockers, and the next three tasks: [launch-progress.md](launch-progress.md).

## Status vocabulary

A cell may carry more than one label. Labels are not interchangeable.

| Label | Means |
| --- | --- |
| **absent** | No implementation in the named tree |
| **illustrative** | UI, copy, or fixtures that look like the feature but are demo, hardcoded, or non-durable |
| **implemented** | Working code exists in the named tree |
| **merged** | Present on `main` |
| **configured** | Env, CI, hosting, or ops config exists |
| **verified** | A named check was actually run in this audit and passed |
| **deployed** | A hosted surface exists. The surface is named; do not read this as “the Next.js app is in production” |

Never treat a missing check as passing.

## Historical findings rechecked

Prior audit (2026-09-25) used `main` @ `9c1aace` and open PR #6 @ `8afd1ed`. Rechecked on 2026-09-26 after `git fetch origin main`.

| Prior finding (2026-09-25) | Current fact (2026-09-26) |
| --- | --- |
| `main` at `9c1aace` | **Superseded.** `origin/main` is `d044ead` — merge of PR #6 (`Integrate OMEN V0 Tasks 02–03 into main`). |
| PR #6 open @ `8afd1ed` | **Superseded.** PR #6 is **merged**. Head at merge: `d044ead`. |
| PR #6 contains PostgreSQL + honest event detail | **Still true, now on `main`.** Tasks 02–03 landed as one integration. |
| PRs #4 and #5 merged into stacked branches, not `main` | **Historical only.** Their work arrived on `main` through PR #6. |
| Following is browser memory only | **Still true on `main`.** `WorkspaceProvider` `useState<Set<string>>`; no write API or per-user store. |
| Archive is a labeled scripted demo | **Still true on `main`.** `archive-screen.test.tsx` + demo notice; no stored as-of read. |
| Database CLI rejects production writes | **Still true on `main`.** `scripts/omen-db.ts` guards. |
| Event metadata lacks full historical versioning | **Still true on `main` @ `d044ead`.** Append-only observations, evidence, Move Logs; mutable `events` fields on upsert. **Task 04A (PR #8)** adds `event_revisions` + `record_available_at`; not merged. |
| No verified CI on integration head | **Superseded on `main`.** `.github/workflows/application-ci.yml` runs lint, typecheck, unit tests, build, and `test:db` with a Postgres service. Latest PR #6 checks reported **pass** before merge. |
| `docs/database.md` absent on `main` | **Superseded.** Present on `main` after PR #6. |
| `npm ci` fails on `main` (picomatch) | **Superseded.** Lockfile fixed on landed integration; `npm ci` **passes** on `main` @ `d044ead` in this recheck. |
| GitHub Pages serves README, not Next.js | **Still true.** https://jacksonissacs.github.io/V_Omen_V/ — Jekyll README site; `/pulse` is not hosted there. |

## Area matrix

Statuses are for **`main` @ `d044ead`** unless a column names an open PR.

### 1. Homepage and public demo

| | `main` @ `d044ead` |
| --- | --- |
| Status | **implemented**, **merged**, **illustrative** data, locally **verified** |

**Evidence:**

- Route: `src/app/(marketing)/page.tsx` — Hero → Preview → Walkthrough → Pulse → Archive → Ledger → Relations → Methodology → FAQ → Final CTA.
- Demo fixtures: `src/lib/marketing/demo-data.ts`. Honesty copy in `hero.tsx`; CTA **Explore the demo → `/pulse`**.
- Tests: `landing-page.test.tsx`, `walkthrough.test.tsx`, `spectrum-stage.test.tsx`, `demo-data.test.ts`.

**Gap:** Public marketing is a local demo, not a hosted Next.js site. GitHub Pages does not serve this route.

### 2. Pulse and event detail

| | `main` @ `d044ead` |
| --- | --- |
| Status | **implemented**, **merged**, observation-driven detail, locally **verified** |

**Evidence:**

- `IntelligenceRepository` + `OMEN_STORAGE_MODE` (`demo` / `database`): `src/lib/data/repository.ts`, `postgres-repository.ts`.
- Pulse, Events, detail: workspace routes + `event-intelligence-view.tsx` — chart/table from `probabilitySeries`; Observed / Interpretation / Still unknown; Inspect evidence + Follow; storage/provenance chips in `top-bar.tsx`.
- Domain: `src/lib/domain/probability-history.ts`, `event-chronology.ts`.
- Tests: `workspace-routes.test.tsx`, `event-intelligence-view.test.tsx`, `mock-repository.test.ts`, `data-boundary.test.ts`.
- `inspectEvidence` scroll guard: unit suite exits 0 (`70ece6c`).

### 3. Evidence and published Move Logs

| | `main` @ `d044ead` | PR #8 (open) |
| --- | --- | --- |
| Status | **implemented** (append-only tables + CLI). Not **verified** in this pod (`test:db` blocked). | Adds `record_available_at` on history rows; unchanged Move Log rules |

**Evidence (`main`):**

- Tables: `db/migrations/0001_core_event_storage.sql` — `evidence`, `move_logs`, `move_log_revisions`.
- Writer/reader: `event-store.ts`, `event-reader.ts`, `scripts/omen-db.ts`.
- Fixtures: `db/fixtures/demo-evt-boc-cut.json`, `.correction.json`.
- No public HTTP write.

### 4. Database migrations and persistence

| | `main` @ `d044ead` | PR #8 (open) |
| --- | --- | --- |
| Status | **implemented**, **merged**, not **verified** in this environment | **implemented** migration `0002_trustworthy_temporal_storage.sql`; not **merged** |

**Evidence (`main`):**

| Path | Role |
| --- | --- |
| `docs/database.md` | Modes, schema, write safety, limitations |
| `db/migrations/0001_core_event_storage.sql` | V0 core schema |
| `src/lib/db/*`, `postgres-repository.ts` | Config, migrator, I/O |
| `vitest.db.config.ts`, `postgres.db.test.ts` | Disposable-DB suite |
| Scripts | `typecheck`, `test:db`, `db:migrate`, `db:status`, `db:upsert`, `db:show` |

**PR #8:** `event_revisions`, `omen_history_coverage`, projection guard, populated-DB migration realignment (see PR #8 description).

### 5. Historical reconstruction

| | `main` @ `d044ead` | PR #8 (open) |
| --- | --- | --- |
| Status | **illustrative** Archive; stored as-of UI **absent** | Storage groundwork for reconstruction; workspace Archive still demo |

**Evidence (`main`):**

- Workspace Archive: `archive-screen.tsx` — scripted slider; labeled demo (`archive-screen.test.tsx`).
- Schema holds timestamped observations, evidence, revisions; no read path uses an as-of timestamp in the UI.

### 6. Authentication and operator authorization

| | `main` |
| --- | --- |
| Status | **absent** |

No auth middleware or roles. `/team` is a static utility screen. Deferred per build contract (owner approval).

### 7. Persistent per-user Following

| | `main` |
| --- | --- |
| Status | **implemented** in-session; persistence **absent** |

Seed ids from fixtures / `followed_by_default` column when in database mode; client `toggleWatch` only.

### 8. Ingestion and scheduled jobs

| | `main` |
| --- | --- |
| Status | **absent** |

CLI upsert only; no workers or cron.

### 9. Notifications

| | `main` |
| --- | --- |
| Status | **illustrative** |

Static alerts page; settings checkbox local-only.

### 10. Billing and server-side entitlements

| | `main` |
| --- | --- |
| Status | **absent** |

### 11. CI, deployment, and monitoring

| | `main` @ `d044ead` |
| --- | --- |
| Status | Application CI **configured** on `main` (workflow merged with PR #6). GitHub Pages **deployed** (README only). Local checks **verified** below. Monitoring **absent**. |

**Evidence:**

- `.github/workflows/application-ci.yml` — `npm ci`, lint, typecheck, unit tests, build, `test:db` with Postgres service.
- `gh pr checks 6` before merge: **application pass**.
- Pages: https://jacksonissacs.github.io/V_Omen_V/ — README, not the Next.js app.
- No production Next.js host config in repo.

## HTTP surface

| Route | `main` @ `d044ead` |
| --- | --- |
| `GET /api/events`, `GET /api/events/:id` | **implemented**, **merged** — `storage`, `provenance`, `503` on store failure |
| POST / PUT / PATCH / DELETE | **absent** (CLI only) |

## Work to integrate, not reimplement

**Land PR #6 — done.** Tasks 02–03 are on `main` @ `d044ead`. Do not rebuild that stack.

**Land PR #8 (Task 04A)** when review and checks are green. Do not reimplement:

- Migration `0002`, `event_revisions`, `record_available_at`, coverage baseline
- Write-path revision appends and Grok review fixes on branch `cursor/trustworthy-temporal-storage-df20`

Leave for later: auth, billing, ingest, per-user Following, stored Archive UI, hosted production database, Next.js deployment.

## Baseline checks

Commands on **2026-09-26** against `main` @ `d044ead` (merged into this docs branch before the recheck commit). Node from environment; npm from project.

This cloud pod has **no** `OMEN_TEST_DATABASE_ADMIN_URL` / local PostgreSQL admin.

### `main` @ `d044ead` (recheck)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | **PASS** | exit 0 |
| `npm test` | **PASS** | 22 files, **146** tests, exit 0 |
| `npm run lint` | **PASS** | exit 0 |
| `npm run typecheck` | **PASS** | `tsc --noEmit`, exit 0 |
| `npm run build` | **PASS** | Next.js 16.3.4; app routes built |
| `npm run test:db` | **BLOCKED** (this pod) | `OMEN_TEST_DATABASE_ADMIN_URL` unset — disposable PostgreSQL not configured here. CI job on GitHub **does** run `test:db` with a service container. |

Browser click-through of the running app was **not** performed in either audit pass.

### 2026-09-25 “unverified” rows — recheck summary

See [launch-progress.md — 2026-09-25 list](launch-progress.md#2026-09-25-list--recheck-on-main--d044ead-2026-09-26). In short: PR #6 unit exit 1, empty `gh pr checks`, lockfile `npm ci` failure, and missing `typecheck` / `test:db` scripts on **`main` @ `9c1aace`** are **resolved** on **`main` @ `d044ead`**. **`npm run test:db` in a pod without `OMEN_TEST_DATABASE_ADMIN_URL`**, **GitHub Pages (README only)**, and **database mode / Following / Archive against a live store** remain **unverified or unchanged**.

### Prior audit snapshot (`main` @ `9c1aace`, 2026-09-25)

Kept for history: 75 unit tests; `npm ci` **BLOCKED** on lockfile; no `typecheck` / `test:db` scripts; PR #6 worktree 145 tests with exit 1 (`scrollIntoView`).
