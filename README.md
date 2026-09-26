# OMEN

Agentic event-intelligence and prediction operating system.

Cursor × Bloomberg Terminal × Palantir × Linear.

OMEN is the public brand; internal identifiers (`AionMark`, `.aion-app`, `--a-*` tokens, `AionEvent`) keep their historical AION names to avoid an unnecessary refactor.

OMEN tracks important events and shows what changed, when it changed, the size and significance of the move, likely causes, supporting evidence, remaining uncertainty, related events and markets, historical analogues, and how previous expectations evolved.

This repository is the **Phase 0 foundation**: a local Next.js application over a typed mock catalog. There are no payments, no production authentication, and no paid external APIs.

## Product docs

- [Product vision](docs/product-vision.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [V0 build contract](docs/omen-v0-build-contract.md)

## Stack

- Next.js 16 (App Router) and React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- Vitest + Testing Library

## Routes

| Path | Surface |
| --- | --- |
| `/` | Public landing page (marketing route group, no `AppShell`) |
| `/pulse` | Intelligence / Pulse — workspace home |
| `/events` | Event book |
| `/events/[id]` | Event intelligence |
| `/markets` | Linked markets |
| `/signals` | Cross-market signals |
| `/agents` | Forecasters and models |
| `/watchlists` | Followed events |
| `/research` | Personal forecast record |
| `/archive` | Point-in-time reconstruction |
| `/relations` | Relationship graph |
| `/alerts` | Threshold monitors |
| `/settings` | Workspace preferences |

## Landing page

`/` is the public OMEN landing, built from the Fable design in `design-reference/omen-site`
(see `design-reference/README.md` for decisions, deviations and open items).

- Route group `src/app/(marketing)/` with its own header and footer; styles are scoped under
  `.omen-marketing` in `src/app/(marketing)/marketing.css` (`--m-*` tokens, no global resets).
- Components live in `src/components/marketing/`. Static sections are server components; the
  spectrum canvas (`SpectrumStage`), the walkthrough and the mobile menu are client components.
- The rainbow field is `src/lib/marketing/spectrum.ts`, a port of the prototype's Canvas 2D effect
  (fixed seed, 7 s loop, 30 fps cap) with full lifecycle management and a static fallback.
- Demo content is typed fixture data in `src/lib/marketing/demo-data.ts`; every card, chart and
  evidence list derives from the same point-in-time cutoff.
- Every primary CTA is **Explore the demo → `/pulse`**. There is no signup or access-request form.

## Workspace

The workspace (`/pulse` and the routes below) is labelled as demo data and uses the OMEN reference
visual language across routed pages:

- **Pulse** — expectation moves, category filters, search, sort, watchlist
- **Event intelligence** — recorded probability history with range filtering, observed changes, evidence with publication and capture times, and separate Observed / Interpretation / Still unknown sections
- **Events / Markets / Signals** — reusable rows, cards, and signal tiles
- **Agents** — institution and model records
- **Watchlists** — local follow/unfollow
- **Archive / Relations / Research** — reference screens, now addressable by URL (Archive is a labelled demo)
- `⌘K` / `Ctrl+K` — search and navigate

The seeded book contains 32 events across AI, technology, economics, geopolitics, companies, regulation, financial markets, energy, crypto, and science.

## Setup

Requires Node.js 20+ and npm.

```bash
git clone <this-repo>
cd accessible-me-assignment
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other commands

```bash
npm test          # Vitest, single run (no database needed)
npm run test:watch
npm run lint
npm run typecheck # tsc --noEmit (run after a build so .next/types exist)
npm run build
npm start         # production server after build

npm run test:db   # PostgreSQL integration tests (needs OMEN_TEST_DATABASE_ADMIN_URL)
npm run db:migrate | db:status | db:upsert | db:show   # nonproduction database command
```

### Internal API

- `GET /api/events`
- `GET /api/events?domain=finance`
- `GET /api/events/:id`
- `GET /api/events/:id/history/:checkpointId` — stored checkpoint replay, not a wall-clock cutoff

Domains: `technology`, `finance`, `geopolitics`, `supply_chain`.

### Storage

`OMEN_STORAGE_MODE=demo` (the default) serves the in-process demo book. `OMEN_STORAGE_MODE=database` reads PostgreSQL from `DATABASE_URL` and fails visibly rather than falling back. Records keep their own provenance: illustrative records stored in PostgreSQL are still labelled demo data. Copy `.env.example` to `.env.local` and follow [docs/database.md](docs/database.md) for local setup, the schema, and the write command.

## Architecture in brief

UI components live under `src/components/{layout,sidebar,header,events,markets,intelligence,common,screens}`. Event types are in `src/types`. The seeded catalog is `src/data/events.ts`.

The core workspace (Pulse, Events, event detail, Watchlists, ⌘K event search) reads through the async, server-only `IntelligenceRepository` port in `src/lib/data/repository.ts`. Server components load the data and pass it to client screens as props. The adapter is either the mock over the seeded catalog or PostgreSQL, selected by `OMEN_STORAGE_MODE`. Legacy demo-only screens that still read fixtures directly are listed in [docs/architecture.md](docs/architecture.md#legacy-demo-only-screens).

## What is intentionally missing

- Payments and entitlements
- Production authentication / SSO
- Paid market-data or model APIs
- A public write path or multi-user workspaces (the only write path is the nonproduction `npm run db:upsert` command)

See the [roadmap](docs/roadmap.md) for the order those appear.

## Tests

Tests cover scoring, the catalog helpers, the mock repository, command search, the application shell, event cards, the event intelligence view, the repository-backed workspace routes (Pulse, Events, event detail, Watchlists, ⌘K) including their loading, unavailable, and empty states, a guard that keeps the repository, database code and seeded fixtures out of client modules, storage configuration, bundle validation, and the `/api/events` routes. `npm run test:db` adds PostgreSQL integration tests against disposable databases.
