# Consumer design contract

This is an implementation specification for a later UI task. It does not change runtime behavior, routes, or data.

**Current integration state (2026-09-27).** After `git fetch origin`, `origin/main` is `1032d318426b5e7fd818278cb3ca65c8ff5dafa1` (merge of pull request [#23](https://github.com/jacksonissacs/V_Omen_V/pull/23); reviewed head `f873fe1ca37811634f4d26f528d229463814020d`). That tree includes the Archive invariants from merged [#21](https://github.com/jacksonissacs/V_Omen_V/pull/21) and #23. The consumer UI implementation must branch from this `main`, not re-open Archive correctness work.

**Historical UI audit snapshot.** Screenshots, DOM probes, test counts, and route inventory in [consumer-ui-baseline.md](consumer-ui-baseline.md) and [ui-route-state-matrix.md](ui-route-state-matrix.md) were captured against `1a7ad2b00f791fa531e5bcda2203797533d3a849` (`origin/main` when the audit branched). That SHA is evidence only; it is not today’s `main`.

The next implementation task follows [omen-v0-build-contract.md](omen-v0-build-contract.md), [ai-first-beta-scope.md](ai-first-beta-scope.md), and [mobile-agent-playbook.md](mobile-agent-playbook.md). See [Preconditions](#preconditions-before-runtime-changes) for Archive boundaries during visual work.

## Product intent

OMEN’s consumer surface is an event-intelligence brief: a person can discover a tracked question, understand what moved, follow it in this browser, and share the same URL, with evidence and verified history one step away and the question still in view.

The ease to borrow from short-form browsing is a single vertical reading order, a large probability, and an obvious next action. The product stays a record. It does not become a video feed, a gesture-only app, or an engagement system.

## Non-goals

- A social network, accounts, follows that sync, comments, reactions, or public profiles.
- Authentication, billing, wallets, trading, paid data, or autonomous publishing.
- New forecast numbers, users, calibration, engagement, or live-status indicators.
- `observed_development` or any broadening of beta coverage. Category chips stay the categories already on recorded events.
- A redesign of the public page at `/`.
- Renaming internal `Aion*` identifiers, `.aion-app`, or `--a-*` as a goal. User-visible copy says OMEN.

## One visual family

Every OMEN surface uses the same materials:

- The approved silver OMEN mark, height-sized, `object-fit: contain`, never recolored, stretched, or shadowed. Workspace: `AionMark` and `public/brand/omen-symbol-64.png`. Marketing: the same symbol.
- Graphite surfaces already shared by `.aion-app` and `.omen-marketing`: `#0c0e11`, `#111418`, `#161a1f`, `#1c2127`.
- Inter for UI text and IBM Plex Mono, `font-feature-settings: "tnum" 1`, for probabilities, times, and ids.
- One spacing scale for new and touched consumer components (values below).
- One control set: button, chip, filter, field, menu. Product screens already use the `.aion-*` controls. The unused `src/components/ui/*` primitives are not a second visual language for this migration.
- Indigo `#8194ff` is the functional accent: focus ring and the active navigation icon. It is not a brand fill and not a probability color.
- Movement is signed (`+` / `−`) and written in percentage points. Brighter green `#6fae8f` and dimmer rose `#c08383` repeat that sign. Color is never the only carrier.
- Motion is short and purposeful. See [Motion](#motion).

## Three surfaces, on purpose

| Surface | Where | Character |
| --- | --- | --- |
| Marketing | `/` under `.omen-marketing` | Expressive. Spectrum, large type, demo walkthrough. Every product fragment keeps the illustrative-data chip. |
| Consumer brief | `/pulse`, `/events`, `/events/:id`, `/watchlists`, and the More menu | Readable hierarchy, one column on a phone, provenance always visible, evidence and history disclosed in place. |
| Analytical record | Archive, checkpoint replay, the event page after disclosure (chart table, chronology, move log) | Denser, still the same graphite, type, and controls. Extra detail appears under the brief. It does not introduce a new palette. |

Marketing keeps its rainbow spectrum, 15px body, and `--m-*` tokens. The workspace stays dense at 14px. Those differences are intentional. A consumer task does not flatten them.

## Navigation

Four destinations. Existing routes. Labels change in the chrome only.

| Label | Route | What it is |
| --- | --- | --- |
| Pulse | `/pulse` | What moved, largest absolute change first. |
| Explore | `/events` | The whole book. Path stays `/events`. |
| Following | `/watchlists` | Events followed in this browser. Path stays `/watchlists`. |
| More | no new path | A menu. Archive is inside it. |

More contains:

- **Archive** → `/archive`. Recorded checkpoint replay. In demo storage the screen already says reconstruction is unavailable. That message stays.
- **Public page** → `/`. The existing marketing page.

More does not contain Markets, Signals, Agents, Research, Relations, Alerts, Team, API access, Settings, Ask, Rewind, or Create. Those routes may stay reachable by URL until a later deletion task. They are not promoted. Settings stays unlinked until its controls match real behavior; the current density, timezone, and alert controls do not persist and do not send anything.

The command palette searches the server-provided event index and offers the same four names, with Archive listed as history. It does not offer unfinished destinations.

Desktop (wider than 760px) uses the existing sidebar. Phone (760px and below) uses a bottom bar with the four labels and readable hit areas. The icon-only rail is not the phone navigation. See [Responsive behavior](#responsive-behavior).

## Event brief

### Scan card

`src/components/events/event-card.tsx` is the scan brief on Pulse. Order:

1. Category, probability basis (`Illustrative`, `Market-implied`, or `Authored forecast`), and provenance (`Demo` or `Sourced`).
2. Question title.
3. Latest probability. When two observations exist: previous → current, signed change, and the interval between those two timestamps.
4. Cause line, labeled. A move log is an attributed interpretation. Demo narrative is labeled illustrative. Absence is “No cause has been recorded.”
5. Source name, observed time, and OMEN capture time. Each missing time is “Not recorded.”
6. Recorded analogue count. Zero stays zero. Similarity is not scored.
7. Actions: open the brief, follow, and open evidence on that same brief. “View evidence” goes to the evidence region of `/events/:id`. It does not repeat “Open event” with the same destination.

Pulse states how many events are in view and how many are in the book. The current `slice(0, 12)` hides the rest with no count. The implementation either lists the filtered set or shows the cap and a path to Explore.

The “Expected reaction missing” note stays a labeled note. It is not a measured relationship.

### Brief page

`/events/:id` is the brief. Order:

1. Category, basis, evidence count, resolution date when recorded.
2. Title and the resolvable question.
3. Resolution criteria when recorded.
4. Current probability, previous observation, signed change. An OMEN forecast figure appears only when a stored forecast has author or model, issue time, method, and evidence cutoff. The empty case stays “No OMEN forecast has been recorded.”
5. Source and time lines from the record block (see below).
6. Follow, evidence, and recorded history. History keeps the event title in the crumb and a control back to this brief.
7. Four short answers already on the page: what changed, when, what the probability is, what likely caused it. The cause answer is marked as move-log interpretation when a log exists, and as unattributed when it does not.
8. Chart and observation table, then chronology, then Observed / Interpretation / Still unknown, then connected events.

Evidence, the chart, and history are progressive disclosure of this same question. Opening them does not replace the title with a generic screen name and does not drop the return path.

Connected events with an empty list stay “No linked events in the current book.”

### Evidence

The inspector (or the stacked panel below 1080px) is the evidence layer:

- Source name and summary.
- Stance: Supports, Contradicts, or Context.
- Whether the current move log cites it.
- Source published time, first observed by OMEN, and captured by OMEN, each independently “Not recorded” or “Not stated by source” when absent.
- Recorder’s reliability as a recorded rating out of 1 when one was stored, labeled as the recorder’s rating. When no rating was stored, the line says “Not recorded.”
- An “Open source” link only for `http` and `https` URLs without embedded credentials. The existing `navigableHttpUrl` rule stays.

### Verified history

From the brief, recorded history opens the existing archive or checkpoint URL for that event. Replay still uses published checkpoint membership. Arbitrary `at` and `cutoff` queries still render `HistoricalUnavailable` and do not show the current event text as history. Demo storage still says stored reconstruction is unavailable. Corrections remain visible versions on the move log (version, author, published time, correction note). A correction is not a silent rewrite.

Archive runtime behavior is owned by merged #21 and #23. The first consumer visual pass must not combine unrelated Archive behavior changes with chrome migration. Incidental copy fixes in `archive-view.tsx` (for example replacing “live event record” with “current event record”) are allowed when isolated from behavior edits. The chrome around history (crumb, return, bottom nav) can change in files outside `src/components/archive/**`.

## Source and time labels

These words stay distinct:

| Label | Meaning |
| --- | --- |
| Illustrative | Demo series. Demo provenance forces this basis even when a type field says market or model. |
| Market-implied | Sourced series whose type is market-implied. |
| Authored forecast | Sourced series stated by a forecaster or model. |
| Demo / Sourced | Event provenance. Storage mode is separate. A demo row in PostgreSQL is still Demo. |
| Observed | When the probability or source says the fact occurred. |
| Published | When the source says it was published. |
| Captured by OMEN | When OMEN stored it. |
| Issued | When a stored forecast was issued. |
| Evidence cutoff | The forecast’s recorded evidence cutoff. |

“Not a live feed” stays on the observation line. The word “live” is not used for the current record. The archive sentence that calls the current record “live” is a copy fix after archive isolation, in the archive file, not in the first chrome pass.

## Uncertainty rules

- Missing values say “Not recorded” or “Not computable.” A missing attribution is not shown as 0% and is not shown as a bar.
- An attribution percentage appears only as the move-log author’s statement, with the author and version, and the words “Not a measured split.” Demo logs stay labeled illustrative. A percentage without a move log is not shown on the consumer card.
- “Still unknown” lists recorded open questions. An empty list says that none are recorded and that this does not mean the move is fully explained.
- No σ, identification confidence, explained/unexplained bar, data-quality meter, or similarity score on workspace surfaces. The marketing walkthrough may keep its labeled demo σ. That card is `src/components/marketing/event-card.tsx` and is not imported by the workspace.
- Analogues are editorial comparisons. The count is the stored count.
- The Make a call dialog stays unwired. `openCall` has no caller. The dialog invents a lock timestamp and model and community probabilities. A later cleanup may delete it with a test that no screen can open it. This contract does not connect it.

## Follow and share

Following stays browser-local, keyed by storage mode (`demo`, `database`, `misconfigured`), version `omen-v0-following/v1`. The first visit may seed ids from `listFollowedEventIds()` and must not overwrite a later save, including an intentional empty list. The control copy is Follow / Following. The hint stays: saved in this browser only, not backed up or synced. There is no account and no server write.

The Following screen’s description names events, not markets, entities, and classes. Rows that are not in the current book stay visible with the id and an unfollow control.

Share copies the current URL:

- Brief: `/events/:id`
- Checkpoint: the checkpoint URL already used for replay
- Archive selection: the existing `/archive?event=…&checkpoint=…` URL when a checkpoint is selected

The control says that the link was copied, or shows the URL if the clipboard is unavailable. It does not open a contact picker, post anywhere, or count shares.

## Component responsibilities

| Piece | Responsibility |
| --- | --- |
| `WorkspaceLayout` | Server-loads the event index, seed follow ids, storage, and provenance. Passes serializable `WorkspaceShellData`. On failure, shell renders with search disabled. |
| `WorkspaceProvider` | Sidebar collapse, palette, and browser-local following. Does not open the call dialog. |
| `AppShell` | Sidebar or bottom nav, top bar, main, palette. |
| `Sidebar` / bottom nav | The four destinations. Active state: Pulse exact; Explore covers `/events` and `/events/*`; Following exact; More open state is separate from Archive’s active state. |
| `TopBar` | Crumb, provenance chip, search. On a brief, crumb is Events / category / title. On a checkpoint, crumb keeps the event title plus a history marker. |
| `CommandPalette` | Event search over `eventIndex` plus the consumer destinations. Footer text matches keys that work. |
| `PulseScreen` | In-page search, category chips, sort, scan cards, anomaly note, visible result count. |
| `EventsScreen` | Explore. Same filters, full filtered book, result count. |
| `EventCard` (workspace) | Scan brief. |
| `EventIntelligenceView` | Brief, disclosure into chart, explanation, evidence, history. |
| `IntelligencePanel` | Evidence, record, analogues. |
| `FollowEventButton` | Toggle following. Stops the card-wide link from swallowing the click. |
| `WatchlistsScreen` | Following list and unresolved ids. |
| `ArchiveView` | Checkpoint replay. Behavior owned by the archive tasks. Visual tokens only after isolation. |
| `HistoricalUnavailable` | Refusal for arbitrary time and invalid checkpoints. Current event body stays withheld. |
| Marketing `EventCard` | Landing preview, walkthrough, and rewind only. |
| `CallModal` | Unwired. Not a product surface. |
| `UtilityScreen` and the fixture screens | Unpromoted. See the matrix. |

Client components continue to receive props from server components. They do not import `IntelligenceRepository`, adapters, `@/lib/data/*`, `@/lib/db/*`, or `@/data/events`, except the legacy screens already listed in `src/test/data-boundary.test.ts`. This migration does not add those screens to navigation and does not point them at new data.

## Token specification

Current workspace tokens on `.aion-app` (measured in source, unchanged by this document):

| Token | Value | Role |
| --- | --- | --- |
| `--a-bg-0` | `#0c0e11` | Field |
| `--a-bg-1` | `#111418` | Raised |
| `--a-bg-2` | `#161a1f` | Hover, active nav |
| `--a-bg-3` | `#1c2127` | Highest surface |
| `--a-border-0` | `rgba(255,255,255,0.055)` | Hairline |
| `--a-border-1` | `rgba(255,255,255,0.09)` | Stronger hairline |
| `--a-border-focus` | `rgba(129,148,255,0.55)` | Focus |
| `--a-tx-0` | `#e7e9ec` | Primary text. Contrast on `--a-bg-0` is 15.89:1 |
| `--a-tx-1` | `#9ba3ad` | Secondary. Contrast on `--a-bg-0` is 7.58:1 |
| `--a-tx-2` | `#5e6670` | Muted. Contrast on `--a-bg-0` / `--a-bg-1` / `--a-bg-2` is 3.32 / 3.18 / 3.00 |
| `--a-accent` | `#8194ff` | Functional accent |
| `--a-up` / `--a-down` / `--a-warn` | `#6fae8f` / `#c08383` / `#c9a96a` | Signed movement and caution |
| `--a-sidebar` | `212px`, collapsed `52px` | Sidebar |
| `--a-topbar` | `44px` | Top bar |

Marketing maps the same graphite, text, accent, and movement under `--m-*`, and adds silver `--m-silver-0/1/2` (`#f2f1ec`, `#b9b6ae`, `#6e6c66`) for brand moments only. Silver is not a workspace fill.

**Target — muted consumer text.** Labels at 11–13px use a muted color of `#7c848e` or lighter. Measured on 2026-09-27, `#7c848e` is 5.11:1 on `#0c0e11`, 4.88:1 on `#111418`, and 4.62:1 on `#161a1f`. Marketing `--m-tx-2` stays `#5e6670` until a separate brand decision. The handoff in `design-reference/README.md` left that marketing value in place on purpose.

**Target — spacing scale** for new and touched consumer components. Names may be `--a-sp-*` so they stay inside `.aion-app`. Values match the marketing scale:

| Token | Value |
| --- | --- |
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 24px |
| 6 | 32px |
| 7 | 48px |

**Target — type.** Workspace body stays 14px Inter. Navigation 13px. Meta 12px in the muted token above. Probabilities: IBM Plex Mono, tabular figures, one decimal, percent sign in the same mono. Page titles stay in the current heading weight. Do not introduce a third typeface.

**Target — radius and focus.** Controls keep 6px radius. Focus is a 1.5px accent outline with 2px offset, matching marketing. Focus does not change the control’s radius.

**Target — controls.** One primary button, one quiet button, one chip, one filter chip (`data-active`), one text field, one menu panel. Sizes use the spacing scale. Phone bottom-nav items are at least 44px tall.

## Responsive behavior

| Width | Current | Target |
| --- | --- | --- |
| > 1080px | Sidebar labels. Event page is two columns. | Same structure. Provenance chip visible. |
| 761–1080px | Sidebar labels. Event layout stacks at 1080px. | Same. Evidence follows the brief in document order. |
| ≤ 760px | Sidebar forced to 52px, labels and the collapse control `display: none`, provenance chip `.aion-demo-chip` `display: none`, search keeps a `⌘K` hint, card actions scroll sideways. | Bottom nav with Pulse, Explore, Following, More. Content uses the width beside a small mark, not an unlabeled rail. Provenance chip visible. Actions wrap. Crumb can truncate; the chip cannot disappear. |
| ≤ 480px | Tighter card padding, 24px probability figure. | Keep the tighter padding. Probability stays one line. |

No horizontal overflow at 390 or 1440. The baseline capture had `scrollWidth === clientWidth` on every audited route.

Marketing breakpoints stay 980px and 720px, with the mobile menu already implemented. This contract does not change them.

## Motion

Workspace transitions today are 120ms on background, border, and color. There is no `prefers-reduced-motion` rule in `aion-workspace.css`.

**Target.** Hover and active states animate color and background for 120ms. Probability figures do not animate. No scroll hijack, no required swipe, no autoplay video, no infinite column that withholds the end of the book. Under `prefers-reduced-motion: reduce`, workspace transitions are 0ms. Marketing already pauses the spectrum and uses `scroll-behavior: auto`; that behavior stays.

## File-level migration steps

Do these in order in a later pull request. This document is step zero.

1. **Branch from current `main`.** Re-fetch `origin` and create the implementation branch from `1032d318426b5e7fd818278cb3ca65c8ff5dafa1` or whatever `origin/main` is after fetch. Preserve the Archive invariants from #21 and #23 (stale-response isolation, older-page request invalidation, replay isolation, neighbor recovery, current-request error handling, checkpoint reconstruction honesty). Do not redo those features. Follow [Preconditions](#preconditions-before-runtime-changes) for which Archive files to touch.
2. **Tokens.** In `src/app/aion-workspace.css`, add the spacing scale and raise workspace muted text to the target. Leave `src/app/(marketing)/marketing.css` tokens unchanged. Add a reduced-motion rule for `.aion-app` transitions.
3. **Chrome.** Update `src/data/workspace.ts` labels and headings: Pulse, Explore, Following. Add a More menu component used by `src/components/sidebar/sidebar.tsx` and the phone bottom nav in `src/components/layout/app-shell.tsx`. Point Explore at `/pulse`’s sibling `/events` and Following at `/watchlists`. Put Archive only inside More. Remove Settings from the promoted nav. Update `isActive` tests in `src/components/sidebar/sidebar.test.tsx` and the link contract in `src/components/layout/app-shell.test.tsx`. The test must still fail if Markets, Signals, Agents, Research, Relations, or Alerts appear as links.
4. **Search.** In `src/components/common/command-palette.tsx`, rename commands to the four destinations plus Archive, and make arrow and Enter behavior match the footer, or change the footer to the keys that exist (`esc`, and `⌘K` / `Ctrl+K` from `workspace-provider.tsx`).
5. **Provenance at 390.** Remove the `.aion-demo-chip { display: none }` rule at 760px. Sourced, mixed, empty, and unavailable chips already stay visible; demo must too.
6. **Scan and brief.** `pulse-screen.tsx`, `events-screen.tsx`, `watchlists-screen.tsx`, `event-card.tsx`, `event-intelligence-view.tsx`: hierarchy, counts, evidence link, Following copy, share control. Add tests beside the existing event-card and workspace-route tests. Do not weaken provenance, “not a live feed,” or not-found assertions.
7. **Settings copy, only if the file is touched.** Remove the non-functional alert, density, and timezone controls from `settings-screen.tsx`, or leave the route unlinked and unused. Do not persist new preferences and do not send notifications.
8. **Archive copy, when touched.** In `archive-view.tsx`, replace “live event record” with “current event record.” Do not restyle Archive or change Archive behavior in the same pull request as unrelated consumer chrome unless the diff is copy-only.
9. **Leave in place.** Marketing components, `design-reference/`, repository, database, following persistence format, API routes, and the legacy fixture screens’ data imports.

## Acceptance targets

These are targets for the implementation pull request. They are not claims about the tree this document was written against. Baseline measurements are in [consumer-ui-baseline.md](consumer-ui-baseline.md).

| Id | Target |
| --- | --- |
| T1 | At 390 and 1440, the promoted navigation is Pulse, Explore, Following, and More. More includes Archive and the public page. Markets, Signals, Agents, Research, Relations, Alerts, Team, and API are not links in the shell or the palette. |
| T2 | At 390, the provenance chip’s computed `display` is not `none` on `/pulse`, `/events`, `/events/evt-boc-cut`, `/watchlists`, and `/archive`. |
| T3 | `/events/evt-boc-cut` shows current 73.8%, previous 61.2%, change +12.6 pp, basis Illustrative, and the latest-observation line includes “not a live feed.” Workspace text has no σ. |
| T4 | Follow writes `omen-v0-following/v1/<storage>` in `localStorage`. Reload keeps it. An emptied list stays empty after reload. |
| T5 | Share copies the brief URL or the open checkpoint URL and confirms the copy. No account UI appears. |
| T6 | `/events/evt-boc-cut/history/1?at=2020-01-01T00:00:00.000Z` still withholds the current event body and shows historical view unavailable. |
| T7 | Demo `/archive` still states that stored reconstruction is not available from this storage mode and does not invent checkpoints. |
| T8 | The palette has no Ask, Rewind, Create, Agents, or alert commands. Footer keys match the handlers. |
| T9 | Muted consumer text at 11–13px is at least 4.5:1 on `--a-bg-0`, `--a-bg-1`, and `--a-bg-2`. |
| T10 | `prefers-reduced-motion: reduce` sets workspace color transitions to 0ms. Marketing spectrum still mounts paused. |
| T11 | No horizontal overflow at 390 and 1440 on the routes listed in the baseline. |
| T12 | `src/test/data-boundary.test.ts` passes. New client files do not import the repository or `@/data/events`. |
| T13 | Existing assertions are updated only when the label contract changes. Test count may rise. Assertions are not deleted to go green. |
| T14 | `/` still uses the silver mark, “Explore the demo” to `/pulse`, and no request-access dialog. |

## Preconditions before runtime changes

**Archive is no longer blocked by pull request #23.** #23 merged into `main` at `1032d318426b5e7fd818278cb3ca65c8ff5dafa1`. Future visual work must preserve the Archive invariants introduced by #21 and #23 and must not combine unrelated behavior changes with the visual migration. Do not reopen Archive correctness work or revert stale-response isolation, older-page request invalidation, replay isolation, neighbor recovery, current-request error handling, or checkpoint reconstruction honesty.

Treat these paths as behavior-sensitive: prefer visual and copy-only edits; avoid mixing Archive behavior refactors with consumer chrome in one pull request:

- `src/components/archive/archive-view.tsx`
- `src/components/archive/archive-navigation.test.tsx`
- `src/components/screens/archive-screen.test.tsx`
- `src/app/(workspace)/archive/page.tsx`
- `src/lib/archive/**`

**Historical / superseded branches (not current prerequisites).**

| PR | Branch | Note at audit time (`1a7ad2b`) | Current status |
| --- | --- | --- | --- |
| [#23](https://github.com/jacksonissacs/V_Omen_V/pull/23) | `cursor/fix-archive-stale-pagination-failures-bddc` | Was draft, one commit on `1a7ad2b` | **Merged.** Final head `f873fe1ca37811634f4d26f528d229463814020d`. |
| [#20](https://github.com/jacksonissacs/V_Omen_V/pull/20) | `cursor/archive-a1-a2-followups-9b69` | Merge-base `0fb3dc6`, not `1a7ad2b` | Older archive pagination work. Superseded by merged #21. Do not merge under a UI branch. |

[#19](https://github.com/jacksonissacs/V_Omen_V/pull/19) was an open docs branch for integration status at audit time. It is not a runtime prerequisite for consumer UI. Do not edit it from the UI branch.

**Tests.** Unit counts in [consumer-ui-baseline.md](consumer-ui-baseline.md) reflect the audit snapshot at `1a7ad2b` (263 unit tests on that SHA). Re-run the verification commands on the implementation branch after rebasing onto current `main`. Do not weaken provenance, archive, or data-boundary suites.
