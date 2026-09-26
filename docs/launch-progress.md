# OMEN launch progress

Where the repository stands for a working MVP and a monetizable public beta. Detailed statuses, paths, and check logs: [beta-gap-matrix.md](beta-gap-matrix.md).

This file is a progress record. It does not authorize merges, production database work, paid services, authentication, or billing.

## Audited refs

| Ref | SHA | Role |
| --- | --- | --- |
| `origin/main` | `d044ead2e627169b764ec223723f14af4680a919` | Current product line. PR #6 (Tasks 02–03) **merged** 2026-09-25. |
| PR [#8](https://github.com/jacksonissacs/V_Omen_V/pull/8) `cursor/trustworthy-temporal-storage-df20` | `eddc175` | Open Task 04A — temporal storage / event revisions. Draft. |
| PR [#7](https://github.com/jacksonissacs/V_Omen_V/pull/7) `cursor/beta-gap-inventory-6a92` | *(this PR’s head after recheck commit)* | Audit docs only. |

**Prior audit (2026-09-25)** used `main` @ `9c1aace` and open PR #6 @ `8afd1ed`. That snapshot is superseded for product status; see [Historical findings rechecked](beta-gap-matrix.md#historical-findings-rechecked).

## V0 loop vs current code

Build contract order: Event → Evidence → Published Move Log → Historical reconstruction.

| Loop item | On `main` @ `d044ead` | For MVP |
| --- | --- | --- |
| Event | Honest Pulse / Events / detail; demo or PostgreSQL via `OMEN_STORAGE_MODE` | **Landed** with PR #6 |
| Evidence | Append-only `evidence` + inspectable timestamps | **Landed**; needs disposable-DB verification in every environment |
| Published Move Log | Append-only revisions via CLI | **Landed**; no HTTP write without approval |
| Historical reconstruction | Scripted, labeled Archive demo | **Not landed** — storage prep in PR #8; as-of UI still absent |

## What works, and how it was verified

Verified on **`main` @ `d044ead`** in the **2026-09-26 recheck** (merged tree on this docs branch), unless noted.

| Surface | What it does | Verification |
| --- | --- | --- |
| Marketing `/` | Public demo landing; illustrative fixtures; CTA to `/pulse` | `npm test` (landing, walkthrough, spectrum, demo-data); `npm run build` |
| Core workspace | Pulse, Events, event detail, Watchlists, ⌘K over `IntelligenceRepository` | `workspace-routes.test.tsx`, `data-boundary.test.ts`, `mock-repository.test.ts` |
| Honest event detail | Observation-driven chart, provenance, no fabricated OMEN estimate | `event-intelligence-view.test.tsx`; merged with PR #6 |
| Read APIs | `GET /api/events`, `GET /api/events/:id` | `route.test.ts`; dynamic routes in build |
| PostgreSQL path (code) | Schema, migrator, repository adapter, CLI | Present on `main`; `postgres.db.test.ts` when Postgres available |
| Local quality | Unit tests, lint, typecheck, production build | `npm ci`, `npm test` **146/146**, lint, typecheck, build — all exit 0 in recheck |
| GitHub Application CI | Lint, typecheck, tests, build, `test:db` with Postgres service | Workflow on `main`; PR #6 checks **pass** before merge |

**2026-09-25 audit (`main` @ `9c1aace`):** 75/75 unit tests, lint, build pass; `npm ci` blocked on lockfile; PR #6 not merged.

Browser verification of the running app was **not** performed in either audit pass.

## What exists but remains unverified

### 2026-09-25 list — recheck on `main` @ `d044ead` (2026-09-26)

The first audit recorded these gaps against `main` @ `9c1aace` and/or open PR #6 @ `8afd1ed`. None were assumed; each was re-checked after PR #6 merged.

| Item | Why (2026-09-25 audit) | Recheck disposition |
| --- | --- | --- |
| PR #6 `npm test` as a gate | 145 tests reported pass; process **exits 1** (`scrollIntoView` is not a function in jsdom) | **Resolved on `main`.** Optional chaining on `scrollIntoView` / `focus` (`event-intelligence-view.tsx`); `70ece6c`. Recheck: **146** tests, **exit 0**. |
| PR #6 `npm run test:db` | **BLOCKED:** `OMEN_TEST_DATABASE_ADMIN_URL` unset; no local PostgreSQL in that environment | **Still blocked in this pod** (same env constraint). **Resolved on GitHub CI:** Application workflow runs `test:db` with a Postgres service; PR #6 checks **application pass** before merge. |
| GitHub CI on PR #6 | `gh pr checks 6` → no checks | **Resolved.** `.github/workflows/application-ci.yml` on `main`; `gh pr checks 6` shows **application pass** (2026-09-26). |
| `npm ci` on `main` | Lockfile out of sync (`picomatch` 2.3.2 vs 4.0.7) | **Resolved on `main` @ `d044ead`.** Recheck: `npm ci` exit 0. |
| `npm run typecheck` / `test:db` on `main` | Scripts absent; ad hoc `npx tsc --noEmit` exited 0 | **Resolved on `main`.** Scripts in `package.json`; recheck: `npm run typecheck` exit 0. `npm run test:db` script exists; pod still **BLOCKED** without admin URL. |
| GitHub Pages | Deployed README at https://jacksonissacs.github.io/V_Omen_V/, not the app | **Still true.** Not the Next.js workspace; `/pulse` is not on that host. |
| Database mode, Following after refresh, Archive reconstruction | Not exercised against a store | **Still unverified / absent.** No running server with `OMEN_STORAGE_MODE=database` in audit; Following remains in-memory; Archive is an honest scripted demo with no stored as-of read (Task 04A / reconstruction UI still open). |

### Still unverified in the 2026-09-26 recheck (this pod)

| Item | Why |
| --- | --- |
| `npm run test:db` locally | **BLOCKED:** `OMEN_TEST_DATABASE_ADMIN_URL` unset; no disposable PostgreSQL admin here (see `docs/database.md`) |
| GitHub Pages as product host | README site only |
| Database mode in a running dev server | Not started; no database in pod |
| Following after refresh | In-memory only; not a persistence defect, but not exercised against PostgreSQL |
| Archive / point-in-time reconstruction | Scripted demo; no as-of query against stored rows |
| Task 04A (PR #8) | Open; not on `main`; `test:db` not run in this pod |
| Browser click-through | Not performed |
| Application CI on PR #7 / #8 heads | Not re-run in this audit pass (workflow exists on `main`) |

## MVP blockers

### 2026-09-25 list — disposition on `main` @ `d044ead` (2026-09-26)

The first audit listed eight MVP blockers against `main` @ `9c1aace` and open PR #6. Rechecked; do not treat stale rows as still blocking.

| # | Blocker (2026-09-25) | Disposition |
| --- | --- | --- |
| 1 | Tasks 02–03 not on `main` | **Resolved.** PR [#6](https://github.com/jacksonissacs/V_Omen_V/pull/6) merged → `d044ead`. Postgres path, honest event detail, Move Logs, `docs/database.md`. |
| 2 | PR #6 not check-clean (`npm test` exit 1; `test:db` not green in CI) | **Resolved on merge path.** `fix: guard event-detail inspect scroll so unit tests exit 0` (`70ece6c`); Application CI runs unit tests + `test:db` with Postgres; PR #6 checks **application pass**. Local pods without `OMEN_TEST_DATABASE_ADMIN_URL` remain **BLOCKED** for `test:db`. |
| 3 | `main` cannot `npm ci` | **Resolved** on `d044ead` (lockfile landed with PR #6). |
| 4 | No application CI (Pages README only) | **Resolved.** `.github/workflows/application-ci.yml` on `main`. Pages still README-only — that is deployment, not app CI. |
| 5 | Historical reconstruction still a script | **Partially resolved (labeling only).** Honest Archive demo labeling is on **`main`**. Stored as-of reconstruction UI is **still absent**. |
| 6 | Mutable event fields have no revision history | **Still open on `main` @ `d044ead`.** Upserts overwrite `events` semantic fields. **Task 04A (PR [#8](https://github.com/jacksonissacs/V_Omen_V/pull/8))** implements `event_revisions`; not merged. |
| 7 | No ingest | **Still open.** CLI upsert only; fixtures/catalog unchanged. |
| 8 | Following in-memory only | **Still open** (acceptable for single-operator demo). |

### Current MVP blockers (after PR #6)

1. **Task 04A not on `main`** — event metadata revisions + trustworthy `record_available_at` (PR #8).
2. **Historical reconstruction** — no stored as-of read in the workspace UI.
3. **No hosted Next.js deployment** — GitHub Pages is the README, not `/pulse`.
4. **No ingest.**
5. **No durable Following.**
6. **Local `test:db`** — use disposable Postgres locally or trust Application CI when this environment has no admin URL.

Do not start auth, billing, or production database work without explicit owner approval.

## Additional paid-beta blockers

Same intent as the 2026-09-25 audit. Auth, per-user Following, hosted/production Postgres, public write APIs, and billing **require explicit owner approval**. Also still missing: sourced ingest, a **real Next.js deploy** (not Pages README), and monitoring. Paid market-data or LLM APIs are **not** required to open a beta (`docs/roadmap.md`).

| Blocker | Notes |
| --- | --- |
| Production authentication | Explicit approval |
| Persistent per-user Following | Identity + write path |
| Hosted PostgreSQL / production writes | Explicit approval; CLI already refuses production |
| Public write API | Explicit approval |
| Sourced ingest | Persistence is on `main`; ingest pipeline still absent |
| Billing / entitlements | Explicit approval |
| Next.js hosting (not Pages README) | No Vercel/Docker deploy config in repo |
| Monitoring | Absent |

## Next task to execute

### Completed (do not redo)

| Prior instruction | Status |
| --- | --- |
| Make PR #6 landable and land it | **Done** — merged `d044ead`. Do **not** rebuild schema or event-detail work. |
| `fix: guard event-detail inspect scroll so unit tests exit 0` | **Done** — `70ece6c`. |
| Run `npm run test:db` on disposable PostgreSQL | **Done in Application CI** on GitHub (Postgres service). Re-run locally when `OMEN_TEST_DATABASE_ADMIN_URL` is set. |
| Add GitHub Actions (lint / typecheck / test / build / `test:db`) | **Done** — `.github/workflows/application-ci.yml` on `main`. |

### Execute now (dependency order)

1. **Land PR #8 (Task 04A)** — trustworthy temporal storage / `event_revisions`. Review and merge; do not reimplement.
2. **Reconstruct a past moment from stored observations** — server as-of read + replace scripted workspace Archive (or event-level rewind). Depends on Task 1 for `record_available_at` semantics.
3. **Staging Next.js deploy** — optional for internal demo; document URL and storage mode; not GitHub Pages.

## Next three engineering tasks (detail)

Dependency order after PR #6 merge. One PR per task where possible.

### Task 1 — Land PR #8 (Task 04A: trustworthy temporal storage)

**Depends on:** `main` @ `d044ead` (Tasks 02–03).

**Scope:**

- Merge PR [#8](https://github.com/jacksonissacs/V_Omen_V/pull/8) after review; do not reimplement migrations or write-path revision logic already on that branch.
- Ensure `npm run test:db` is green on GitHub CI for the PR head (disposable Postgres in workflow).
- No production migrate/upsert.

**Acceptance criteria:**

- `main` includes migration `0002`, `event_revisions`, `record_available_at`, and coverage baseline.
- Application CI green on merge commit.
- Docs in `docs/database.md` match behavior.

**Proposed commit message:** *(use PR #8 merge title)* `feat(history): trustworthy temporal storage (OMEN V0 Task 04A)`

### Task 2 — Reconstruct a past moment from stored records (UI + read path)

**Depends on:** Task 1 preferred (trustworthy timestamps and event revisions); minimum `main` @ `d044ead` for observations/evidence/Move Logs.

**Scope:**

- Server-side as-of read over stored history using documented cutoffs (`record_available_at` after Task 1).
- Replace scripted workspace Archive or add event-level rewind; keep marketing fixtures labeled if unchanged.
- Tests: cutoff rules; `test:db` case with two timestamps.

**Acceptance criteria:**

- UI shows only rows available at the chosen instant; states gaps honestly.
- Hardcoded Archive slider formula removed from workspace path.
- `npm test`, `npm run test:db` (where Postgres available), lint, typecheck, build pass.

**Proposed commit message:**

```
feat: reconstruct event state from stored observations at a chosen time
```

### Task 3 — Deploy the Next.js app to a non-Pages host (staging)

**Depends on:** Tasks 1–2 not strictly required for a **demo** deploy, but honest reconstruction should precede a public beta claim.

**Scope:**

- Choose hosting (e.g. Vercel preview/staging); wire `OMEN_STORAGE_MODE=demo` or a disposable database.
- Do **not** conflate with GitHub Pages README publishing.
- No production data, auth, or billing.

**Acceptance criteria:**

- Public URL serves `/`, `/pulse`, and `/events/[id]` from the Next.js build.
- README or `docs/architecture.md` states what is illustrative vs stored.

**Proposed commit message:**

```
docs: document staging deploy URL and storage mode for the workspace app
```

## What this audit did not do

- Did not merge PR #8 or change production data.
- Did not add auth, billing, ingest, or public write paths.
- Did not perform browser click-through verification.
