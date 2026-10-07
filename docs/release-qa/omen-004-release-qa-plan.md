# OMEN-004 October release QA

**October decision: baseline not yet recorded in this revision.** The matrix is filled only after the clean-checkout run. Until that record exists, the milestone is not a pass.

Same-agent continuity: this file is updated by the same Grok 4.7 cloud agent that opened pull request #33 (`bc-105e4c9a-0993-440d-b397-f14cc50b9491`, https://cursor.com/agents/bc-105e4c9a-0993-440d-b397-f14cc50b9491). Operator coordinating the handoff: Codex. No other model is delegated the run, the review, or the decision.

## Locked October acceptance contract

OMEN-002 Share is a separate, older M0 trust-track P0. It is **outside** this contract. Share does not block October evaluation and is not an acceptance row. A missing Share control is not a defect for this milestone.

October requires exactly these 8 binary checks. The milestone passes only when all 8 pass. Environment-blocked is recorded separately from product-failed, and the milestone stays **FAIL** unless every row is PASS.

| # | Check | Pass only when |
| --- | --- | --- |
| 1 | Discover | At least one real, current AI-tech event is visible on Pulse or Explore. |
| 2 | Understand | Opening that event yields a usable Event Brief with the event or question, the current state, and supporting evidence. |
| 3 | Evidence / provenance | Source identity and provenance are visibly identifiable, including at mobile width. |
| 4 | Follow | The user follows or saves that event, and the state persists across refresh and reload. |
| 5 | Return | The followed event is retrievable from Following, and completed or checkpointed history is accessible through Archive. |
| 6 | Reality guard | The V0 loop works without enabling legacy or demo fake-intelligence routes and without a seeded-book fallback. |
| 7 | Regression | Required automated tests and CI for the milestone commit are green. |
| 8 | Proof run | A documented end-to-end browser run shows Discover → Brief → Evidence → Follow → Return / Archive. |

Rules that bind the baseline:

- The baseline commit is `main` at exactly `aea8636c555736de9d61110abc8a05a173a67d79` (pull request #31, OMEN-001 quarantine). Record `HEAD` and a clean `git status` before the first test command.
- Acceptance uses production Next.js: `next start` with `NODE_ENV=production`. `next dev` is not an acceptance server.
- Demo intelligence stays disabled for checks 1–5 and 8. Production refusal of `OMEN_STORAGE_MODE=demo` and of an unset mode is the quarantine behavior to preserve.
- Synthetic workflow fixtures (`db/fixtures/test-workflow/`) are regression controls only. They are never evidence of a real or current AI-tech event. If this commit has no such event with demo intelligence disabled, check 1 is **FAIL**. Do not add substitute events, weaken the criterion, or relabel synthetic or seeded rows as real.
- GitHub Pages is not the product. The Pages deploy is not product QA.
- Historical Application CI on this SHA is context, not this baseline: https://github.com/jacksonissacs/V_Omen_V/actions/runs/37131563152 (succeeded 2026-10-03). Check 7 uses the commands run for this baseline. That historical run may be cited beside them. It does not replace them.
- No merge, no deploy, no product repair on this pass.

## What a real event is

A real, current AI-tech event for checks 1–5 and 8 is a book row that is not the seeded catalog in `src/data/events.ts` and not a `[SYNTHETIC TEST]` workflow fixture. It is visible on Pulse (`/pulse`) or Explore (`/events`) when the production server is not allowed to serve demo intelligence. Provenance must be the row’s own provenance. Demo-labeled seed titles, including “Bank of Canada cuts rates in October” (`evt-boc-cut`) and “Extra-territorial GPU license expansion”, do not satisfy Discover.

## Automated commands

Run on a separate clean checkout of `aea8636c555736de9d61110abc8a05a173a67d79`. Do not run them on a dirty product tree. Record each exit code.

```bash
git rev-parse HEAD
git status --porcelain
git status -sb
npm ci
npm run lint
npx next typegen
npm run typecheck
npm test
npm run build
npm run test:db
CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}" npm run test:workflow
```

PostgreSQL for `test:db` and `test:workflow` matches Application CI:

`OMEN_TEST_DATABASE_ADMIN_URL=postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres`

`npm run intake:check` is external-source smoke. It is not one of the 8 checks.

`npm run test:workflow` proves the synthetic V0 loop, quarantine against the seeded catalog inside that suite, checkpoint replay, and an unavailable database. Those results may support check 6 and check 7. They do not pass checks 1–5 or 8.

## Production browser servers

Acceptance servers are `next start` only, after `npm run build` on the clean checkout.

```bash
# Quarantine: production must not serve the seeded book
NODE_ENV=production OMEN_STORAGE_MODE=demo \
  npx next start -H 127.0.0.1 -p 3212

# Unset mode: same refusal
NODE_ENV=production \
  npx next start -H 127.0.0.1 -p 3214

# Database mode, schema only, no synthetic upsert and no seeded catalog
NODE_ENV=production OMEN_STORAGE_MODE=database \
  DATABASE_URL="<fresh migrated empty database>" \
  npx next start -H 127.0.0.1 -p 3210
```

The empty database is the product’s stored book at this commit when demo intelligence is off and nobody has published a real event. Do not upsert `db/fixtures/test-workflow/` into it for checks 1–5 or 8.

Synthetic control server, labeled as such in every artifact:

```bash
NODE_ENV=production OMEN_STORAGE_MODE=database \
  DATABASE_URL="<disposable database that contains only test-workflow fixtures>" \
  npx next start -H 127.0.0.1 -p 3215
```

`next dev` is not started for this acceptance pass.

## Check procedures

### 1. Discover

On the production database server with demo intelligence disabled, open `/pulse` and `/events` at 1440 and 390. Pass only if a real, current AI-tech event is visible. If the book is empty, unavailable, or contains only seeded or synthetic titles, the check is **FAIL**.

### 2. Understand

Open the event from check 1. Pass only if the brief shows the event or question, the current state, and supporting evidence. If check 1 failed, this check is **FAIL** because that event does not exist. Do not substitute a synthetic brief.

### 3. Evidence / provenance

On that same brief, at 1440 and 390, source identity and provenance are visible (source name or URL, and a demo or sourced label that matches the record). The provenance chip’s computed `display` is not `none` at 390. If check 1 failed, this check is **FAIL**.

### 4. Follow

Follow that event, reload, and confirm the control stays Following and `localStorage` key `omen-v0-following/v1/<storage>` still lists the id. If check 1 failed, this check is **FAIL**. A synthetic follow in the workflow suite is a control, not this row.

### 5. Return

The followed event appears on `/watchlists` after reload. Completed or checkpointed history for that event is reachable from Archive. If check 1 failed, this check is **FAIL**.

### 6. Reality guard

Pass only if both are true:

- The production workflow suite passes on the clean SHA, and its pages do not contain seeded titles (`evt-boc-cut`, “Bank of Canada cuts rates in October”).
- Production `OMEN_STORAGE_MODE=demo` and unset mode return `503` `{"storage":"misconfigured","error":"Event storage is unavailable"}` for `GET /api/events` with no seeded id in the body, and `/markets`, `/signals`, `/agents`, `/research`, `/relations`, `/alerts`, and `/graph` return 404 without fixture copy (“USD/CAD”, “0.73”, Armed/Triggered). `/pulse` shows **Data unavailable** or **Workspace data unavailable**, not the seeded book.

Label workflow screenshots as synthetic controls.

### 7. Regression

Pass only if this baseline’s `npm run lint`, `npx next typegen`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db`, and `npm run test:workflow` all exit 0 on the clean SHA. Cite the 2026-10-03 Actions run as historical context only.

### 8. Proof run

One documented browser session on production `next start`, demo intelligence disabled, walking Discover → Brief → Evidence → Follow → Return / Archive for the real event from check 1. Screenshots or a short recording, plus the URLs. If the walk cannot start because no real event is visible, the check is **FAIL** and the artifact shows the stopping screen.

## Evidence pack

Store this baseline under `docs/release-qa/baseline-2026-10-07/` on the pull-request branch. That directory is the harness overlay. The clean checkout of `aea8636` stays free of these files.

| File | Contents |
| --- | --- |
| `checkout.txt` | `HEAD`, `git status --porcelain`, `git status -sb`, recorded before tests |
| `commands.log` | Each command and its exit code |
| `matrix.md` | Dated 8-row PASS/FAIL matrix |
| `defects.md` | Minimal defect list |
| Screenshots and JSON | One artifact path per failed or passed row that was actually observed |

Do not invent exit codes, screenshots, or CI results.

## Historical preparation (not an acceptance row)

The 2026-10-03 plan treated OMEN-002 Share as a certification blocker and listed five synthetic journeys as the release pass. That prerequisite is superseded. The synthetic journey notes below remain regression-control procedure. They are not October rows.

On 2026-10-03, against production code `aea8636`, a unit-path smoke exited 0 (106 tests, plus 24 archive-navigation tests). That smoke did not run `test:workflow`, `test:db`, lint, typecheck, or the production build. It is not check 7.

Synthetic control map inside `src/test/workflow/integrated-workflow.workflow.test.ts`:

| Control | Test name | Artifact |
| --- | --- | --- |
| Pulse, no seeded book | `opens Pulse from the homepage with a real click` | `test-artifacts/01_pulse.png` |
| Brief, evidence, Move Log | `opens event evidence and the published Move Log from the card` | `test-artifacts/02_event_evidence_move_log.png` |
| Checkpoint, return to present | `reconstructs a checkpoint from the shareable history URL and returns to present` | `test-artifacts/03_return_to_present.png` |
| Archive deep link | `reaches the same checkpoint from Archive and keeps the URL shareable` | `test-artifacts/03b_archive_checkpoint.png` |
| Fresh-session checkpoint | `opens a shared checkpoint URL in a fresh browser session` | `test-artifacts/07_fresh_session_checkpoint.png` |
| Mobile overflow | `keeps mobile layout inside the viewport` | `test-artifacts/04_event_detail_mobile.png` |
| Following reload and empty list | `keeps Following across a hard refresh and preserves an intentionally empty watchlist` | workflow assertion only |
| Database outage | `renders the outage workspace without demo fallback` | workflow assertion only |

Share is not in this table.

## October matrix

Filled by the baseline commit that follows this contract revision. If this section still says `NOT RECORDED`, the October decision is not complete.

| # | Check | Result | Class | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Discover | NOT RECORDED | | |
| 2 | Understand | NOT RECORDED | | |
| 3 | Evidence / provenance | NOT RECORDED | | |
| 4 | Follow | NOT RECORDED | | |
| 5 | Return | NOT RECORDED | | |
| 6 | Reality guard | NOT RECORDED | | |
| 7 | Regression | NOT RECORDED | | |
| 8 | Proof run | NOT RECORDED | | |
| | **October decision** | **NOT RECORDED** | | Share is not a row. |
