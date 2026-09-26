# OMEN architecture

This document describes a **practical MVP architecture**: modular enough to grow into a production system, small enough to ship as a local Next.js application with mock intelligence.

No payments, production authentication, or expensive external APIs are in this revision.

## Goals for the MVP

- Render a dense, keyboard-first operating picture of events.
- Keep domain logic independent of React and of any future vendor.
- Make the data layer swappable: today's mock catalog becomes tomorrow's warehouse + adapters.
- Expose a thin HTTP API so other clients can appear later without rewriting queries.
- Stay runnable on a laptop with `npm install` and `npm run dev`.

## System shape

```
┌──────────────────────────────────────────────────────────┐
│  Surfaces                                                │
│  Next.js App Router · dashboard · event · graph · ⌘K     │
└────────────────────────────▲─────────────────────────────┘
                             │ typed reads
┌────────────────────────────┴─────────────────────────────┐
│  Application services                                    │
│  repository port · search index · scoring · formatters   │
└────────────────────────────▲─────────────────────────────┘
                             │ IntelligenceRepository
┌────────────────────────────┴─────────────────────────────┐
│  Adapters                                                │
│  MockIntelligenceRepository  (OMEN_STORAGE_MODE=demo)    │
│  PostgresIntelligenceRepository  (…=database)            │
│  later: object store · ingest workers                    │
└────────────────────────────▲─────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────┐
│  Sources (future)                                        │
│  filings · official gazettes · AIS · first-party notes   │
│  optional market venues — never required for the core    │
└──────────────────────────────────────────────────────────┘
```

The core workspace does not import the mock catalog. Server components and route handlers call `getRepository()`, which is the only place that knows which adapter is live, and pass plain data to client components. A few legacy demo-only screens still read fixtures directly; they are listed under [Legacy demo-only screens](#legacy-demo-only-screens).

## Runtime

| Piece | Choice | Why |
| --- | --- | --- |
| App | Next.js App Router, TypeScript | One process for UI, routing, and internal APIs. |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent primitives; dark monochrome theme. |
| State | Server data + light client state | Core screens receive repository data as props from server components. Filters, sort, search input, palette, and the follow list are client state. |
| Tests | Vitest + Testing Library | Domain logic and UI contracts, no browser farm required. |
| Data | Typed in-process catalog | Realistic, reviewable fixtures. Zero egress. |

## Domain model

Core types live in `src/lib/domain/types.ts`.

- **IntelligenceEvent** — the question, probabilities, causes, evidence, analogues, expectation path.
- **IntelligenceItem** — a feed row derived from an event (a shift, a new source, a new analogue).
- **RelationshipGraph** — nodes (`event`, `market`, `entity`, `region`) and labeled edges.
- **Scoring** — probability deltas, signed `pp` formatting, movement direction. Pure functions in `src/lib/domain/scoring.ts`.

Significance on an event is curated in the catalog for the MVP. Scoring helpers exist so later ingest can propose a rating from the size of a move.

## Repository port

`src/lib/data/repository.ts` defines `IntelligenceRepository`. Every method is async so a persistent adapter can replace the mock without changing callers. The module imports `server-only`: importing it from a client component fails the build.

| Member | Used by |
| --- | --- |
| `storage` | `"demo"`, `"database"`, or `"misconfigured"`. It says where records are stored, not where they came from; provenance is on each event (`AionEvent.provenance`). |
| `listEvents(filter?)` | Pulse, Events, Watchlists, workspace layout (catalog order); `GET /api/events` (largest move first) |
| `getEvent(id)` | Event detail page and metadata; `GET /api/events/:id` |
| `getRelatedEvents(id)` | Event detail "Connected events" |
| `getFeaturedAnomaly()` | Pulse "Expected reaction missing" card |
| `listFollowedEventIds()` | Initial follow list (workspace layout) |
| `listFeed(filter?)` | Not used by a screen yet |
| `getGraph()` | Not used by a screen yet (`/relations` is still static) |
| `search(query)` | Not used by a screen yet (⌘K uses the event index below) |
| `listHistoryCheckpoints(id, query?)` | `GET /api/events/:id/history`. Bounded checkpoint discovery, not member rows |
| `reconstructEvent(id, checkpointId)` | `GET /api/events/:id/history/:checkpointId`. Historical checkpoint replay, not the current `AionEvent` |

`EventFilter.order` selects `"move"` (default: largest absolute move first) or `"catalog"` (curated book order). Screens request catalog order and apply their own client-side sort, so tie-breaking matches the pre-repository behavior.

`MockIntelligenceRepository` (`src/lib/data/mock-repository.ts`, also `server-only`) implements the port against the seeded book in `src/data/events.ts` and `src/lib/data/mock-catalog.ts`. It stays the adapter for development and tests.

`PostgresIntelligenceRepository` (`src/lib/data/postgres-repository.ts`, `server-only`) implements the same port over PostgreSQL. `getRepository()` picks the adapter from `OMEN_STORAGE_MODE`. An invalid configuration returns an adapter whose every read rejects, so database mode never falls back to demo data. Schema, write command and setup are in [database.md](database.md). Do not leak SQL, HTTP, or vendor SDKs into components.

## Server data boundary

```
(workspace)/layout.tsx  (server)  listEvents + listFollowedEventIds
  └─ AppShell (client)            data = { eventIndex: EventSummary[], followedEventIds, available, storage, provenance }
      ├─ TopBar                   event crumb from eventIndex; provenance chip; PostgreSQL chip in database mode
      ├─ CommandPalette           ⌘K event search over eventIndex
      └─ page.tsx (server)        loads its own data, renders a client screen with props
          ├─ /pulse               listEvents + getFeaturedAnomaly → PulseScreen
          ├─ /events              listEvents → EventsScreen
          ├─ /events/[id]         getEvent + getRelatedEvents → EventIntelligenceView (notFound on miss)
          └─ /watchlists          listEvents → WatchlistsScreen
```

- `EventSummary` (`src/lib/events.ts`) is the serializable slice the shell needs: id, title, category, and a precomputed search string. The full event objects do not ship to every route.
- Filtering, sorting, and search helpers (`filterEvents`, `sortEvents`, `summaryMatchesQuery`, `watchlistRows` in `src/lib/watchlist.ts`) are pure and take explicit data.
- The follow list is client state. The first visit in a storage mode seeds it from `listFollowedEventIds()`. Later visits read the versioned browser `localStorage` record for that mode (`demo`, `database`, or `misconfigured`), including an intentionally empty list. There is no server write path and no account sync.
- `src/test/data-boundary.test.ts` fails if a client module imports `@/lib/data/*`, `@/lib/db/*` or `pg`, mentions `DATABASE_URL`, or if a client module other than the listed legacy screens imports `@/data/events`. It also fails if any source file exposes a database URL through a `NEXT_PUBLIC_` variable.

### Loading, unavailable, and empty states

| State | Where |
| --- | --- |
| Loading | `loading.tsx` in `pulse/`, `watchlists/` and `events/(book)/` — shown while the page's server data loads. Event detail deliberately has none: a Suspense boundary above `events/[id]` starts streaming before `notFound()` and turns the 404 into a 200 |
| Unavailable (page) | `src/app/(workspace)/error.tsx` — a repository error in a page renders "Workspace data unavailable" with **Try again** (`retry`) |
| Unavailable (shell) | If the layout's reads fail, the shell still renders; ⌘K shows "Event search is unavailable" and navigation still works |
| Empty | Pulse and Events show "No events in the book yet"; filters with no matches show "No matching events"; Watchlists shows "Nothing followed"; event detail shows "No linked events" |
| Not found | `/events/[id]` calls `notFound()` and renders `events/[id]/not-found.tsx` |

The workspace layout calls `await connection()`, so every workspace route renders per request (`ƒ` in the build output). The storage mode is read at request time, a build never contacts the database, and a static page can never serve demo data after the mode switches to database.

## HTTP boundary

Internal JSON routes exist so the UI is not the only consumer:

- `GET /api/events`
- `GET /api/events/:id`
- `GET /api/events/:id/history`
- `GET /api/events/:id/history/:checkpointId`

The first two return `storage` and, on success, `provenance` alongside the current projection. A storage failure returns `503` with no data, and an unknown id returns `404`.

The history routes replay stored checkpoints. Checkpoint and other bigint ids are decimal strings. The list is bounded and does not include member rows. The checkpoint route returns a historical record, not an `AionEvent`, and does not accept a UTC cutoff. Invalid input is `400`, an unknown event is `404`, a missing checkpoint is `422`, a checkpoint with no semantic revision is `409` pre-coverage, verification failure is `422`, demo storage is `422`, and database failure is `503`. None of those substitute current or demo rows.

The App Router pages read the repository in-process in server components (no extra HTTP hop). The routes are the contract for later clients and for tests that want HTTP semantics.

## Legacy demo-only screens

These screens are outside the V0 core boundary and were **not migrated** to the repository. They are demo content only:

| Route | Data source today |
| --- | --- |
| `/markets` | Client component imports `@/data/events` directly |
| `/signals` | Client component imports `@/data/events` directly |
| `/agents` | Hard-coded ledger and ranking fixtures in `src/data/workspace.ts` |
| `/research` | Hard-coded forecast history in `src/data/workspace.ts` |
| `/archive` | Server-loaded event index; client replays checkpoints via `/api/events/:id/history` |
| `/relations` | Content inline in `relations-screen.tsx` (does not use `getGraph()`) |
| `/alerts`, `/api-access`, `/team`, `/settings` | Static rows in the page or screen component |

The sidebar and ⌘K link the recorded loop: Pulse, Events, Watchlists, Archive, and Settings. Markets, Signals, Agents, Research, Relations, and Alerts stay routable and are not offered as navigation. ⌘K has no Ask, Rewind, or Create commands. Pulse cards show the headline series (source, observed time, and capture time kept separate) and do not present σ, data quality, or an explained/unexplained bar as measurements. An attribution percentage is labelled illustrative or as the move-log author's statement. Analogue counts are the number of stored comparisons, and zero stays zero. The Make a call modal is no longer reachable from any screen.

## Event detail

`/events/:id` shows only what is recorded:

- The chart and point table are built from the event's `probabilitySeries`. Time-range buttons filter observations to a window ending at the latest recorded observation (not the wall clock), and the part of a window before the first observation is marked as having no history. Points are never interpolated.
- Changes compare two observations of the same series, in percentage points, and name both timestamps.
- Each series is labelled Illustrative, Market-implied or Authored forecast (see [database.md](database.md)).
- An OMEN forecast appears only when a stored forecast has an author or model, an issue time, a method and an evidence cutoff. None are stored yet.
- "Why did this move?" is split into Observed (recorded values and sources with their times), Interpretation (move log text, marked unpublished or illustrative when it is) and Still unknown.
- The change timeline is built from recorded observation, evidence and move log times, not from `display.timeline`.
- Volume, Spread and Related chart modes, attribution and confidence percentages, analogue similarity scores and related-market/signal tiles are not shown: no dataset backs them.

## Frontend composition

```
(marketing)                       public surface, no AppShell
├── SiteHeader (client: mobile menu)
├── /                             Landing: Hero → Preview → Walkthrough → Pulse → Archive → Ledger
│                                 → Relations → Methodology → FAQ → Final CTA
└── SiteFooter (SpectrumStage)

(workspace) layout (server: loads shell data) → AppShell (client)
├── error.tsx (unavailable state) · loading.tsx on /pulse, /events, /watchlists
├── Sidebar (routed product areas; logo → /pulse)
├── TopBar (crumbs + provenance chip + Search)
├── CommandPalette + CallModal
└── pages
    ├── /pulse           Pulse / Intelligence (workspace home)
    ├── /events          Event book
    ├── /events/[id]     Event intelligence
    ├── /markets         Linked markets
    ├── /signals         Signal cards
    ├── /agents          Forecaster ledger
    ├── /watchlists      Local follow list
    ├── /research        Personal record
    ├── /archive         Point-in-time
    ├── /relations       Relationship graph
    └── /settings        Preferences
```

The graph is **intentionally a placeholder**: SVG layout from catalog topology, not a production graph engine. The data is real enough to navigate; the layout algorithm is not the product yet.

## Visual system

Workspace — forced dark, monochrome:

- Near-black field, hairline borders, Inter + IBM Plex Mono.
- Probability **up** is brighter; **down** is dimmer. Direction is also written as `+ / −` and `pp`.
- Significance is weight and label (`CRITICAL`, `HIGH`), not a rainbow.

See `src/app/globals.css` (shadcn theme) and `src/app/aion-workspace.css` (`.aion-app` tokens).

Landing — the Fable OMEN design: the same graphite surfaces and type, silver brand, and one
atmospheric rainbow spectrum (hero and footer). Tokens are scoped to `.omen-marketing` as `--m-*`
in `src/app/(marketing)/marketing.css` so nothing leaks into the workspace. Details and open items
in `design-reference/README.md`.

## What is deliberately absent

| Deferred | Reason |
| --- | --- |
| Auth, SSO, RLS | No multi-tenant data yet. |
| Payments / entitlements | Not the founding surface. |
| Paid market-data or LLM APIs | Cost, licenses, and nondeterminism do not belong in the core loop. |
| Write path / collaboration | Read-only fixtures first; writes need persistence. |
| Unattended ingest | A manual one-source review queue exists ([source-intake.md](source-intake.md)). Importing it stages a database review item. It does not publish evidence or run on a schedule. |

## Extending the system

1. **Persistence** — PostgreSQL storage for events, observations, evidence and Move Log revisions exists ([database.md](database.md)). Object storage for evidence blobs is still to come.
2. **Ingest** — `npm run intake` stages the CISA Known Exploited Vulnerabilities catalog in a local review queue ([source-intake.md](source-intake.md)). `npm run operator -- intake import` copies a selected version into the database review queue and does not publish it or propose a probability. A worker that does either is still later.
3. **Agents** — same repository port, plus a job table (`proposed_change`, `rationale`, `human_decision`).
4. **Live markets** — a `MarketAdapter` behind the existing `RelatedMarket` shape. The UI should not change.
5. **Auth** — wrap the App Router and API with a session boundary once there is more than one tenant.

Each step adds an adapter or a worker. None of them should require rewriting the event object.
