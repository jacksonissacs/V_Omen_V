# OMEN beta gap matrix

Audit of what exists for a working MVP and a monetizable public beta. This document records observed state. It does not change product scope, merge pull requests, or authorize production writes.

**Audited:** 2026-09-25  
**Repository:** `jacksonissacs/V_Omen_V`  
**Audited branch / SHA:** `main` @ `9c1aace947b2d3a17ca15e16503055a8b059ac49`  
**Open integration PR:** [#6](https://github.com/jacksonissacs/V_Omen_V/pull/6) `cursor/omen-v0-event-detail-94d3` @ `8afd1eda0ef707132eaff1b55fb7e6378447ca00`

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

These were prior inspection notes. Rechecked against current refs; none were assumed.

| Prior finding | Current fact |
| --- | --- |
| `main` at `9c1aace` | **Still true.** `origin/main` after `git fetch origin main` is `9c1aace947b2d3a17ca15e16503055a8b059ac49` (`Merge pull request #3`). Working tree on this audit branch started clean at that SHA. |
| PR #6 open, integration head `8afd1ed` | **Still true.** Only open PR. Head `8afd1eda0ef707132eaff1b55fb7e6378447ca00`. Base `main`. `MERGEABLE` / `CLEAN`. 14 commits, 60 files, +5899 / −458. |
| PR #6 contains PostgreSQL persistence and honest event-detail work | **Still true.** Tasks 02–03. See [Work to integrate, not reimplement](#work-to-integrate-not-reimplement). |
| Following is browser memory only | **Still true on `main` and on PR #6.** `WorkspaceProvider` keeps a `useState<Set<string>>`. No write API, no `localStorage`, no per-user table. |
| Archive is a clearly labeled scripted demo | **True on PR #6 only.** On `main`, Archive is still a scripted demo but its copy claims reconstruction (`archive-screen.tsx`). PR #6 relabels it: “Demo of planned point-in-time reconstruction” and a notice that controls do not query stored records. |
| Database commands reject production writes | **True on PR #6 only.** Absent on `main`. `scripts/omen-db.ts` refuses `migrate` / `upsert` when `NODE_ENV`, `VERCEL_ENV`, or `OMEN_DEPLOYMENT_ENV` is `production`, and writes only to an identified `development` / `test` / `demo` database. |
| Event metadata lacks full historical versioning | **Still true on PR #6.** Observations, evidence, and Move Log revisions are append-only. Mutable `events` fields (title, question, status, deadline, criteria, `display`) are overwritten on upsert. Documented in PR #6 `docs/database.md`. |
| No verified CI on the integration head | **Still true.** `gh pr checks 6` → `no checks reported`. `statusCheckRollup` is `[]`. There is no `.github/workflows` on `main` or on PR #6. |

Additional current facts that were not in the prior note:

- PRs #4 and #5 show **MERGED**, but they merged into stacked feature branches, not into `main`. PR #4 base was `cursor/omen-v0-data-boundary-93d8`; PR #5 base was `cursor/omen-v0-postgres-event-storage-93d8`. `main` still ends at PR #3.
- `origin/cursor/omen-v0-postgres-event-storage-93d8` is `17fb42e` (`Merge pull request #5`). That commit is a merge of the event-detail branch; it adds no unique feature commits beyond PR #6’s head.
- GitHub Pages is **configured** and **deployed** for `main` at https://jacksonissacs.github.io/V_Omen_V/. It serves the repository README as a Jekyll page, not the Next.js app.
- `docs/database.md` is **absent on `main`**. It exists on PR #6.

## Area matrix

Statuses are given for **`main` @ `9c1aace`** and **PR #6 @ `8afd1ed`**.

### 1. Homepage and public demo

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **implemented**, **merged**, **illustrative** data, locally **verified** | Same product surface; marketing tests still pass |

**Evidence (`main`):**

- Route: `src/app/(marketing)/page.tsx` — Hero → Preview → Walkthrough → Pulse → Archive → Ledger → Relations → Methodology → FAQ → Final CTA.
- Layout and tokens: `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/marketing.css`.
- Components: `src/components/marketing/{hero,preview-section,walkthrough,feature-sections,faq-section,final-cta,site-header,site-footer,spectrum-stage}.tsx`.
- Demo fixtures: `src/lib/marketing/demo-data.ts`. Design source: `design-reference/omen-site/`.
- Honesty copy: `hero.tsx` — “illustrative data. Nothing on this page is a live feed or a performance claim.” CTA is **Explore the demo → `/pulse`**. No signup form (`README.md`).
- Tests: `src/components/marketing/landing-page.test.tsx`, `walkthrough.test.tsx`, `spectrum-stage.test.tsx`, `src/lib/marketing/demo-data.test.ts`.

**Gap:** Public marketing is a local demo, not a hosted Next.js site. GitHub Pages does not serve this route.

### 2. Pulse and event detail

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **implemented**, **merged**, **illustrative** figures on detail, locally **verified** | **implemented** (honest, observation-driven). Unit tests passed with an unhandled `scrollIntoView` error (`npm test` exit 1). Not **merged**. Not CI-**verified**. |

**Evidence (`main`):**

- Server boundary: `src/lib/data/repository.ts` (`IntelligenceRepository`, `getRepository()` → `MockIntelligenceRepository` only).
- Layout: `src/app/(workspace)/layout.tsx` loads `listEvents` + `listFollowedEventIds`.
- Pulse: `src/app/(workspace)/pulse/page.tsx` → `src/components/screens/pulse-screen.tsx`.
- Event book: `src/app/(workspace)/events/(book)/page.tsx`.
- Event detail: `src/app/(workspace)/events/[id]/page.tsx` → `src/components/intelligence/event-intelligence-view.tsx`. Unknown ids `notFound()`.
- Catalog: `src/data/events.ts` (32 `buildEvent` fixtures), `src/data/build-event.ts`, `src/lib/data/mock-catalog.ts`.
- Demo chip: `src/components/header/top-bar.tsx` — “Every figure in this workspace is illustrative fixture data”.
- **Illustrative on detail:** “OMEN estimate” is `event.probability - 2.6` (`event-intelligence-view.tsx`). “Identification confidence” is `event.explained + 20`. Chart tabs include Volume / Spread / Related without stored series. “Make a call” opens `src/components/common/call-modal.tsx`, which shows a hardcoded “cryptographically recorded” timestamp.
- Tests: `src/app/(workspace)/workspace-routes.test.tsx`, `event-intelligence-view.test.tsx`, `src/lib/data/mock-repository.test.ts`.

**Evidence (PR #6, do not reimplement):**

- Chart and table from `probabilitySeries`; Observed / Interpretation / Still unknown; Inspect evidence + Follow; no Make a call, no fabricated OMEN estimate (`src/components/intelligence/event-intelligence-view.tsx`, `probability-chart.tsx`).
- Domain: `src/lib/domain/probability-history.ts`, `event-chronology.ts`.
- Storage + provenance chips via layout / `top-bar.tsx`.
- Remaining defect: `inspectEvidence` calls `scrollIntoView` / `focus` and throws under jsdom; Vitest reports 145 passing tests and **exit code 1**.

### 3. Evidence and published Move Logs

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **illustrative** fixtures; durable Move Log **absent** | **implemented** (append-only tables + CLI publish/correct). Not **merged**. Persistence **not verified** here (`test:db` blocked). |

**Evidence (`main`):**

- `AionEvent.evidence`, `timeline`, `expectationHistory` seeded in `src/data/events.ts` / `src/data/build-event.ts`.
- UI: `src/components/intelligence/intelligence-panel.tsx`, `event-timeline.tsx`.
- Marketing “Ledger” is a **Demo** chip over `demoLedger` in `src/lib/marketing/demo-data.ts` / `feature-sections.tsx`.
- Build contract item “Published Move Log — durable, append-only” (`docs/omen-v0-build-contract.md`) has no store or API on `main`.

**Evidence (PR #6):**

- Tables `evidence`, `move_logs`, `move_log_revisions` in `db/migrations/0001_core_event_storage.sql`.
- Writer: `src/lib/db/event-store.ts`, `event-bundle.ts`, `scripts/omen-db.ts`.
- Reader maps latest revision onto `whatChanged` / `likelyCause` / `explained`; history via `db:show`.
- Fixtures: `db/fixtures/demo-evt-boc-cut.json`, `demo-evt-boc-cut.correction.json` (v2 correction).
- Corrections cannot rewrite v1 (`HistoryConflictError`). No public HTTP write.

### 4. Database migrations and persistence

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **absent** | **implemented**, not **merged**, not **verified** against PostgreSQL in this environment, not **deployed** |

**Evidence (`main`):** no `db/`, no `pg`, no `DATABASE_URL`, no `docs/database.md`. `getRepository()` always constructs `MockIntelligenceRepository`.

**Evidence (PR #6):**

| Path | Role |
| --- | --- |
| `docs/database.md` | Modes, schema, write-command safety, limitations |
| `db/migrations/0001_core_event_storage.sql` | V0 schema |
| `src/lib/db/{config,migrate,event-store,event-reader,event-bundle,schema-version}.ts` | Config, migrator, I/O |
| `src/lib/data/postgres-repository.ts` | Repository adapter |
| `src/lib/data/repository.ts` | `OMEN_STORAGE_MODE` (`demo` / `database`); no demo fallback in database mode |
| `scripts/omen-db.ts` | `migrate`, `status`, `upsert`, `show` |
| `.env.example` | `DATABASE_URL`, `OMEN_TEST_DATABASE_ADMIN_URL`, `OMEN_STORAGE_MODE` |
| `vitest.db.config.ts`, `src/test/postgres-harness.ts`, `src/lib/db/postgres.db.test.ts` | Disposable-DB suite |

Scripts added: `typecheck`, `test:db`, `db:migrate`, `db:status`, `db:upsert`, `db:show`. `npm ci` succeeds on this branch (lockfile in sync).

### 5. Historical reconstruction

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **illustrative** | **illustrative**, honestly labeled. Stored point-in-time reads **absent** |

**Evidence (`main`):**

- Workspace Archive: `src/app/(workspace)/archive/page.tsx` → `src/components/screens/archive-screen.tsx`. Hardcoded date `2026-08-17`, slider formula `(58.4 + position * 0.2)`, static KVs. Description: “Reconstruct the information environment at any moment.” Not labeled as a demo. Listed as legacy demo-only in `docs/architecture.md`.
- Marketing Archive / walkthrough rewind: `src/components/marketing/feature-sections.tsx`, `walkthrough.tsx`, PIT helpers in `src/lib/marketing/demo-data.ts` — fixture-only.
- `/relations` is an inline SVG placeholder (`relations-screen.tsx`); `getGraph()` is unused.

**Evidence (PR #6):** same scripted Archive, plus `archive-screen.test.tsx` and the demo notice quoted above. Schema can support reconstruction (timestamped observations, evidence, revisions) but no read path or UI uses an as-of timestamp.

### 6. Authentication and operator authorization

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **absent** | **absent** |

No `middleware.ts`, no NextAuth / Clerk / SSO, no roles, no RLS. Grep over `src/` for those names is empty. Deferred in `README.md`, `docs/architecture.md`, `docs/omen-v0-build-contract.md` (requires owner approval). `/team` is a static `UtilityScreen` (`src/app/(workspace)/team/page.tsx`).

### 7. Persistent per-user Following

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **implemented** in-session; persistence **absent** | Same. Seed ids may come from `events.followed_by_default` |

**Evidence (both):**

- Seed: `src/lib/data/mock-catalog.ts` `defaultFollowedEventIds` (`evt-boc-cut`, `evt-frontier-release`, `evt-fed-cut`, `evt-housing-ca`).
- Client: `src/components/layout/workspace-provider.tsx` — `toggleWatch` mutates a `Set`. Architecture: “Follow/unfollow is not persisted (there is no write path).”
- Surfaces: Pulse watchlist filter, `src/components/screens/watchlists-screen.tsx`, event Follow button.

PR #6 adds a column, not a user. `docs/database.md`: “No public write endpoint, auth, per-user watchlists, or billing.”

### 8. Ingestion and scheduled jobs

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **absent** | **absent** |

No workers, queues, cron routes, or fetchers. Roadmap Phase 2 only (`docs/roadmap.md`). Writes on PR #6 are a local CLI, not ingest.

### 9. Notifications

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **illustrative** | **illustrative** |

- `src/app/(workspace)/alerts/page.tsx` — static rows (“Armed” / “Triggered”).
- `src/components/screens/settings-screen.tsx` — checkbox in `useState`; no delivery.
- `src/components/screens/utility-screen.tsx` — “intentionally local-only for the MVP.”

No email, push, webhooks, or notification service.

### 10. Billing and server-side entitlements

| | `main` | PR #6 |
| --- | --- | --- |
| Status | **absent** | **absent** |

No Stripe, plans, meters, or entitlement gates. Roadmap Phase 8. Build contract: payments require owner approval.

### 11. CI, deployment, and monitoring

| | `main` | PR #6 |
| --- | --- | --- |
| Status | App CI **absent**. GitHub Pages **configured** + **deployed** (README only). Local checks **verified** below. Monitoring **absent**. | Same empty workflow tree. Pages does not build this head. Local unit/lint/typecheck/build run in this audit; `test:db` **blocked**. |

**Evidence:**

- No `.github/workflows` in either tree.
- `gh run list` shows only `pages-build-deployment` on `main` (latest success 2026-09-25T18:41:28Z).
- Pages: `build_type: legacy`, source `main` `/`, https://jacksonissacs.github.io/V_Omen_V/ — fetched in this audit; content is the README, not `/` or `/pulse`.
- No `vercel.json`, Dockerfile, `docker-compose`, Sentry, or other APM.
- `next.config.ts` is empty defaults.

## HTTP surface

| Route | `main` | PR #6 |
| --- | --- | --- |
| `GET /api/events`, `GET /api/events/:id` | **implemented**, **merged** (`src/app/api/events/route.ts`, `[id]/route.ts`) | Adds `storage`, `provenance`, `503` on store failure |
| POST / PUT / PATCH / DELETE | **absent** | **absent** (CLI only) |

## Work to integrate, not reimplement

PR #6 is the stacked result of Task 02 (PR #4) and Task 03 (PR #5). Land it as a unit after its checks are green. Do not rebuild:

- PostgreSQL schema, migrator, identity / production-write guards
- `PostgresIntelligenceRepository` and `OMEN_STORAGE_MODE`
- Bundle validation and append-only Move Log revisions
- Probability series / chronology domain
- Honest event-detail UI and Archive demo labeling
- `docs/database.md` and the `db:*` / `test:db` / `typecheck` scripts
- The lockfile fix that makes `npm ci` work (broken on current `main`)

Leave for later, already documented as out of scope on that branch: auth, billing, ingest, per-user Following, event-field versioning, stored Archive reconstruction, CI workflows, hosted production database.

## Baseline checks (this audit)

Commands were run on 2026-09-25 against the SHAs above. Node `v22.14.0`, npm `10.9.7`. This environment has no `psql`, Docker, `DATABASE_URL`, or `OMEN_TEST_DATABASE_ADMIN_URL`.

### `main` @ `9c1aace`

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | **BLOCKED** | `Invalid: lock file's picomatch@2.3.2 does not satisfy picomatch@4.0.7` / `Missing: picomatch@2.3.2 from lock file`. `package.json` and `package-lock.json` on `main` are out of sync. |
| `npm test` | **PASS** | 15 files, **75** tests. Used the snapshot `node_modules` after `npm ci` failed. |
| `npm run lint` | **PASS** | `eslint`, exit 0 |
| `npm run typecheck` | **BLOCKED** | `npm error Missing script: "typecheck"` |
| `npx tsc --noEmit` (ad hoc, not the npm script) | exit 0 | Does **not** make `npm run typecheck` verified |
| `npm run build` | **PASS** | Next.js 16.3.4; 21 routes; core pages static (`○`); `/api/events` and `/events/[id]` dynamic (`ƒ`) |
| `npm run test:db` | **BLOCKED** | `npm error Missing script: "test:db"` |

### PR #6 @ `8afd1ed` (worktree `/tmp/omen-pr6`, not merged)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | **PASS** | 745 packages |
| `npm test` | **FAIL** (exit 1) | 22 files, **145** tests reported passed; 1 unhandled `TypeError: inspectorRef.current?.scrollIntoView is not a function` from `event-intelligence-view.tsx:52` |
| `npm run lint` | **PASS** | exit 0 |
| `npm run typecheck` | **PASS** | `tsc --noEmit`, exit 0 |
| `npm run build` | **PASS** | Workspace routes become dynamic (`ƒ`) because the layout uses `connection()` |
| `npm run test:db` | **BLOCKED** | Script exists. 12 failed / 14 skipped. Exact error: `BLOCKED: OMEN_TEST_DATABASE_ADMIN_URL is not set, so PostgreSQL integration tests cannot run. See docs/database.md.` No disposable PostgreSQL in this environment. |

`gh pr checks 6` remains empty. Local runs here are not GitHub CI.
