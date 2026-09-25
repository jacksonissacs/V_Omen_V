# OMEN launch progress

Where the repository stands for a working MVP and a monetizable public beta, as of the 2026-09-25 audit. Detailed statuses, paths, and check logs: [beta-gap-matrix.md](beta-gap-matrix.md).

This file is a progress record. It does not authorize merges, production database work, paid services, authentication, or billing.

## Audited refs

| Ref | SHA | Role |
| --- | --- | --- |
| `origin/main` | `9c1aace947b2d3a17ca15e16503055a8b059ac49` | Only merged product line. Ends at PR #3 (server data boundary). |
| PR [#6](https://github.com/jacksonissacs/V_Omen_V/pull/6) `cursor/omen-v0-event-detail-94d3` | `8afd1eda0ef707132eaff1b55fb7e6378447ca00` | Open integration of Tasks 02–03. Must be landed, not rewritten. |
| `cursor/omen-v0-postgres-event-storage-93d8` | `17fb42e` | Stack branch after merging PR #5 into itself. No unique work beyond PR #6. |

Working tree at the start of this audit: clean, on `main`, matching `origin/main`.

## V0 loop vs current code

The build contract (`docs/omen-v0-build-contract.md`) orders work as Event → Evidence → Published Move Log → Historical reconstruction.

| Loop item | On `main` | On PR #6 | For MVP |
| --- | --- | --- | --- |
| Event | Repository-backed Pulse / Events / detail over 32 demo fixtures | Same screens; headline probabilities from recorded series | Land PR #6 so the event object is honest |
| Evidence | Seeded arrays on fixtures | Append-only `evidence` rows + inspectable timestamps | Land PR #6; do not invent a second store |
| Published Move Log | Absent (marketing Ledger is a demo) | Append-only `move_logs` / `move_log_revisions` via CLI | Land PR #6; no HTTP write without approval |
| Historical reconstruction | Scripted Archive that reads as real | Same script, labeled as a demo | Next product task after persistence is on `main` |

Work that does not advance this loop (auth, billing, ingest, graph engine, markets) waits, except CI required to trust the loop.

## What works, and how it was verified

Verified in this audit on `main` @ `9c1aace` unless noted.

| Surface | What it does | Verification |
| --- | --- | --- |
| Marketing `/` | Public demo landing; illustrative fixtures; CTA to `/pulse` | `npm test` (landing, walkthrough, spectrum, demo-data); `npm run build` emits `○ /` |
| Core workspace | Pulse, Events, event detail, Watchlists, ⌘K over `IntelligenceRepository` | `workspace-routes.test.tsx`, `data-boundary.test.ts`, `mock-repository.test.ts`; production build |
| Demo honesty on `main` | Top bar “Demo data” chip | Present in `top-bar.tsx`; covered by shell tests |
| Read APIs | `GET /api/events`, `GET /api/events/:id` | Built as dynamic routes; unit coverage on PR #6 only |
| Local quality on `main` | Unit tests, lint, production build | `npm test` 75/75; `npm run lint` exit 0; `npm run build` exit 0 |
| PR #6 lint / typecheck / build | Honest detail + Postgres read path compile | Worktree: `npm run lint`, `npm run typecheck`, `npm run build` exit 0; `npm ci` succeeds |

Browser verification of the running app was **not** performed in this audit. Do not treat the build output as a click-through.

## What exists but remains unverified

| Item | Where | Why unverified |
| --- | --- | --- |
| PR #6 persistence across processes | `src/lib/db/postgres.db.test.ts` | `npm run test:db` blocked: no `OMEN_TEST_DATABASE_ADMIN_URL`, no local PostgreSQL |
| PR #6 unit suite as a CI gate | 145 tests | Tests report pass but `npm test` **exits 1** (`scrollIntoView` in jsdom) |
| GitHub CI on PR #6 | — | `gh pr checks 6`: no checks |
| `npm ci` on `main` | lockfile | Out of sync (`picomatch` 2.3.2 vs 4.0.7). Snapshot `node_modules` was used for `main` tests |
| `npm run typecheck` on `main` | `package.json` | Script absent. Ad hoc `npx tsc --noEmit` exited 0 and is not a substitute |
| GitHub Pages | https://jacksonissacs.github.io/V_Omen_V/ | Deployed README, not the Next.js app. `/pulse` is not on that host |
| Database mode in a running server | PR #6 `OMEN_STORAGE_MODE=database` | Not started; no database |
| Following after refresh | both trees | Only in-memory; no persistence test to pass |
| Archive reconstruction | both trees | Scripted; PR #6 labels it honestly |

## MVP blockers

A reviewer cannot yet treat OMEN as a V0 MVP that survives restart with an honest event object.

1. **Tasks 02–03 are not on `main`.** Persistence, Move Logs, and honest event detail live only on PR #6.
2. **PR #6 is not merge-ready on checks.** `npm test` exits 1; `test:db` has never been recorded green in GitHub CI; this environment could not run it.
3. **`main` cannot clean-install.** `npm ci` fails on the committed lockfile.
4. **No application CI.** Only `pages-build-deployment` runs, and it publishes the README.
5. **Historical reconstruction is still a script.** The fourth V0 loop item is not implemented even after PR #6.
6. **Event metadata is not versioned.** Title, question, status, deadline, and criteria overwrite in place on PR #6 upserts.
7. **No ingest.** The book does not update from sources. Demo fixtures remain the only catalog.
8. **No durable Following.** Acceptable for a single-operator demo; not for an MVP that claims a watchlist.

Items 6–8 can wait until after 1–5. Do not start auth, billing, or a production database for the MVP; those need explicit owner approval (`docs/omen-v0-build-contract.md`).

## Additional paid-beta blockers

Needed after the MVP loop, not instead of it. Several require owner approval before any implementation.

| Blocker | Approval / dependency |
| --- | --- |
| Production authentication and operator roles | Explicit approval. No identity code today |
| Persistent per-user Following | Needs identity + a write path |
| Hosted PostgreSQL, production migrations, production writes | Explicit approval. CLI already refuses production writes |
| Public write API | Explicit approval |
| Sourced ingest (not paid firehoses first) | Depends on landed persistence |
| Server-side entitlements and billing | Explicit approval. Roadmap Phase 8 |
| Next.js deployment (not GitHub Pages README) | Hosting choice; no Vercel/Docker config |
| Monitoring / error reporting | Absent |
| CI that gates `main` and PRs, including `test:db` | Depends on landed scripts + a disposable Postgres service |

Paid market-data or LLM APIs are not required to open a beta and are out of near-term scope (`docs/roadmap.md`).

## Next three engineering tasks

Dependency order. Each task is one PR. Do not merge this audit as a substitute for any of them.

### Task 1 — Make PR #6 landable and land it on `main`

**Depends on:** nothing new. Uses the existing integration branch.

**Scope:**

- Keep the Task 02–03 implementation. Do not re-create the schema, adapter, or event-detail rewrite.
- Fix `inspectEvidence` so jsdom does not throw (`scrollIntoView` / `focus` guards or test stub) and `npm test` exits 0.
- Run `npm run test:db` against a **disposable** local PostgreSQL with `OMEN_TEST_DATABASE_ADMIN_URL`. Record the log. Do not point at a shared or production database.
- Re-run `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- After review, merge PR #6 into `main` (owner or a later task; this audit does not merge).

**Acceptance criteria:**

- PR #6 head (or a follow-up commit on that branch) has `npm test` exit 0 with no unhandled errors.
- `npm run test:db` passes on a disposable database, or a published log shows the exact remaining blocker.
- `main` contains `docs/database.md`, `db/migrations/`, `PostgresIntelligenceRepository`, honest event detail, and the `db:*` / `typecheck` / `test:db` scripts.
- `npm ci` works on the landed tree.
- No production migrate/upsert, no hosted DB provisioning, no public write endpoint.

**Proposed commit messages** (use only the ones that match the actual diff):

```
fix: guard event-detail inspect scroll so unit tests exit 0
```

```
test: record disposable PostgreSQL results for omen test:db
```

Merge of the integration PR keeps its existing title: `Integrate OMEN V0 Tasks 02–03 into main`.

### Task 2 — Add application CI that runs the landed checks

**Depends on:** Task 1 (scripts and lockfile live on `main`).

**Scope:**

- Add a GitHub Actions workflow (no `.github/workflows` exists today).
- Jobs: `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- A second job (or service container) runs `npm run test:db` with disposable PostgreSQL and `OMEN_TEST_DATABASE_ADMIN_URL`. Missing env must fail with the existing `BLOCKED:` message, never skip-as-pass.
- Do not add deploy, pages, or production migrate steps.

**Acceptance criteria:**

- Opening a PR shows check runs on the head SHA (`gh pr checks` is no longer empty).
- A workflow run on `main` after Task 1 is green, including `test:db`.
- GitHub Pages README publishing is unchanged and is not treated as app CI.

**Proposed commit message:**

```
ci: run lint, typecheck, tests, build and disposable database checks
```

### Task 3 — Reconstruct a past moment from stored records

**Depends on:** Task 1 (timestamped observations, evidence, and Move Log revisions on `main`). Task 2 preferred so the new read path is gated.

**Scope:**

- Implement a server-side as-of read over stored `probability_observations`, `evidence`, and `move_log_revisions` (and only those). No interpolation. Missing publication times stay “Not stated by source”.
- Replace the scripted workspace Archive (`src/components/screens/archive-screen.tsx`) with that read, or add an event-level rewind that uses it and keep Archive honest until it does.
- Marketing Archive / walkthrough may stay fixture-only if still labeled illustrative.
- Tests: unit tests for cutoff rules; a `test:db` case that writes two revisions/observations and reads the earlier state.
- Do not add auth, Following persistence, ingest, or billing.

**Acceptance criteria:**

- Choosing a timestamp shows only records with `captured_at` (or the documented cutoff) ≤ that time.
- The UI states when reconstruction is incomplete (no rows, or demo provenance).
- The previous hardcoded slider formula and static KVs are gone from the workspace Archive.
- `npm test`, `npm run test:db`, `npm run lint`, `npm run typecheck`, and `npm run build` pass.

**Proposed commit message:**

```
feat: reconstruct event state from stored observations at a chosen time
```

## What this audit did not do

- Did not merge PR #6 or any other branch.
- Did not implement product features, redesign screens, or edit production data.
- Did not purchase hosting, APIs, or a hosted database.
- Did not add authentication, billing, or public write paths.
