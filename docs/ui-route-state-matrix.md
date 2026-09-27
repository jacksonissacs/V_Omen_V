# UI route and state matrix

Inventory of the running app at `1a7ad2b00f791fa531e5bcda2203797533d3a849` (`origin/main` when this audit branched). Captures and probe text are in [consumer-ui-baseline.md](consumer-ui-baseline.md). The consumer target is in [consumer-design-contract.md](consumer-design-contract.md). This matrix describes what is shipped, not that target.

Method: read each route module, then loaded it in Chromium at 390×844 and 1440×900 against `next dev` with `OMEN_STORAGE_MODE=demo`. Empty-book, repository-error, and loading flashes were not forced. Those rows say so.

## Shared shells

### Marketing shell

`src/app/(marketing)/layout.tsx` wraps `/` in `.omen-marketing` with `SiteHeader` and `SiteFooter`. It does not use `AppShell`. Styles are `marketing.css` (`--m-*`). Fonts come from the root layout (Inter, IBM Plex Mono).

Header links: Demo, Pulse, Archive, Ledger, Methodology, FAQ, and “Explore the demo” → `/pulse`. At 720px and below the links sit behind a Menu button (`aria-expanded`, Escape closes and returns focus). There is no request-access dialog. `landing-page.test.tsx` asserts no dialog.

Footer is the spectrum stage plus the illustrative-data line. Social, mail, privacy, and terms links are absent.

### Workspace shell

`src/app/(workspace)/layout.tsx` awaits `connection()`, reads `listEvents({ order: "catalog" })` and `listFollowedEventIds()`, and passes `WorkspaceShellData` into `AppShell`. A failed read sets `available: false`, an empty index, and provenance `none`. The shell still renders.

`AppShell` is sidebar, top bar, main, command palette, and `CallModal` when `callEvent` is set. Nothing calls `openCall`, so the call dialog does not appear.

Promoted sidebar links, in order: Intelligence `/pulse`, Events `/events`, Watchlists `/watchlists`, Archive `/archive`, Settings `/settings`. Collapse is local React state, not persisted. At ≤760px labels and the collapse control are `display: none` (icon rail). The logo links to `/pulse`.

Top bar: crumb, provenance chip, search button. Core routes (`/pulse`, `/events`, `/watchlists`, `/archive`) use the book provenance chip. Other workspace routes always show “Demo data” via `LegacyDemoChip`. In database mode a second chip says PostgreSQL. At ≤760px `.aion-demo-chip` is `display: none`, so the demo chip is in the DOM and invisible. Probe at 390: `display: none`, top bar text “Pulse Search ⌘K”. At 1440 the chip is `display: flex`.

Provenance chip copy:

| Provenance | Label |
| --- | --- |
| demo | Demo data |
| sourced | Sourced data |
| mixed | Demo + sourced data |
| none, store readable | No data |
| shell `available: false` | Data unavailable |

### Workspace error and loading

| State | Where | Copy | Visual capture |
| --- | --- | --- | --- |
| Segment error | `(workspace)/error.tsx` | “Workspace data unavailable” and Try again | Not forced. Not screenshotted. |
| Shell read failure | layout catch | Navigation remains. Palette adds “Event search is unavailable right now. Navigation still works.” | Not forced. |
| Loading | `pulse/loading.tsx`, `events/(book)/loading.tsx`, `watchlists/loading.tsx` | “Loading the book…” | Not captured. The dev server settled before a shot. |
| Archive suspense | `archive/page.tsx` fallback | Empty section, `aria-busy`, test id `archive-loading` | Not captured as a settled state. |
| Event detail loading | none | A `loading.tsx` beside `events/[id]` is omitted so `notFound()` is not turned into a 200 by an outer Suspense boundary. | By design. |
| Not found | `events/[id]/not-found.tsx` | “Event not in the book”, link to `/events` | Captured. HTTP 404. |

## Menus, dialogs, and search

| Surface | Kind | Behavior observed |
| --- | --- | --- |
| Marketing Menu | Disclosure | Opens at 390. Links match the header. Escape is implemented in `site-header.tsx`. Screenshot `landing-menu-390.png`. |
| Sidebar | Navigation | Five promoted links. Unfinished routes are not linked. `app-shell.test.tsx` locks that. |
| Sidebar collapse | Button | Present at 1440 (“collapse”). Hidden at 390, so the rail cannot be expanded. |
| Search / ⌘K | Dialog “Command palette” | Opens from the top-bar button. Global handler in `workspace-provider.tsx` toggles on Meta/Ctrl+K and closes on Escape. Commands: Intelligence, Events, Watchlists, Settings. Archive is absent. Up to eight event titles, four when the query is empty. Footer says “↑↓ navigate”, “↵ run”, “esc close”. The palette has no arrow or Enter handler. Click runs an item. Click on the overlay closes. |
| Make a call | Dialog in source | Unreachable. Contains a fixed “16:42:17 EDT · cryptographically recorded” line and derived “OMEN model” and “Community” percentages. |
| Archive event select | Native `<select>` | Chooses an event and updates the URL. |
| Archive checkpoint list | `role="listbox"` | Arrow keys, Enter, and Escape are implemented here. This is separate from the command palette. |
| Event inspector | Tabs | Evidence, Record, Analogues. `role="tab"`. |
| Relations inspector | Tabs | Edge, Node, Cases. Static fixture content. |
| Settings | Selects and checkbox | React state only. Density does not change layout. Timezone does not change formatting. The alert checkbox does not notify. |

In-page search (client filter, not the palette):

| Screen | Label | Empty result |
| --- | --- | --- |
| Pulse | “Search pulse” | “No matching events” |
| Events | “Search events” | “No matching events”, or “No events in the book yet” when the book is empty |
| Markets | “Search markets” | No empty message. The list is blank. |
| Agents | “Search agents” | No empty message. The grid is blank. |
| Command palette | “Search events” | “No matching events.” |

Signals and Relations have category or inspector tabs and no text query.

## Routes

Status column is the Chromium navigation status in demo mode. “Preview” means the screen is still routed and is not in the sidebar.

| Path | Module | Role | HTTP | H1 observed | Loading | Empty | Error / refusal | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | `(marketing)/page.tsx` | Public page | 200 | Every probability, with its history. | None | None | None | Demo sections are labeled illustrative |
| `/pulse` | `pulse/page.tsx` | Workspace home | 200 | Pulse | `loading.tsx` | “No events in the book yet”; filters: “No matching events” | Segment error boundary | No |
| `/events` | `events/(book)/page.tsx` | Book | 200 | Events | `loading.tsx` | Same pair as Pulse | Segment error boundary | No |
| `/events/:id` | `events/[id]/page.tsx` | Brief | 200 for a known id | Event title | None, on purpose | Chart: “No probability observations…”; connected: “No linked events…” | Unknown id: 404 not-found. `?at` / `?cutoff`: unavailable page. Invalid `?checkpoint`: unavailable. Valid `?checkpoint`: redirect to the history path | No |
| `/events/:id/history/:checkpointId` | history page | Replay | 200 for the arbitrary-time refusal page | Stored reconstruction, or Historical view unavailable, or Semantic history not yet recorded | None | Covered by outcome copy | See history outcomes below | No |
| `/watchlists` | `watchlists/page.tsx` | Following | 200 | Watchlists | `loading.tsx` | “Nothing followed” | Read warning and save alert from the following store. Unresolved ids stay listed | No |
| `/archive` | `archive/page.tsx` | Checkpoints | 200 | Archive | Suspense fallback | “No published history checkpoints…” | See archive outcomes. Demo capture showed the unsupported-history message and a console 422 | No |
| `/settings` | `settings/page.tsx` | Local controls | 200 | Settings | None | None | None | Controls do not persist |
| `/markets` | `markets/page.tsx` | Fixture markets | 200 | Markets | None | Blank list | None | Yes. Imports `@/data/events` |
| `/signals` | `signals/page.tsx` | Fixture signals | 200 | Signals | None | Blank grid | None | Yes. Imports `@/data/events` |
| `/agents` | `agents/page.tsx` | Fixture ledger | 200 | Agents | None | Blank search | None | Yes. Hard-coded calibration |
| `/research` | `research/page.tsx` | Fixture person | 200 | Alan | None | None | None | Yes. Invented rating |
| `/relations` | `relations/page.tsx` | Static graph | 200 | Relations | None | None | None | Yes. Does not call `getGraph()` |
| `/graph` | `graph/page.tsx` | Redirect | Final 200 at `/relations` | Relations | — | — | — | Redirect only. Production build marks `/graph` static. |
| `/_not-found` | framework | Unknown URL | Not screenshotted | Framework 404 | — | — | No `src/app/not-found.tsx` | Build emits `○ /_not-found` |
| `/alerts` | `alerts/page.tsx` | Fixture rows | 200 | Alerts | None | None | None | Yes. “Armed” / “Triggered” rows |
| `/team` | `team/page.tsx` | Placeholder | 200 | Team | None | None | None | Yes |
| `/api-access` | `api-access/page.tsx` | Placeholder | 200 | API | None | None | None | Yes. Lists real GET paths plus a domain filter that the API does implement |

### `/` sections

Hero, preview, walkthrough, Pulse, Archive, Ledger, Relations, Methodology, FAQ, final call to action. Primary action is “Explore the demo” → `/pulse`. Secondary is “See how it works” → `#walkthrough`. Product fragments use `DEMO_DISCLAIMER` (“Demo — illustrative data, not live.”). The marketing event card shows a demo σ and an explained bar. That is the landing preview, not the workspace card.

### `/pulse`

Server loads `listEvents` and `getFeaturedAnomaly`. Client filters by the ten `EVENT_CATEGORIES`, search, and “Largest move” or “My watchlist”, then `slice(0, 12)`. The anomaly card renders after that slice when category is All and the query is empty. Demo book has 32 events, so the cap hides events with no on-screen count. Cards are workspace `EventCard`. First card in demo, largest move: “Extra-territorial GPU license expansion”, 51.0% → 68.0%, +17.0 pts. Capture time “Not recorded.” Cause labeled “Illustrative narrative.” Attribution line “Illustrative attribution: 74%. Not a measured split.”

### `/events`

Full filtered book. Columns: Event, Probability, Change, Source, follow. At ≤760px the Source column is hidden. Footer count: “N events in view · M in the book”. Row status text includes the word “active” from the event status field.

### `/events/:id`

Known demo id `evt-boc-cut`: “Bank of Canada cuts rates in October.” Current 73.8%, previous 61.2%, change +12.6 pp. Basis chip “Illustrative probability.” Record says the series is an illustrative demo series and the latest observation is “not a live feed.” OMEN forecast: none recorded. Actions: Inspect evidence, Follow / Following, Open recorded history. The seeded follow list includes this id, so a fresh browser shows Following until the user toggles it. Inspector tabs and the Observed / Interpretation / Still unknown sections are on the same page. Below 1080px the inspector stacks under the brief.

`?checkpoint=<valid id>` redirects to `/events/:id/history/:checkpointId`. Invalid checkpoint ids and `at` / `cutoff` render `HistoricalUnavailable` (in-page label “422”) and do not render the current brief.

### History outcomes

`events/[id]/history/[checkpointId]/page.tsx`:

| Outcome | What the page shows |
| --- | --- |
| reconstruction | “Stored reconstruction”, panel, Return to present |
| pre_coverage | “Semantic history not yet recorded”, panel with title withheld |
| unknown_event | `notFound()` |
| missing checkpoint, verification failed, unsupported history, invalid request | `HistoricalUnavailable` |
| `at` or `cutoff` on the URL | Unavailable before `reconstructEvent`. Title “Historical view unavailable.” |
| repository throw | In-page “503” / “Event storage is unavailable.” |

The arbitrary-time URL captured in the browser returned HTTP 200 with that unavailable title. The “422” on the page is copy, not the document status.

### `/watchlists`

Description: “Markets, entities and event classes you follow. Saved in this browser.” Rows are events. Demo seed from `defaultFollowedEventIds`: `evt-boc-cut`, `evt-frontier-release`, `evt-fed-cut`, `evt-housing-ca`. At ≤760px the last-catalyst and next-event columns are hidden. Save failure is `role="alert"`. Unreadable storage is `role="status"`. An id missing from the book stays, labeled “Event not in the current book.”

### `/archive`

Honest demo state, captured: coverage list says demo storage does not publish checkpoints; “Stored reconstruction is not available from this storage mode.” Storage line “demo · Demo data.” The page asks the reader to share the URL. Chromium logged a 422 from the history request. Neighbor and replay failures have separate alerts (`archive-unavailable` versus `archive-replay-unavailable`, plus retry). “Load older checkpoints” and keyboard list navigation exist. The in-history sentence says “the live event record,” which is current-record wording, not a streaming indicator.

`?at` and `?cutoff` on `/archive` render `HistoricalUnavailable` with Return to Pulse.

### Preview screens (URL only)

| Path | What a direct visit shows |
| --- | --- |
| `/markets` | Last, change, venue, and linked event from the fixture book. Not the repository. |
| `/signals` | Signal cards from the fixture book. Category chips. No empty copy. |
| `/agents` | “Verified” ledger cards and model rankings with calibration percentages from `ledgerCards` / `modelRankings`. |
| `/research` | A person named Alan, forecast rating 1,847 ± 126, calibration “Excellent.” |
| `/relations` | SVG and inspector values (0.73, n = 84, and similar) inline in the component. Description says “Measured, not imagined.” |
| `/alerts` | Three rows: Armed, Armed, Triggered. Utility note says the surface is local-only. |
| `/team` | “Shared watchlists and analyst workspaces are staged for the persistence phase.” |
| `/api-access` | Lists `GET /api/events`, `?domain=`, get, history, and replay. Utility note mentions production writes. The domain filter exists on `GET /api/events`. No keys are issued here. |
| `/settings` | Display, Alerts, and a repeat of the read-only routes. “Local mock repository. No API keys are stored in this application.” The mock sentence is what demo mode shows; the controls are local even when the shell is on PostgreSQL. |

The top bar on these routes still says Demo data, and that chip is hidden at 390.

## API routes (no page chrome)

Read-only. Documented because Settings and API screens name them.

| Route | Success | Failure |
| --- | --- | --- |
| `GET /api/events` | `storage`, `provenance`, `events`. Optional `domain`. | 503, no rows |
| `GET /api/events/:id` | One event | 404 unknown, 503 storage |
| `GET /api/events/:id/history` | Bounded checkpoint page | 400 invalid, 422 demo or unsupported, 503 storage |
| `GET /api/events/:id/history/:checkpointId` | Historical record, not the current `AionEvent` | 400, 404, 409 pre-coverage, 422 missing or failed verification or demo, 503 |

## Historical findings rechecked on this SHA

| Earlier claim | Recheck |
| --- | --- |
| Marketing “Request access” dialog | Absent. Tests and the live page agree. |
| Workspace cards show σ and an explained bar as measurements | Workspace `EventCard` does not. Marketing `EventCard` still shows demo σ and an explained bar, with the illustrative chip. |
| Sidebar promotes Markets, Signals, Agents, Research, Relations, Alerts | It does not. The routes still render. |
| User-visible product name is AION | User-visible chrome says OMEN. Internal `AionMark`, `.aion-app`, and `--a-*` remain. |
| Make a call is on the event screen | No button calls it. The component and its invented reveal numbers remain. |
| Pulse shows a live indicator | The demo chip and “not a live feed” are the status language. Archive still contains the phrase “live event record.” |
| Muted grey `#5e6670` is below 4.5:1 | Still the token. Measured 3.32:1 on `#0c0e11`. |
| Following is browser-local | Still. Key `omen-v0-following/v1/<storage>`. |
| Archive is a scripted demo | On this SHA it replays checkpoint APIs and, in demo mode, says reconstruction is unavailable. |
