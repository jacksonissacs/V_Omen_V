# OMEN

Agentic event-intelligence and prediction operating system.

Cursor × Bloomberg Terminal × Palantir × Linear.

> **GitHub Pages is not the OMEN application.**
> [https://jacksonissacs.github.io/V_Omen_V/](https://jacksonissacs.github.io/V_Omen_V/) serves this README and other static repository material only. It is not a hosted preview, staging site, or public product. Paths such as `/pulse`, `/events`, and `/watchlists` do not run here. The consumer app is **not publicly hosted yet**. Use the [local demo](#local-demo) below.

OMEN is the public brand; internal identifiers (`AionMark`, `.aion-app`, `--a-*` tokens, `AionEvent`) keep their historical AION names to avoid an unnecessary refactor.

OMEN tracks important events and shows what changed, when it changed, the size and significance of the move, likely causes, supporting evidence, remaining uncertainty, related events and markets, historical analogues, and how previous expectations evolved.

The first launch slice is **AI and technology in North America** (United States, Canada, and relevant Mexico coverage). Material international developments that affect that slice remain in scope.

This repository is the **Phase 0 foundation**: a local Next.js application with optional demo or PostgreSQL storage. There are no payments, no production authentication, no paid external APIs, and no public host for the consumer workspace.

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

## Local application routes

These paths exist only in a locally running Next.js process. They are **not** available on GitHub Pages.

| Path | Surface |
| --- | --- |
| `/` | Marketing landing (local Next.js only; not a public host) |
| `/pulse` | Pulse — workspace home |
| `/events` | Explore / event book |
| `/events/[id]` | Event intelligence |
| `/watchlists` | Following |
| `/archive` | Recorded checkpoint replay |
| `/settings` | Local display preferences (unpromoted) |

Legacy fixture screens (`/markets`, `/signals`, `/agents`, `/research`, `/relations`, `/alerts`) are not the consumer product. After OMEN-001 they render only when demo intelligence is explicitly enabled locally; otherwise they are not found.

## Landing page

In the local Next.js app, `/` is the OMEN marketing landing, built from the Fable design in
`design-reference/omen-site` (see `design-reference/README.md` for decisions, deviations and open
items). It is not hosted on GitHub Pages.

- Route group `src/app/(marketing)/` with its own header and footer; styles are scoped under
  `.omen-marketing` in `src/app/(marketing)/marketing.css` (`--m-*` tokens, no global resets).
- Components live in `src/components/marketing/`. Static sections are server components; the
  spectrum canvas (`SpectrumStage`), the walkthrough and the mobile menu are client components.
- The rainbow field is `src/lib/marketing/spectrum.ts`, a port of the prototype's Canvas 2D effect
  (fixed seed, 7 s loop, 30 fps cap) with full lifecycle management and a static fallback.
- Demo content is typed fixture data in `src/lib/marketing/demo-data.ts`; every card, chart and
  evidence list derives from the same point-in-time cutoff.
- In the local app, every primary CTA is **Explore the demo → `/pulse`**. There is no signup or access-request form. Those buttons do not work on GitHub Pages.

## Workspace

The local workspace (`/pulse` and the consumer routes below) is labelled as demo data and uses the
OMEN reference visual language. It is not served by GitHub Pages.

- **Pulse** — expectation moves, category filters, search, sort, watchlist
- **Event intelligence** — recorded probability history with range filtering, observed changes, evidence with publication and capture times, and separate Observed / Interpretation / Still unknown sections
- **Explore** — event book
- **Following** — local follow/unfollow
- **Archive** — recorded checkpoint replay
- `⌘K` / `Ctrl+K` — search and navigate

The seeded book contains 32 events across AI, technology, economics, geopolitics, companies, regulation, financial markets, energy, crypto, and science.

## Setup

Requires Node.js 20+ and npm. This is the only supported way to run Pulse and the workspace.

### Local demo

```bash
git clone https://github.com/jacksonissacs/V_Omen_V.git
cd V_Omen_V
cp .env.example .env.local
npm install
npm run dev
```

`.env.example` sets `OMEN_STORAGE_MODE=demo`. After OMEN-001 an unset mode does not load the demo book.

Open [http://localhost:3000](http://localhost:3000) for the local marketing page, then [http://localhost:3000/pulse](http://localhost:3000/pulse) for Pulse. Those URLs are this machine’s Next.js server, not GitHub Pages.

### Other commands

```bash
npm test          # Vitest, single run (no database needed)
npm run test:watch
npm run lint
npm run typecheck # tsc --noEmit (run after a build so .next/types exist)
npm run build
npm start         # production server after build

npm run test:db   # PostgreSQL integration tests (needs OMEN_TEST_DATABASE_ADMIN_URL)
npm run test:workflow # production Next.js + disposable PostgreSQL + Chrome (needs a build)
npm run intake:check  # external CISA KEV smoke check; separate from test:workflow
npm run db:migrate | db:status | db:upsert | db:show   # nonproduction database command
npm run intake -- refresh   # manual CISA KEV review queue; see docs/source-intake.md
npm run operator -- intake import --queue <queue.json> --item <id> --by "<name>"
npm run analyst -- propose --event <id> --evidence <id>[,<id>...] --provider test  # synthetic draft; see docs/analyst-proposals.md
```

### Internal API

- `GET /api/events`
- `GET /api/events?domain=finance`
- `GET /api/events/:id`
- `GET /api/events/:id/history` — bounded checkpoint discovery
- `GET /api/events/:id/history/:checkpointId` — stored checkpoint replay, not a wall-clock cutoff

Domains: `technology`, `finance`, `geopolitics`, `supply_chain`.

### Storage

`OMEN_STORAGE_MODE=demo` serves the in-process demo book only when `NODE_ENV` is `development` or `test` and no production marker is set. An unset mode does not select that book. `OMEN_STORAGE_MODE=database` reads PostgreSQL from `DATABASE_URL` and fails visibly rather than falling back. Records keep their own provenance: illustrative records stored in PostgreSQL are still labelled demo data. Copy `.env.example` to `.env.local` and follow [docs/database.md](docs/database.md) for local setup, the schema, and the write command.

## Architecture in brief

UI components live under `src/components/{layout,sidebar,header,events,markets,intelligence,common,screens}`. Event types are in `src/types`. The seeded catalog is `src/data/events.ts`.

The core workspace (Pulse, Events, event detail, Watchlists, ⌘K event search) reads through the async, server-only `IntelligenceRepository` port in `src/lib/data/repository.ts`. Server components load the data and pass it to client screens as props. The adapter is either the mock over the seeded catalog or PostgreSQL, selected by `OMEN_STORAGE_MODE`. Legacy demo-only screens that still read fixtures directly are listed in [docs/architecture.md](docs/architecture.md#legacy-demo-only-screens).

## What is intentionally missing

- Payments and entitlements
- Production authentication / SSO
- Paid market-data or model APIs
- A public write path or multi-user workspaces (database writes stay on the nonproduction `npm run db:upsert` and `npm run operator` commands)
- Scheduled or unattended fetching. `npm run intake` is a manual review queue for one official feed. Importing a selected item only stages it. See [docs/source-intake.md](docs/source-intake.md).

See the [roadmap](docs/roadmap.md) for the order those appear.

## Tests

Tests cover scoring, the catalog helpers, the mock repository, command search, the application shell, event cards, the event intelligence view, the repository-backed workspace routes (Pulse, Events, event detail, Watchlists, ⌘K) including their loading, unavailable, and empty states, a guard that keeps the repository, database code and seeded fixtures out of client modules, storage configuration, bundle validation, and the `/api/events` routes. `npm run test:db` adds PostgreSQL integration tests against disposable databases. `npm run test:workflow` starts a production `next start` against labelled synthetic fixtures and checks intake staging, review, publication, checkpoint replay, retries, outages, and browser navigation. Failure traces land in `test-artifacts/`. `npm run intake:check` is an external-source smoke check and is not part of that suite.
