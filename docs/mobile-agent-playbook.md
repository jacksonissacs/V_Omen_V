# Mobile agent playbook (Cloud Agents and automation)

Required workflow for **every later implementation task** on this repository, including doc-only and environment tasks. If a step conflicts with [omen-v0-build-contract.md](omen-v0-build-contract.md) or [ai-first-beta-scope.md](ai-first-beta-scope.md), stop and ask the owner.

## 1. Inspect before editing

- Record the **actual branch name** and **HEAD SHA** you started from.
- **Fetch** and read `origin/main` when choosing a base; new work branches from **current `main` only after prerequisite PRs are merged**.
- If a task depends on an open PR, **stop** with a precise blocker: PR number, branch, and what must merge first.
- Read relevant code, docs, and **Application CI** (`.github/workflows/application-ci.yml`). Reuse completed work; do not redo merged tasks.

## 2. Stay within the task

- Change only what the task requests.
- **Commit and push** only the feature branch for this task.
- Open or update **one PR** per branch.
- **Never merge**, **never deploy**, and **never** run production operations unless the owner gives a separate, explicit instruction.

## 3. Preserve trust boundaries

- Keep reads on the server: client components must not import `IntelligenceRepository`, adapters, or `@/data/events` (see `src/test/data-boundary.test.ts`).
- Preserve **provenance**, **append-only history**, **checkpoint verification**, and **production guards** on write paths.
- **Never fabricate** data, timestamps, probabilities, checkpoint ids, or passing CI results.

## 4. Run verification (report honestly)

Run the checks that apply to the change:

| Check | Command |
| --- | --- |
| Lint | `npm run lint` |
| Route types | `npx next typegen` |
| Typecheck | `npm run typecheck` |
| Unit / component tests | `npm test` |
| Production build | `npm run build` |
| PostgreSQL integration | `npm run test:db` |
| Production workflow (build + DB + Chrome) | `npm run test:workflow` |

**Storage, history, or publication** changes also require **`npm run test:db`** and **`npm run test:workflow`** on a **disposable local PostgreSQL** database. Use the same admin URL pattern as CI (see below).

If a check cannot run in the environment, report **`BLOCKED:`** with the reason. Do not skip silently or weaken tests to get green.

External source smoke (`npm run intake:check`) is separate from `test:workflow`; note it when relevant but do not treat an intake outage as a workflow pass.

## 5. Return a complete handoff

End every task with:

- **Branch** name and **base / head SHAs** (before and after).
- **PR URL** (create or update).
- **Actual test results** (command, exit code, material output). A local pass is **not** a CI pass.
- **Remaining blockers** (open PRs, missing secrets, environment limits).
- **Next prerequisite** — the single best next task or merge for the owner.

## Cloud environment and CI parity

Application CI runs on `ubuntu-latest` with Node **22**, `npm ci`, demo storage for unit tests, **PostgreSQL 16** on port **5432**, and Chrome for `npm run test:workflow`.

Repository-managed Cloud Agent setup lives in [`.cursor/environment.json`](../.cursor/environment.json). It:

- Installs Node dependencies with **`npm ci`** (idempotent).
- Starts **PostgreSQL** on each boot with the same disposable test admin URL as CI:
  - `OMEN_TEST_DATABASE_ADMIN_URL=postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres`
- Sets **`chromeExecutablePath`** for workflow tests (Chromium in the image; default Cursor images may use `/usr/local/bin/google-chrome`).

Never commit production secrets. `DATABASE_URL` and admin URLs are for **local / test** databases only.

## Scope reminders

Follow [ai-first-beta-scope.md](ai-first-beta-scope.md) for coverage order and out-of-scope surfaces. Do not start AI feature implementation unless the task explicitly says so.
