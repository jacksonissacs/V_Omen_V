# Consumer UI baseline

Audit evidence for [consumer-design-contract.md](consumer-design-contract.md) and [ui-route-state-matrix.md](ui-route-state-matrix.md). No application source changed in this pass.

## Git

| Point | SHA | Note |
| --- | --- | --- |
| Session start, local `main` | `1d96881ddeeb22a3cbc658e1a34bb7973af07a04` | Snapshot was behind the remote. Commit subject: `chore(cloud-agent): merge reviewed beta environment (#22)`. |
| `origin/main` after `git fetch origin main` | `1a7ad2b00f791fa531e5bcda2203797533d3a849` | `Merge pull request #21 from jacksonissacs/cursor/archive-followup-fixes-86f4`. Eight commits ahead of the snapshot, including the archive follow-up. |
| Branch base and head at audit time | `1a7ad2b00f791fa531e5bcda2203797533d3a849` | `cursor/consumer-design-contract-a02d` was created from that `origin/main`. Working tree was clean. |

`origin/main..HEAD` was empty before these docs. Local `main` had no commits that were absent from `origin/main`.

## Environment

- Node v22.23.3, Next.js 16.3.4, React 19.2.8, Vitest 3.2.7.
- Dependencies installed with `npm ci` (807 packages). `npm audit` reported 5 vulnerabilities (2 moderate, 3 high) and was not used to change the lockfile.
- Screenshots: `next dev` on `127.0.0.1:3000`, `OMEN_STORAGE_MODE=demo`, Chromium `/usr/bin/chromium`, headless, device scale 1.
- Viewports: 390×844 and 1440×900.
- PostgreSQL 16 was accepting connections on `127.0.0.1:5432`. `test:db` used `OMEN_TEST_DATABASE_ADMIN_URL=postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres`.

This is a dev-server visual baseline, not a `next start` capture.

## Checks on the base SHA

Recorded before these documents were added. Exit codes are from this machine. A local pass is not CI and is not independent review.

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 |
| `npx next typegen` | Pass, exit 0. No tracked files changed. |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass, exit 0. 41 files, 263 tests. |
| `npm run test:db` | Pass, exit 0. 4 files, 60 tests. |
| `npm run build` | Pass, exit 0. Next.js 16.3.4. `/` and `/graph` static; workspace routes dynamic. |
| `npm run test:workflow` | **NOT RUN.** It needs a production server plus Chrome and covers publication, not this documentation diff. It is not claimed as a pass. |
| `npm run intake:check` | **NOT RUN.** External CISA reachability. Not part of this audit. |

No test failed on this base. There is no failing suite to separate from a regression. These docs do not change runtime code. After the three documents were on disk, `npm run lint` and `npm test` were run again; results are in [Post-change checks](#post-change-checks).

Log excerpt for the unit run is in the agent artifact `baseline-checks.log`.

## Post-change checks

Same commands after `docs/consumer-design-contract.md`, `docs/ui-route-state-matrix.md`, and this file were saved. No application source was edited between the two runs.

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 |
| `npm test` | Pass, exit 0. 41 files, 263 tests. Same count as the base run. |
| `npm run typecheck` | Not repeated. The base run passed, and these files are markdown. |
| `npm run test:db` | Not repeated. The base run passed. These files do not touch SQL. |
| `npm run build` | Pass, exit 0, on the tree that already contained the documents. Next does not route markdown in `docs/`. |

No assertion was removed or weakened.

## Screenshots

Files are environment artifacts (not committed). Names are `route-width.png` from the capture set.

Overflow: for every route below, `documentElement.scrollWidth` equalled `clientWidth` at both widths.

Console: no `pageerror`. `/archive` logged a failed resource at HTTP 422, which matches demo storage refusing checkpoint replay. `/events/not-in-the-book` logged the 404.

| Capture | 390 | 1440 | Observed |
| --- | --- | --- | --- |
| `/` | `landing-390.png` | `landing-1440.png` | Silver mark, spectrum, “Explore the demo.” Marketing nav is in the header at 1440 and behind Menu at 390. |
| `/` menu | `landing-menu-390.png` | — | Menu open. No dialog. |
| `/pulse` | `pulse-390.png` | `pulse-1440.png` | H1 Pulse. Sidebar labels visible only at 1440. Demo chip visible only at 1440 (`display: none` at 390). |
| `/pulse` palette | `pulse-search-390.png` | `pulse-search-1440.png` | Navigate: Intelligence, Events, Watchlists, Settings. Four event titles. Footer claims ↑↓ and Enter. |
| `/events` | `events-390.png` | `events-1440.png` | Book rows. Source column present at 1440 and absent at 390. |
| `/events/evt-boc-cut` | `event-brief-390.png` | `event-brief-1440.png` | 73.8%, 61.2%, +12.6 pp. Illustrative. Follow shows Following because of the demo seed. |
| `/watchlists` | `watchlists-390.png` | `watchlists-1440.png` | Four seeded events. Catalyst and next-event columns only at 1440. |
| `/archive` | `archive-390.png` | `archive-1440.png` | “Stored reconstruction is not available from this storage mode.” |
| `/settings` | `settings-390.png` | `settings-1440.png` | Density, timezone, alert checkbox, API lines. |
| `/agents` | `agents-390.png` | `agents-1440.png` | Fixture calibration cards. |
| `/research` | `research-390.png` | `research-1440.png` | H1 Alan. |
| `/relations` | `relations-390.png` | `relations-1440.png` | Static graph and inspector. |
| `/alerts` | `alerts-390.png` | `alerts-1440.png` | Armed / Triggered rows. |
| `/markets` | `markets-390.png` | `markets-1440.png` | Fixture market rows. |
| `/signals` | `signals-390.png` | `signals-1440.png` | H1 Signals. |
| `/team` | `team-390.png` | `team-1440.png` | Placeholder. |
| `/api-access` | `api-access-390.png` | `api-access-1440.png` | H1 API. |
| `/graph` | `graph-390.png` | `graph-1440.png` | Landed on `/relations`. |
| Unknown event | `event-missing-390.png` | `event-missing-1440.png` | HTTP 404. H1 “Event not in the book.” |
| Arbitrary history | `history-arbitrary-390.png` | `history-arbitrary-1440.png` | HTTP 200. H1 “Historical view unavailable.” Current brief withheld. |

DOM probe (same server, both widths) confirmed the probability figures and the chip’s computed style. Image captions that disagreed with the probe were discarded. In particular, the brief is 73.8% at both widths, and the demo chip is not displayed at 390.

## Findings that the contract responds to

1. Phone navigation is an icon rail. Labels and the collapse control are `display: none` at 390, so the five destinations have no visible names and cannot be expanded.
2. The demo provenance chip is hidden at 390 on every probed workspace route, including Pulse and the brief. Card-level “Demo” chips on Pulse still show. The shell-level warning does not.
3. Promoted names are Intelligence, Events, Watchlists, Archive, and Settings. The Pulse heading is already “Pulse.” The palette omits Archive and uses the sidebar names.
4. Pulse silently keeps 12 of 32 demo events.
5. The scan card’s “View evidence” and “Open event” share one href.
6. The palette footer describes arrow and Enter behavior the component does not implement. Escape and ⌘K / Ctrl+K do work, from the provider.
7. Following is real and local. The screen description says “Markets, entities and event classes,” while the rows are events. A fresh demo browser shows four repository seed ids.
8. Settings presents density, timezone, and an alert threshold that do not persist and do not send.
9. Direct URLs still render invented calibration (`/agents`, `/research`), measured-looking graph statistics (`/relations`), and armed alerts (`/alerts`). They are unlinked. At 390 their demo chip is also hidden.
10. Archive in demo mode is an honest refusal, with a 422 in the console. The history sentence uses “live event record” for the current record.
11. Muted token `#5e6670` is 3.32:1 on `#0c0e11`, 3.18:1 on `#111418`, 3.00:1 on `#161a1f`. Primary `#e7e9ec` is 15.89:1 on `#0c0e11`. Secondary `#9ba3ad` is 7.58:1.
12. `openCall` has no caller. The call dialog remains in the tree with invented reveal numbers.
13. Marketing matches the handoff decisions already recorded in `design-reference/README.md`: no access dialog, silver mark, illustrative chips, spectrum. Workspace and marketing event cards are different components.

## Unmerged work to isolate

| PR | State on 2026-09-27 | Relation to this base |
| --- | --- | --- |
| #23 | Draft, open | One commit, `96676e1`, parent `1a7ad2b`. Stale older-page failure handling in `archive-view.tsx`. |
| #20 | Draft, open | Merge-base `0fb3dc6`, not `1a7ad2b`. Superseded as a branch by merged #21. Do not revive it for UI work. |
| #19 | Open | Docs only (`v0-integration-status.md` and two archive follow-up notes). Not a visual blocker. |
| #18, #16, #15, #14, #11, #9, #7 | Still open on GitHub | Integration status on an older head treated several as superseded. This audit did not re-merge or close them. |

No other branch named for a consumer design contract existed. This branch does not contain those pulls.

## Not captured

| Check | Status |
| --- | --- |
| Forced repository outage and the segment error page | **BLOCKED** for screenshots. Would need a failing repository. Copy is taken from `error.tsx`. |
| Empty book and “Nothing followed” after an explicit unfollow | **BLOCKED** for screenshots. Demo seed and the 32-event book occupied those states. Copy is taken from the components. |
| Loading flashes | **BLOCKED** for screenshots. Dev responses settled inside the navigation timeout. |
| Sourced and mixed provenance chips | **BLOCKED** for screenshots. This server was demo mode. Chip copy is in `top-bar.tsx`. |
| `prefers-reduced-motion` on the workspace | **BLOCKED** as a behavior check. `aion-workspace.css` has no reduced-motion rule to observe. Marketing behavior is specified in the design-reference README and was not re-shot here. |
| Safari and Firefox | **NOT RUN.** Chromium only. |
| Production `next start` visuals | **NOT RUN.** Shots are from `next dev`. |
| `npm run test:workflow` and `npm run intake:check` | **NOT RUN.** See the table above. |

## What this change is

Documentation only: this file, the contract, and the route matrix. It does not implement navigation, share, or the social network, and it does not edit archive, repository, or marketing code.
