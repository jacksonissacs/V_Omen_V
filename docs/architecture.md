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
│  MockIntelligenceRepository  (now)                       │
│  later: Postgres · object store · ingest workers         │
└────────────────────────────▲─────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────┐
│  Sources (future)                                        │
│  filings · official gazettes · AIS · first-party notes   │
│  optional market venues — never required for the core    │
└──────────────────────────────────────────────────────────┘
```

The UI never imports the mock catalog directly. It talks to `getRepository()`, which is the only place that knows which adapter is live.

## Runtime

| Piece | Choice | Why |
| --- | --- | --- |
| App | Next.js App Router, TypeScript | One process for UI, routing, and internal APIs. |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent primitives; dark monochrome theme. |
| State | Server data + light client state | Feed/detail are derived from the repository. Palette, mobile nav, and filters are client. |
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

`src/lib/data/repository.ts` defines `IntelligenceRepository`:

| Method | Use |
| --- | --- |
| `listEvents(filter?)` | Dashboard and API |
| `getEvent(id)` | Event detail and API |
| `listFeed(filter?)` | Intelligence feed |
| `getGraph()` | Relationship graph placeholder |
| `search(query)` | Command palette |

`MockIntelligenceRepository` implements the port against `src/lib/data/mock-catalog.ts`.

A future `PostgresIntelligenceRepository` should implement the same interface. Do not leak SQL, HTTP, or vendor SDKs into components.

## HTTP boundary

Internal JSON routes exist so the UI is not the only consumer:

- `GET /api/events`
- `GET /api/events/:id`

The App Router pages currently read the repository in-process (no extra hop, no loading waterfall). The routes are the contract for later clients and for tests that want HTTP semantics.

## Frontend composition

```
(marketing)                       public surface, no AppShell
├── SiteHeader (client: mobile menu)
├── /                             Landing: Hero → Preview → Walkthrough → Pulse → Archive → Ledger
│                                 → Relations → Methodology → FAQ → Final CTA
└── SiteFooter (SpectrumStage)

(workspace) AppShell
├── Sidebar (routed product areas; logo → /pulse)
├── TopBar (crumbs + "Demo data" chip + Ask OMEN)
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
| Streaming ingest | Requires a worker and a store. Designed as a later adapter. |

## Extending the system

1. **Persistence** — implement `IntelligenceRepository` on Postgres + object storage for evidence blobs.
2. **Ingest** — workers write normalized `EvidenceItem`s; a scoring job proposes probability revisions.
3. **Agents** — same repository port, plus a job table (`proposed_change`, `rationale`, `human_decision`).
4. **Live markets** — a `MarketAdapter` behind the existing `RelatedMarket` shape. The UI should not change.
5. **Auth** — wrap the App Router and API with a session boundary once there is more than one tenant.

Each step adds an adapter or a worker. None of them should require rewriting the event object.
