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
- **Event intelligence** — what changed, when, significance, cause, evidence, uncertainty, markets, analogues, prior beliefs
- **Events / Markets / Signals** — reusable rows, cards, and signal tiles
- **Agents** — institution and model records
- **Watchlists** — local follow/unfollow
- **Archive / Relations / Research** — reference screens, now addressable by URL
- **Make a call** — blind prediction entry and immutable reveal
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
npm test          # Vitest, single run
npm run test:watch
npm run lint
npm run build
npm start         # production server after build
```

### Internal API

- `GET /api/events`
- `GET /api/events?domain=finance`
- `GET /api/events/:id`

Domains: `technology`, `finance`, `geopolitics`, `supply_chain`.

## Architecture in brief

UI components live under `src/components/{layout,sidebar,header,events,markets,intelligence,common,screens}`. Event types are in `src/types`. The seeded catalog is `src/data/events.ts`.

The `IntelligenceRepository` port in `src/lib/data/repository.ts` remains the swap point for a later store. This revision does not add a fake backend.

## What is intentionally missing

- Payments and entitlements
- Production authentication / SSO
- Paid market-data or model APIs
- A write path or multi-user workspaces

See the [roadmap](docs/roadmap.md) for the order those appear.

## Tests

Tests cover scoring, the catalog helpers, the mock repository, command search, the application shell, event cards, and the event intelligence view.
