# Current-state reconciliation — 2026-10-07

Refresh of the already accepted October Task 7 findings. This file does not complete Task 7 again, and it does not reopen OMEN-004. OMEN-004 stays done: its baseline on `main` is **FAIL 2/8**. Task 13 is the separate journey map in [2026-10-07-v0-user-journey.md](2026-10-07-v0-user-journey.md).

Checked on 2026-10-07 against GitHub, not against the stale sentences still on the OMEN Execution Center and the October plan. Those Notion pages were read and not edited.

## Heads

| Record | SHA | Where it lives |
| --- | --- | --- |
| `main` | [`aea8636c555736de9d61110abc8a05a173a67d79`](https://github.com/jacksonissacs/V_Omen_V/commit/aea8636c555736de9d61110abc8a05a173a67d79) | Merged PR [#31](https://github.com/jacksonissacs/V_Omen_V/pull/31). Fetched `origin/main` matches this SHA. |
| OMEN-004 evidence | [`752499d0569f3c782b95fa00eec5ad810d8ff8fc`](https://github.com/jacksonissacs/V_Omen_V/commit/752499d0569f3c782b95fa00eec5ad810d8ff8fc) | Open draft PR [#33](https://github.com/jacksonissacs/V_Omen_V/pull/33), 0 behind / 5 ahead of `main`. |
| D1 tested code | [`79596c41232b092dbf5640979039d14f49a0d83c`](https://github.com/jacksonissacs/V_Omen_V/commit/79596c41232b092dbf5640979039d14f49a0d83c) | Open draft PR [#34](https://github.com/jacksonissacs/V_Omen_V/pull/34). |
| D1 evidence head | [`1fa914127bf6bb56978eb8debe7fcd61eb645734`](https://github.com/jacksonissacs/V_Omen_V/commit/1fa914127bf6bb56978eb8debe7fcd61eb645734) | Same PR #34 tip. Docs and receipts only after `79596c4`. |

`git diff --stat 79596c4 1fa9141` touches only `docs/release-qa/`. The application tree of the evidence head is the tested code. Neither SHA is on `main`. Neither is deployed.

## Candidate versus `main`

| | `main` `aea8636c` | Draft candidate |
| --- | --- | --- |
| October 8/8 | **FAIL 2/8**. Reality guard and regression pass. Discover, Understand, Evidence, Follow, Return, and the proof walk fail because the book is empty. [Matrix](https://github.com/jacksonissacs/V_Omen_V/blob/752499d0569f3c782b95fa00eec5ad810d8ff8fc/docs/release-qa/baseline-2026-10-07/matrix.md). | **PASS 8/8** on disposable PostgreSQL after stage → approve → publish. [Matrix](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/matrix.md). |
| Real event | `GET /api/events` is `200` with `events: []` and provenance `none`. Pulse shows “No events in the book yet”. [Shot](https://github.com/jacksonissacs/V_Omen_V/blob/752499d0569f3c782b95fa00eec5ad810d8ff8fc/docs/release-qa/baseline-2026-10-07/browser/discover-pulse-1440.png). | One sourced question, “Gemini 4.0 released by October 31, 2026?”, id `evt-gemini-4-public-2026-10-31`, market-implied 94.5%. |
| First publication from an empty book | Not available. PR #34 exists because review and publication rows could not precede the event row. | Migrations `0008`–`0010`, canonical idempotency JSON, and the operator bundle. Product diff against `main` is 21 files, +521 / −18, outside `docs/`. |
| Evidence reliability | `reliability` is a number and the panel prints `toFixed(2)`. | Null is stored and the panel prints “Not recorded”. [Panel](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/intelligence/intelligence-panel.tsx#L58-L61). |
| Local checks in the evidence log | 338 unit, 79 database, 33 workflow, all exit 0. | 342 unit, 81 database, 33 workflow, all exit 0. [commands.log](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/commands.log). |
| Application CI | Push run [37131563152](https://github.com/jacksonissacs/V_Omen_V/actions/runs/37131563152) succeeded on this SHA. PR #33 head CI [37631781494](https://github.com/jacksonissacs/V_Omen_V/actions/runs/37631781494) succeeded on `752499d`. | Code SHA run [37641372643](https://github.com/jacksonissacs/V_Omen_V/actions/runs/37641372643) green. Evidence-head run [37674484967](https://github.com/jacksonissacs/V_Omen_V/actions/runs/37674484967) green. Both are pull_request runs with `application` and External source smoke. |
| Review | Baseline recorded by OMEN-004. | [Cleared](https://github.com/jacksonissacs/V_Omen_V/pull/34#issuecomment-6045259279) on evidence head `1fa9141` for code `79596c4`. The reviewer did not rerun the suites or the browser journey. |
| Merged / deployed | This is `main`. Not a production deployment. | Draft, mergeable, unmerged. Not a deployment. Passing here is not production-ready. |

Share is not one of the eight checks. `cursor/share-control-f024` is [`a36c87f37654462b0bf73384d7f8201c5e8bf082`](https://github.com/jacksonissacs/V_Omen_V/commit/a36c87f37654462b0bf73384d7f8201c5e8bf082), 0 behind / 1 ahead of `main`. No pull request exists for that branch.

## BUILT on `main`

Present at `aea8636c`, without the Gemini publication:

- Consumer chrome is Pulse `/pulse`, Explore `/events`, Following `/watchlists`, and More. Archive is only inside More, at `/archive`. [Nav](https://github.com/jacksonissacs/V_Omen_V/blob/aea8636c555736de9d61110abc8a05a173a67d79/src/data/workspace.ts#L4-L21).
- Event brief, evidence inspector, browser-local Follow, and checkpoint Archive. The journey shell files are unchanged between `aea8636c` and `79596c4`, except the null-reliability label above.
- Server reads go through `IntelligenceRepository`. Production demo mode and an unset storage mode refuse the book (baseline reality guard **PASS**). PR #31 quarantine stays merged: `/markets`, `/signals`, `/agents`, `/research`, `/relations`, `/alerts`, and `/graph` are not a substitute book.
- Operator and analyst foundations from earlier merged work stay on `main`. They do not by themselves put a real AI-tech event in an empty production database.

## BUILT and verified only on the draft candidate

Verified only at code `79596c4` with evidence `1fa9141`, on a disposable database, `next start`, `OMEN_STORAGE_MODE=database`:

- Stage and approve while the event count is still 0, then publish one sourced event and verify checkpoint id 1. Same-key replay does not add a second checkpoint.
- Pulse and Explore show that event at 1440 and 390 with chip “Sourced”.
- The brief shows the question, 94.5%, one observation, change “Not computable”, and three evidence records.
- Scrolled 390 evidence shots name Polymarket gamma API, Polymarket, and the Google blog, with reliability “Not recorded”.
- Follow writes `omen-v0-following/v1/database` and survives reload. Following lists the event. Archive opens checkpoint 1.
- Reality guard still refuses demo and unset mode, and the quarantined routes answer 404.

That pass is the candidate. It is not `main`, and it is not a running deployment.

## BROKEN

Observed, not inferred:

- **On `main`, the October loop has no real event.** One defect fails six checks. Disposable schema-only database, zero rows, production `next start`. [Defects](https://github.com/jacksonissacs/V_Omen_V/blob/752499d0569f3c782b95fa00eec5ad810d8ff8fc/docs/release-qa/baseline-2026-10-07/defects.md).
- **On `main`, a reviewed bundle cannot become that first event.** PR #34 is the repair. It is not merged, so the empty-book failure remains the behavior of `main`.
- **On the candidate phone brief, the next controls are off the first screen.** At 390×844, `brief-evidence-390.png` ends on current probability and “Previous observation / None recorded”. Inspect evidence, Follow, and Open recorded history are below the resolution criteria. The evidence check passed only after a later scroll harness. This is the Task 13 weakest transition. It is not an 8/8 failure. Detail is in the journey doc.

Candidate limits that were recorded and are not check failures: one observation, so change is not computable and no move log exists; `observedAt` is the gamma market `updatedAt`, not a last-trade time; reliability is null; the public Polymarket embed’s 0.95/0.06 is not the stored 0.945. [defects.md](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/defects.md).

## BLOCKED

Owner decisions. This document does not grant them.

- Merge of draft PR #34. Review clearance is not merge approval.
- Any production or staging deployment, production database write, or public publication of the Gemini bundle.
- Authentication, account sync, billing, live LLM calls.
- Keep-or-close for older drafts. Open as of this check: #7, #9, #11, #14, #15, #16, #18, #19, #20, #25, #30, #32, #33, #34. #9, #11, #14, #15, #16, #18, #20, and #25 report merge conflicts. #11 and #25 do not target `main`. None of them is evidence of what `main` contains. #31 stays merged. #33 stays the OMEN-004 baseline record. #34 stays the unmerged candidate.
- Share’s pull request does not exist yet. Opening it is outside the eight checks.

## NEXT

1. Owner decision on draft PR #34. Until it is merged, `main` remains the 2/8 baseline. This file does not approve the merge.
2. If it is merged, verify the new `main` SHA and its CI. That verification is still not a deployment.
3. Task 14, proposed in the journey doc and not approved: put Inspect evidence, Follow, and Open recorded history above the resolution criteria so a 390×844 first viewport can reach them.
4. Share, if the owner still wants the older M0 track: open a PR from `cursor/share-control-f024` at `a36c87f`. It does not unblock the October loop.
5. Owner keep-or-close of the older drafts. Do not close them from a docs branch.

## Notion sentences this refresh replaces

Read at Execution Center `page_last_edited_at` 2026-10-07T13:12:26Z and October plan `page_last_edited_at` 2026-10-07T11:54:17Z. Both still say PR #33 is only QA preparation, the 8/8 proof has not run, and the next step is to run the OMEN-004 baseline. Those statements are stale. The baseline has run and failed 2/8. The candidate rerun passed 8/8 and is unmerged. Task 7 stays accepted. OMEN-004 stays done. Task 13 stays open until the owner accepts the journey doc.

## Uncertainty

CI conclusions and the review comment were read from GitHub on 2026-10-07. The committed logs and screenshots were read from the evidence commits. This docs pass did not rerun unit, database, or workflow tests, did not rebuild the app, and did not repeat the browser journey. The independent reviewer also did not rerun them. Receipt hashes were not recomputed here.
