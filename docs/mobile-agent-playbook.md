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
- **Never merge**, **never deploy**, and **never** run production operations unless the owner gives a separate, explicit instruction from the repository owner (same bar as [omen-v0-build-contract.md](omen-v0-build-contract.md) “Requires explicit approval”).

## 3. Single writer on a feature branch

- **Only one implementation agent** may actively **commit and push** to a feature branch at a time.
- A **reviewer must not write** to the implementation branch (no drive-by fixes on the feature branch).
- If another agent **takes over implementation**, the prior writer must **stop pushing** first; the new agent becomes the sole writer.
- A **repairing agent** (fixing review findings) becomes the writer and needs a **new independent reviewer** on the **new head SHA** afterward.
- **Never** allow concurrent agents to push to the same branch.

## 4. Review, CI, merge, and next task lifecycle

Required sequence for implementation work:

1. **Implementation agent** works on a **feature branch**.
2. **Commit and push** to that branch (this is **not** merge and **not** deploy).
3. Open or update a **PR** targeting `main`.
4. **Independent review** by a **fresh reviewer** (not the same agent that wrote the patch).
5. **Blocking findings** go back to the **same branch / same PR**; the implementation (or repair) agent fixes and **push**es again.
6. **Renewed independent review** of the **new head SHA** after each material fix.
7. **Relevant CI and checks green** on the **current** PR head (see section 6). A green local run is **not** CI.
8. **Owner approval** and any **repository merge requirements** satisfied (merge remains an owner or explicitly authorized action — agents do not merge by default).
9. **Merge** the PR into `main` (still **not** deploy).
10. **Verify post-merge `main` and CI** on the merge result.
11. The **next task** starts from a **freshly fetched, updated `main`**.

Report these **separately** in every handoff:

| State | Meaning |
| --- | --- |
| **Committed and pushed** | Branch on the remote contains the work; PR may be open. |
| **Merged into `main`** | PR merged; default branch includes the change. |
| **Deployed** | Running production or staging serving the change — requires **separate** owner instruction; never implied by merge. |

**A green local run is not CI.** **A green CI run is not independent review.** **A merged PR is not a deployment.**

## 5. Preserve trust boundaries

- Keep reads on the server: client components must not import `IntelligenceRepository`, adapters, or `@/data/events` (see `src/test/data-boundary.test.ts`).
- Preserve **provenance**, **append-only history**, **checkpoint verification**, and **production guards** on write paths.
- **Never fabricate** data, timestamps, probabilities, checkpoint ids, or passing CI results.

## 6. Run verification (report honestly)

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

## 7. Return a complete handoff

End every task with:

- **Branch** name and **base / head SHAs** (before and after).
- **PR URL** (create or update).
- Whether work is **pushed**, **merged**, and/or **deployed** (three distinct answers).
- **Actual test results** (command, exit code, material output). A local pass is **not** a CI pass.
- **Independent review** status (requested / findings / cleared on which SHA).
- **Remaining blockers** (open PRs, missing secrets, environment limits).
- **Next prerequisite** — the single best next task or merge for the owner.

## Cloud environment and CI parity

Application CI runs on `ubuntu-latest` with Node **22**, `npm ci`, demo storage for unit tests, **PostgreSQL 16** on port **5432**, and Chrome for `npm run test:workflow`.

Repository-managed Cloud Agent setup lives in [`.cursor/environment.json`](../.cursor/environment.json). It:

- Installs Node dependencies with **`npm ci`** (idempotent).
- Starts **PostgreSQL 16** on each boot with the same disposable test admin URL as CI:
  - `OMEN_TEST_DATABASE_ADMIN_URL=postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres`
- Exports that variable for interactive shells via `/etc/profile.d/omen-test-database.sh` (test-only; override locally if needed).
- Sets **`chromeExecutablePath`** for workflow tests (Chromium in the image; default Cursor images may use `/usr/local/bin/google-chrome`).

Never commit production secrets. `DATABASE_URL` and admin URLs are for **local / test** databases only.

## Scope reminders

Follow [ai-first-beta-scope.md](ai-first-beta-scope.md) for coverage order and out-of-scope surfaces. Do not start AI feature implementation unless the task explicitly says so.
