# OMEN-004 release QA plan

**Status: preparation only. M0 is not certified.**

This document is the harness for the five-journey release QA. It does not record a pass. Final OMEN-004 starts on the same plan, against one integrated candidate that already contains OMEN-001 and OMEN-002. Until that candidate exists, stop after the gate in [When final QA may start](#when-final-qa-may-start).

| Field | Value at preparation |
| --- | --- |
| Prepared from | `main` `aea8636c555736de9d61110abc8a05a173a67d79` |
| `origin/main` at preparation | same SHA (fetched 2026-10-03) |
| OMEN-001 | Merged. Pull request #31, merge commit `aea8636c555736de9d61110abc8a05a173a67d79`. Quarantine of production fake intelligence. |
| OMEN-002 | Not on `main`. Share control is specified and absent from the brief. A Share implementation agent was running at preparation time and had not published a branch. |
| Certification | **Not certified.** Do not treat a green local run on this SHA as M0. |

## What was inspected

| Source | What it is | Use in this plan |
| --- | --- | --- |
| `src/test/workflow/integrated-workflow.workflow.test.ts` | Previous five-journey evidence. Production `next start`, disposable PostgreSQL, synthetic fixtures, Chrome. Writes `test-artifacts/release-verification.json` and screenshots. | Automated journey runner. Re-run it unchanged on the candidate. |
| `src/test/workflow/harness.ts` | Server, database, and artifact helpers. `TESTED_MAIN_SHA` is the historical constant `d044ead2e627169b764ec223723f14af4680a919`. The suite records the live `HEAD` separately and does not assert that constant. | A stale constant is not an M0 failure. The artifact’s `headSha` must equal the candidate SHA. |
| Pull request #18 (`cursor/release-verification-20f5`) | Open release-verification draft. Superseded by the workflow suite now on `main`. | Historical only. Do not certify from that branch. |
| `docs/ui-route-state-matrix.md` | Route inventory captured at `1a7ad2b`. The file itself says it is not current `main`. | Do not use its HTTP statuses or “Demo data” chip-hidden-at-390 claim as expected results. |
| `docs/consumer-design-contract.md` | Share (T5), Following empty-list (T4), provenance at 390 (T2), archive honesty (T6, T7). | Expected Share and mobile results once OMEN-002 is in the candidate. |
| `docs/database.md`, `src/lib/db/config.ts` | Storage mode versus provenance. Unset mode and production demo mode refuse the seeded book. | Quarantine and outage expectations. |
| `src/lib/legacy-fixture-routes.ts` | Production 404 for `/markets`, `/signals`, `/agents`, `/research`, `/relations`, `/alerts`, `/graph`. | Quarantine route list. |
| `src/data/workspace.ts` | Promoted nav is Pulse, Explore (`/events`), Following (`/watchlists`). Archive is inside More. | Journey labels. |
| Named `release-qa-omen-trial` tree | Not present on `main`, on remote branches, or as a pull request. | Nothing to reuse beyond the workflow suite above. |

No production code is changed by this plan.

## When final QA may start

Start final OMEN-004 only when all of the following are true:

1. `git fetch origin main` succeeds.
2. `origin/main` contains OMEN-001 (the quarantine behavior in `src/lib/db/config.ts` and `src/lib/legacy-fixture-routes.ts`).
3. `origin/main` contains OMEN-002: a Share control on the event brief and on an open checkpoint that copies the current URL, confirms the copy or shows the URL, and does not open an account, contact picker, or share counter. Confirm by reading the candidate diff, not by the plan’s memory of a branch name.
4. The candidate SHA is that fetched `origin/main` (or one owner-named integration commit that contains both changes). Record it before the first command. Do not QA a dirty worktree.
5. The same Grok 4.7 agent that prepared this plan runs the final pass. Fill [Certification record](#certification-record). Leave it `NOT CERTIFIED` if any blocker row fails.

If OMEN-002 is still an open pull request, this plan stays preparation. Absence of Share on current `main` is expected. It blocks certification. It is not a defect to file against the preparation SHA.

## Candidate under test

The five journeys run against a **production server** (`next start`, `NODE_ENV=production`) whose book is the disposable workflow database, not the seeded catalog in `src/data/events.ts`.

Synthetic book written by `npm run test:workflow` from `db/fixtures/test-workflow/`:

| Fixture | Id | Visible question or title | Role |
| --- | --- | --- | --- |
| `evt-temporal.json` | `evt-test-temporal` | Question: “Will the example agency publish the 2026 bulletin before 1 December 2026?” Title: “[SYNTHETIC TEST] Example agency publishes the 2026 bulletin” | Multi-observation event. Current 55.3%, previous 41.5%, change +13.8 pp. Move Log `ml-test-temporal-1`. Source `https://example.test/synthetic/agency-bulletin-2026`. |
| `evt-single.json` | `evt-test-single` | “[SYNTHETIC TEST] Single observation event” | One observation. Change is “Not computable”. |
| `evt-sourced.json` | `evt-test-sourced` | “[SYNTHETIC TEST] Sourced bulletin citation” | `provenance: sourced`. URL `https://example.test/synthetic/sourced-filing`. |
| `evt-late.json` | `evt-test-late` | “[SYNTHETIC TEST] Late commit subject” | Must stay out of the earlier temporal checkpoint. |

Seeded-book titles that must **not** appear on this server: “Bank of Canada cuts rates in October” (`evt-boc-cut`), “Extra-territorial GPU license expansion”, “Frontier model released before December 1”. The mixed book’s top-bar label is **Demo + sourced data** plus a separate **PostgreSQL** chip. That label is honest. It is not permission to show the seeded catalog.

Demo mode (`OMEN_STORAGE_MODE=demo` with `NODE_ENV=development` or `test`, and no production marker) is a separate negative/positive control. It is not the M0 book.

## Environment

Match Application CI (`.github/workflows/application-ci.yml`):

- Node 22
- PostgreSQL 16 on `127.0.0.1:5432`
- `OMEN_TEST_DATABASE_ADMIN_URL=postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres`
- Chrome or Chromium. The workflow suite reads `CHROME_PATH`. This cloud image uses `/usr/bin/chromium` (`.cursor/environment.json`).

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --porcelain
node -v
psql "$OMEN_TEST_DATABASE_ADMIN_URL" -c 'SELECT version();'
test -x "${CHROME_PATH:-/usr/bin/chromium}" && echo "chrome ok"
```

`git status --porcelain` must be empty before final QA. `HEAD` must equal the recorded candidate SHA.

Export the admin URL in the same shell as `npm run test:db` and `npm run test:workflow` if it is not already in the environment. Cloud agents source `.cursor/scripts/cloud-agent-env.sh`.

## Automated commands

Run these in order on the candidate. Record the exit code of each. A green local run is not CI. Do not delete or weaken a test to go green.

```bash
npm ci
npm run lint
npx next typegen
npm run typecheck
npm test
npm run build
npm run test:db
CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}" npm run test:workflow
```

`npm run intake:check` is external-source smoke. An intake outage does not fail the five journeys and does not pass them. Record it separately. Do not treat it as M0 evidence.

### What `npm run test:workflow` already proves

The suite builds, migrates a disposable database, upserts the synthetic fixtures, and starts two production servers: one on that database and one pointed at a missing database. These cases are the automated form of the five journeys plus the regression rows. Re-running the file is the reproducible check. Do not reimplement it.

| Journey or regression | Test name in `integrated-workflow.workflow.test.ts` | Screenshot the suite writes |
| --- | --- | --- |
| Pulse, no seeded book | `opens Pulse from the homepage with a real click` | `test-artifacts/01_pulse.png` |
| Event detail, evidence, Move Log | `opens event evidence and the published Move Log from the card` | `test-artifacts/02_event_evidence_move_log.png` |
| Checkpoint reconstruction, return to present | `reconstructs a checkpoint from the shareable history URL and returns to present` | `test-artifacts/03_return_to_present.png` |
| Archive deep link | `reaches the same checkpoint from Archive and keeps the URL shareable` | `test-artifacts/03b_archive_checkpoint.png` |
| Fresh-session checkpoint URL | `opens a shared checkpoint URL in a fresh browser session` | `test-artifacts/07_fresh_session_checkpoint.png` |
| Mobile, no horizontal overflow | `keeps mobile layout inside the viewport` | `test-artifacts/04_event_detail_mobile.png` |
| Following refresh and empty list | `keeps Following across a hard refresh and preserves an intentionally empty watchlist` | none — browser pass must capture this |
| Database unavailable | `renders the outage workspace without demo fallback` and `fails visibly on a database outage without serving demo events` | none — browser pass must capture this |
| Provenance on the synthetic book | `renders Pulse from the write-path book, not the demo catalog` | covered by `01_pulse` if the chip is in frame |
| Share control | not covered | blocked until OMEN-002; then the browser pass below |

Targeted unit commands for the regression rows. These do not replace `npm test`. Use them when a journey fails and the failure should be isolated.

```bash
npx vitest run \
  src/app/\(workspace\)/legacy-fixture-routes.test.tsx \
  src/app/\(workspace\)/workspace-routes.test.tsx \
  src/app/api/events/route.test.ts \
  src/app/api/events/\[id\]/history/route.test.ts \
  src/app/api/events/\[id\]/history/\[checkpointId\]/route.test.ts \
  src/lib/data/repository.test.ts \
  src/lib/db/config.test.ts \
  src/lib/following/following.browser.test.tsx \
  src/lib/following/persistence.test.ts \
  src/components/layout/app-shell.test.tsx \
  src/components/archive/archive-navigation.test.tsx \
  src/app/\(workspace\)/events/\[id\]/history/\[checkpointId\]/page.test.tsx \
  src/test/data-boundary.test.ts
```

## Browser journey checklist

Run this only on the candidate, after `npm run build`, against production `next start`. The workflow suite does this itself. The numbered pass below is the additional evidence pack: quarantine, Share, empty Following, outage, provenance at 390, and the seeded-book negative control. Do not point this pass at `next dev` with an unset `OMEN_STORAGE_MODE`. That mode is a failure state after OMEN-001, not a book.

Viewports: **1440×900** and **390×844**. Capture both for every journey row marked mobile.

### Server A — synthetic database book

Use the database the workflow suite just migrated, or repeat its upserts against a new disposable database created the same way (`createMigratedDatabase` via `npm run test:workflow`). Do not point Server A at a database that still holds only the seeded catalog.

```bash
NODE_ENV=production OMEN_STORAGE_MODE=database \
  DATABASE_URL="<disposable workflow url>" \
  npx next start -H 127.0.0.1 -p 3210
```

### Server B — database unavailable

```bash
NODE_ENV=production OMEN_STORAGE_MODE=database \
  DATABASE_URL="postgresql://omen_test:local_ci_only@127.0.0.1:5432/omen_workflow_missing" \
  npx next start -H 127.0.0.1 -p 3211
```

### Server C — production refuses demo mode

```bash
NODE_ENV=production OMEN_STORAGE_MODE=demo \
  npx next start -H 127.0.0.1 -p 3212
```

### Server D — explicit non-production demo (control only)

```bash
NODE_ENV=development OMEN_STORAGE_MODE=demo \
  npx next dev -H 127.0.0.1 -p 3213
```

Server D may show the seeded book. That is allowed only on this server. Screenshots from Server D are controls, not the M0 book.

### Journey 1 — Pulse

URL: Server A `http://127.0.0.1:3210/pulse`. Also open `/` and activate “Explore the demo” (`a.btn-primary`). Landing URL path ends in `/pulse`.

| Check | Expected |
| --- | --- |
| Document | HTTP 200. Heading **Pulse**. |
| Book | The temporal question is visible. The single-observation question is visible. |
| Seeded book | Body text does not contain “Bank of Canada cuts rates in October” or “Extra-territorial GPU license expansion”. |
| Provenance | Chip text **Demo + sourced data**. Separate chip **PostgreSQL**. No “live” or “real-time” indicator. |
| Nav at 1440 | Pulse, Explore, Following, More. More contains Archive and the public page. Markets, Signals, Agents, Research, Relations, Alerts, Team, and API are not links. |
| Nav at 390 | Bottom nav with those four labels. Items at least 44px tall. Provenance chip computed `display` is not `none`. |
| Empty filter | A search that matches nothing shows **No matching events**. It does not invent rows. |
| Palette | Ctrl+K or the Search button opens the dialog. Escape closes it. No Ask, Rewind, Create, or Agents command. |

Evidence: `j1-pulse-1440.png`, `j1-pulse-390.png`, `j1-pulse-empty-filter.png`.

### Journey 2 — Events (Explore)

URL: Server A `/events`.

| Check | Expected |
| --- | --- |
| Document | HTTP 200. Heading **Explore**. |
| Book | Same synthetic events as Pulse, as the full filtered book, with a visible result count. |
| Seeded book | Absent, same titles as Journey 1. |
| Provenance | **Demo + sourced data** and **PostgreSQL**. |
| Follow | A Follow control exists on a card and does not navigate away. After toggle, the button reads Following (`aria-pressed=true`). |
| Mobile | No horizontal overflow (`scrollWidth === clientWidth` on `document.documentElement`). Source column may be hidden. The provenance chip stays visible. |

Evidence: `j2-explore-1440.png`, `j2-explore-390.png`.

### Journey 3 — Event detail

URL: Server A `/events/evt-test-temporal`. Open it from the Pulse card whose accessible name is `Open brief for Will the example agency publish the 2026 bulletin before 1 December 2026?`.

| Check | Expected |
| --- | --- |
| Document | HTTP 200. Path ends `/events/evt-test-temporal`. Heading is the synthetic title, not a seeded title. |
| Figures | Current **55.3%**, previous **41.5%**, change **+13.8 pp**. |
| Honesty | Latest-observation line includes **not a live feed**. No σ, identification confidence, or explained bar presented as a measurement. |
| Evidence | **Inspect evidence** reveals **Evidence on record**, “SYNTHETIC TEST agency notice”, **Not stated by source**, and a link to `https://example.test/synthetic/agency-bulletin-2026`. |
| Move Log | Visible id `ml-test-temporal-1`, version 1. Later title “[SYNTHETIC TEST] Example agency published the 2026 bulletin (updated)” is absent. |
| Actions | Follow / Following, and **Open recorded history** (`a[data-testid=event-archive-link]`). |
| Unknown id | `/events/evt-does-not-exist` shows **Event not in the book**. It does not show the temporal title or a seeded title. |
| One observation | `/events/evt-test-single` shows **Not computable** and “Only one observation is recorded, so no change can be computed.” |
| Sourced row | `/events/evt-test-sourced` links `https://example.test/synthetic/sourced-filing`. Card or brief provenance says **Sourced**, not Demo. |
| Mobile | At 390 the inspector stacks under the brief. No horizontal overflow. Provenance chip visible. |

Evidence: `j3-brief-1440.png`, `j3-brief-evidence.png`, `j3-brief-390.png`, `j3-unknown.png`, `j3-single.png`, `j3-sourced.png`.

### Journey 4 — Archive and history honesty

Read the checkpoint id from the workflow log or from `GET /api/events/evt-test-temporal/history` (`checkpoints[0].id` is not always the earliest; use the id the suite printed as the first upsert checkpoint for `evt-temporal.json`). Call that id `<early>`.

| Step | Expected |
| --- | --- |
| Open recorded history from the brief | URL selects `event=evt-test-temporal`. |
| Select checkpoint `<early>` | Body contains **Historical checkpoint view** or, on the history route, heading **Stored reconstruction**. Body contains the original temporal title and `ml-test-temporal-1`. It does not contain the later updated title, the correction note, or the intake excerpt. |
| Copy the address bar | Path is `/events/evt-test-temporal/history/<early>` or query is `/archive?event=evt-test-temporal&checkpoint=<early>`. |
| Paste that URL in a fresh profile | Same reconstruction. Title contains `Checkpoint <early>`. Seeded title is absent. |
| Reload | Same checkpoint id remains. Original title remains. |
| Return to present | Path is `/events/evt-test-temporal`. Current brief returns. |
| Switch Archive event to `evt-test-single` | `checkpoint` query is removed. The temporal reconstruction panel is gone. |
| Back, then forward | Back restores `<early>`. Forward returns to the single event with no checkpoint. |
| Unknown checkpoint | `/events/evt-test-temporal/history/9007199254740993` shows **Historical view unavailable** or “No verified history checkpoint”. Current title is withheld. |
| Invalid id | `/events/evt-test-temporal/history/ck-early` shows **Historical view unavailable**. Current title is withheld. |
| Arbitrary time | `/archive?event=evt-test-temporal&at=2026-09-01T00:00:00.000Z` and `/events/evt-test-temporal/history/<early>?at=2026-09-01T00:00:00.000Z` show **Historical view unavailable**. The page must not render “Event semantics in this checkpoint” or the current brief figures as history. API status for the `at` query is **422** `unsupported_history`. The HTML document status may be 200; the on-page “422” is copy. |
| API reconstruction | `GET /api/events/evt-test-temporal/history/<early>` is 200, includes `contentMd5`, and the body is not the current `AionEvent` shape used by `GET /api/events/:id`. |

Evidence: `j4-archive-checkpoint-1440.png`, `j4-history-deep-link.png`, `j4-fresh-profile.png`, `j4-return-present.png`, `j4-arbitrary-time.png`, `j4-missing-checkpoint.png`. Save the two API response bodies as `j4-history-list.json` and `j4-history-replay.json`.

### Journey 5 — Following

Storage key for Server A is `omen-v0-following/v1/database`.

| Step | Expected |
| --- | --- |
| Fresh profile, open `/watchlists` before any toggle | Either **Nothing followed** or the repository default ids, because a missing key may seed once. Record which. |
| On `/events/evt-test-single`, activate `Follow [SYNTHETIC TEST] Single observation event` | Button becomes Following. |
| Open `/watchlists` | Heading **Following**. Description contains **Saved in this browser.** The single-observation title is listed. |
| Hard reload | The same title remains. `localStorage` key above parses as `{ version: 1, eventIds: ["evt-test-single"], userSaved: true }`. |
| Empty on purpose | Set that key to `{"version":1,"eventIds":[],"userSaved":true}` and reload. Heading area shows **Nothing followed** and “Open an event and follow it to pin it here.” The single-observation title does not return. The seeded ids `evt-boc-cut`, `evt-frontier-release`, `evt-fed-cut`, and `evt-housing-ca` do not return. |
| Unresolved id | Set `eventIds` to `["evt-not-in-book"]` with `userSaved: true` and reload. Row reads **Event not in the current book** and shows the id. It is not replaced by a seeded title. |
| Hint | Copy states the list is saved in this browser only and is not synced. No account UI. |
| Mobile | At 390, no horizontal overflow. Provenance chip visible. Last-catalyst and next-event columns may be hidden. |

Evidence: `j5-following-filled.png`, `j5-following-after-reload.png`, `j5-following-empty.png`, `j5-following-unresolved.png`, `j5-following-390.png`. Also save the `localStorage` value after the empty reload as `j5-empty-storage.json`.

## Regression checks

### Production fake-intelligence quarantine

On Server C (`NODE_ENV=production`, `OMEN_STORAGE_MODE=demo`):

```bash
curl -sS -D - -o /tmp/omen004-api-events.json http://127.0.0.1:3212/api/events
curl -sS -o /tmp/omen004-api-boc.json -w "%{http_code}" http://127.0.0.1:3212/api/events/evt-boc-cut
for path in markets signals agents research relations alerts graph; do
  code=$(curl -sS -o "/tmp/omen004-$path.html" -w "%{http_code}" "http://127.0.0.1:3212/$path")
  echo "$path $code"
done
```

| Check | Expected |
| --- | --- |
| `GET /api/events` | **503**. Body is exactly `{"storage":"misconfigured","error":"Event storage is unavailable"}`. Serialized body does not contain `evt-boc-cut` or “Bank of Canada”. |
| `GET /api/events/evt-boc-cut` | **503**. Same shape. No `event` object. |
| `/markets` `/signals` `/agents` `/research` `/relations` `/alerts` `/graph` | **404**. HTML does not contain “USD/CAD”, “BoC Oct cut”, “Illustrative demo figures”, “0.73”, “Armed”, or “Triggered”. Visible heading is **This view is not available** and “OMEN is not serving a substitute book for this screen.” |
| `/pulse` and `/events` on Server C | **Data unavailable** or **Workspace data unavailable**. No seeded title. The chip is not **Demo data**. |
| Unset mode | Repeat the API curl with `OMEN_STORAGE_MODE` unset and `NODE_ENV=production`. Same 503 body. |
| Server D control | `NODE_ENV=development` and `OMEN_STORAGE_MODE=demo` may return 200 and `evt-boc-cut`. The chip says **Demo data**. This control must not be the screenshot used for the M0 book. |

Evidence: the curl transcripts, `reg-quarantine-markets.png`, `reg-quarantine-agents.png`, `reg-quarantine-pulse.png`.

### Share control (blocked until OMEN-002 is in the candidate)

Do not run this section on a tree without the Share control. Record `BLOCKED: OMEN-002 not in candidate` and stop certification.

When the control is present, on Server A:

| Surface | Action | Expected |
| --- | --- | --- |
| `/events/evt-test-temporal` | Activate Share | Clipboard or the on-screen fallback is the absolute brief URL ending `/events/evt-test-temporal`. Confirmation says the link was copied, or the URL is shown. |
| History `/events/evt-test-temporal/history/<early>` | Activate Share | Copied URL is that history URL, including `<early>`. It is not the present brief URL. |
| `/archive?event=evt-test-temporal&checkpoint=<early>` | Activate Share | Copied URL keeps `event` and `checkpoint`. |
| Any of the three | After copy | No contact picker, no account dialog, no share count, no “live” wording. |
| Paste into a fresh profile | Open the copied checkpoint URL | Same reconstruction as Journey 4. |

If the clipboard API is denied, the control must still show the URL. That is a pass. A silent failure is a blocker.

Evidence: `reg-share-brief.png`, `reg-share-checkpoint.png`, `reg-share-archive.png`, and a text file of the three copied URLs.

### Deep-linked checkpoint reconstruction

Covered by Journey 4. Additional blocker checks:

- A later write to `evt-test-temporal` (the suite’s `evt-temporal.later.json`) does not change the body of `<early>`.
- Verification failure does not substitute the current brief. The suite’s tamper case expects refusal without the current title.
- `?checkpoint=` on the brief redirects to the history path or refuses. It does not render the current brief under a historical label.
- Demo storage (Server D) `/archive` says stored reconstruction is not available from this storage mode and does not invent checkpoint ids.

### Database unavailable

On Server B:

| Request | Expected |
| --- | --- |
| `GET /api/events` | **503** `{"storage":"database","error":"Event storage is unavailable"}`. No `events` array. No `evt-boc-cut`. |
| `GET /api/events/evt-test-temporal` | **503**. No `event`. |
| `GET /api/events/evt-test-temporal/history/<early>` | **503**. `outcome` `unavailable`. No event title. |
| `/pulse`, `/events`, `/watchlists`, `/archive` | **Workspace data unavailable** or **Data unavailable**. Try again is present on the segment error. Seeded titles and synthetic titles are absent. |
| History URL | **Historical view unavailable** and “Event storage is unavailable.” Label **503**. Current title withheld. |
| Top bar | **Data unavailable**. Not **Demo data**. **PostgreSQL** may still be shown because the configured mode is database. |

Evidence: `reg-outage-pulse.png`, `reg-outage-history.png`, `reg-outage-api.json`.

### Empty Following refresh

Covered by Journey 5’s empty-key reload. A reseed of `evt-boc-cut` or of the last followed id after `userSaved: true` and `eventIds: []` is a blocker. A first visit with no key may seed repository defaults; that is not this case.

### Provenance labels

| Book | Chip on `/pulse`, `/events`, `/watchlists`, `/archive`, and the brief |
| --- | --- |
| Server A synthetic mix | **Demo + sourced data** |
| A sourced-only book | **Sourced data** |
| Server D demo book | **Demo data** |
| Empty readable store | **No data** |
| Server B or Server C | **Data unavailable** |
| Database mode, any of the above | Extra **PostgreSQL** chip when the shell knows the mode |
| Demo records inside PostgreSQL | Still labeled demo on the card (`data-testid=event-provenance` text **Demo**). Storage mode does not upgrade them to sourced. |

No chip title or body string may say the workspace is live or streaming. “not a live feed” is required on the brief’s latest observation and is not a live indicator.

At 390, `.aion-demo-chip` and the other provenance chips stay visible (`display` is not `none`). Evidence: `reg-provenance-1440.png`, `reg-provenance-390.png` with the computed style recorded in `reg-provenance-390.txt`.

### Mobile behavior

At 390×844 on Server A, for `/pulse`, `/events`, `/events/evt-test-temporal`, `/watchlists`, `/archive`, and the history URL:

- `document.documentElement.scrollWidth === document.documentElement.clientWidth`
- Bottom nav shows Pulse, Explore, Following, More
- Provenance chip is visible
- Event detail stacks
- Following and Explore do not require sideways scrolling to reach Follow

At 1440×900 the sidebar shows the same three destinations plus More, and the provenance chip is visible.

Evidence: one full-page screenshot per route at each width, named `mobile-<route>-390.png` and `desktop-<route>-1440.png`.

### No seeded-book fallback

On Server A and Server B and Server C, these strings are absent from HTML and from API JSON:

- `evt-boc-cut`
- `Bank of Canada cuts rates in October`
- `Extra-territorial GPU license expansion`
- `Frontier model released before December 1`

Server D is the only server where those strings are allowed, and only while the chip says **Demo data**.

## Evidence required before anyone says certified

Save the pack under `test-artifacts/omen-004/<candidate-sha>/` and copy the human-facing images to the agent artifact directory used for the run.

| Artifact | Required content |
| --- | --- |
| `candidate.txt` | `origin/main` SHA, OMEN-001 merge SHA, OMEN-002 merge SHA, `git status --porcelain` empty |
| Command log | Exit code and the summary line for every command in [Automated commands](#automated-commands) |
| `test-artifacts/release-verification.json` | `headSha` equals the candidate. `laterWriteApplied` and `intakePublished` true when the suite finished those cases. |
| Workflow screenshots | `01_pulse`, `02_event_evidence_move_log`, `03_return_to_present`, `03b_archive_checkpoint`, `04_event_detail_mobile`, `07_fresh_session_checkpoint` |
| Journey screenshots | Every file named in the five journeys |
| Regression screenshots and curls | Quarantine, outage, provenance at 390, empty Following storage JSON |
| Share URLs | The three copied URLs, or `BLOCKED` if OMEN-002 is absent — a `BLOCKED` row means not certified |
| Defect log | One row per failure: route, SHA, expected, observed, screenshot path. Empty is allowed only when every blocker row passed. |

Do not invent a screenshot, an exit code, or a CI URL.

## Defects that block M0

Any one of these blocks certification. File it against the candidate SHA. Do not merge a workaround that serves the seeded book, hides a 503, or renders the current brief as history.

| Id | Blocker |
| --- | --- |
| B1 | Production, unset mode, or a failed database read serves a seeded-catalog title or `evt-boc-cut`, on a page or on `/api/events`. |
| B2 | `/markets`, `/signals`, `/agents`, `/research`, `/relations`, `/alerts`, or `/graph` returns 200 in production, or renders fixture figures (calibration percentages, “0.73”, Armed/Triggered alerts, “USD/CAD”). |
| B3 | Pulse, Explore, the brief, Archive, or Following shows a live, real-time, or streaming indicator, or labels a demo-provenance record as sourced. |
| B4 | A deep-linked checkpoint shows a later revision, the current brief, or a seeded title, or an `at` / `cutoff` URL reconstructs a current event. |
| B5 | An unknown event, missing checkpoint, invalid checkpoint id, or failed digest shows current book text instead of the unavailable or not-in-book state. |
| B6 | Database unavailable renders demo or synthetic events, or the API returns 200 with an empty substitute book. |
| B7 | After `omen-v0-following/v1/database` is `{"version":1,"eventIds":[],"userSaved":true}`, a reload shows any followed row. |
| B8 | At 390, a core route overflows horizontally or the provenance chip’s computed display is `none`. |
| B9 | Share is missing, copies the wrong URL, fails silently when the clipboard is denied, or opens an account, picker, or counter. This row stays blocking until OMEN-002 is in the candidate and the check passes. |
| B10 | Promoted navigation or the command palette links to Markets, Signals, Agents, Research, Relations, Alerts, Team, or API. |
| B11 | A client component imports `IntelligenceRepository`, a repository adapter, or `@/data/events` (the data-boundary test fails). |
| B12 | The workflow suite, `npm test`, `npm run test:db`, lint, typecheck, or the production build fails on the candidate. |

These do **not** block M0 by themselves:

- Server D showing the labeled demo book.
- The historical constant `TESTED_MAIN_SHA` inside `harness.ts` differing from the candidate, when `release-verification.json` records the real `headSha`.
- `npm run intake:check` failing because CISA is unreachable.
- Following’s description still saying “Markets, entities and event classes” while the rows are events, the empty state is honest, and no market fixture data is shown. Record it as copy debt. It becomes B3 or B10 only if those rows are fixture markets or the nav starts linking a markets screen.
- Stale sentences in `docs/ui-route-state-matrix.md`.
- Settings still describing a local mock repository, if Settings is unlinked and returns no events.
- The marketing page’s labeled illustrative demo.

## Preparation command smoke

On 2026-10-03 the targeted unit command in [Automated commands](#automated-commands) was executed once against production code `aea8636c555736de9d61110abc8a05a173a67d79` to prove the paths resolve. This is not a journey pass and not M0 certification. `npm run test:workflow`, `npm run test:db`, lint, typecheck, the production build, and every browser row stayed **NOT RUN**.

| Command | Result |
| --- | --- |
| `npx vitest run` of the 12 unit files listed above, except `archive-navigation.test.tsx` | Exit 0. 12 files, 106 tests passed. |
| `npx vitest run src/components/archive/archive-navigation.test.tsx` | Exit 0. 1 file, 24 tests passed. |

## Certification record

Fill this table on the final run. Until then every result is `NOT RUN` and the decision is `NOT CERTIFIED`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Candidate SHA contains OMEN-001 and OMEN-002 | NOT RUN | |
| `npm run lint` | NOT RUN | |
| `npx next typegen` | NOT RUN | |
| `npm run typecheck` | NOT RUN | |
| `npm test` | NOT RUN | |
| `npm run build` | NOT RUN | |
| `npm run test:db` | NOT RUN | |
| `npm run test:workflow` | NOT RUN | |
| Journey 1 Pulse | NOT RUN | |
| Journey 2 Events | NOT RUN | |
| Journey 3 Event detail | NOT RUN | |
| Journey 4 Archive / history | NOT RUN | |
| Journey 5 Following | NOT RUN | |
| Quarantine | NOT RUN | |
| Share | NOT RUN | |
| Deep link | NOT RUN | |
| Database unavailable | NOT RUN | |
| Empty Following | NOT RUN | |
| Provenance | NOT RUN | |
| Mobile | NOT RUN | |
| No seeded-book fallback | NOT RUN | |
| Application CI on the candidate SHA | NOT RUN | |
| **Decision** | **NOT CERTIFIED** | OMEN-002 had not landed when this plan was written. |

Independent review, merge, and deploy are separate from this decision. A pass in the table above is not a merge and not a deployment.
