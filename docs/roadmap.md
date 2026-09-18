# OMEN roadmap

A practical sequence from this MVP to a production operating system. No calendar estimates — only dependencies and exit criteria.

## Phase 0 — Foundation (this repository)

**Ship:** a polished, local, mock-data operating picture.

- Product docs: vision, architecture, roadmap.
- Next.js + TypeScript + Tailwind + shadcn/ui shell.
- Event feed, probability-change cards, event detail, evidence panel.
- Relationship graph placeholder and command palette.
- Dark monochrome visual system.
- Realistic fixtures across technology, finance, geopolitics, and supply chains.
- Repository port + mock adapter + internal JSON API.
- Setup instructions and automated tests.

**Exit:** a reviewer can run `npm install`, `npm test`, and `npm run dev`, then navigate the book of events from the keyboard.

## Phase 1 — Persistence and a write path

**Depends on:** Phase 0 types and repository port.

- Postgres (or equivalent) for events, evidence, expectation points, and graph edges.
- Object storage for source snapshots (PDF, HTML, filings).
- A first write API: create/update event, attach evidence, append an expectation point.
- Local-only identity (single-user or shared secret). Still not production auth.

**Exit:** a restart does not lose a manually edited event. The mock adapter remains available for demos and tests.

## Phase 2 — Ingest adapters (cheap, first-party)

**Depends on:** Phase 1 store.

- Fetchers for public official sources: gazettes, central-bank calendars, customs notices, AIS-derived disruption flags, company 8-K / equivalent.
- Normalized `EvidenceItem` writer with source, timestamp, stance, and a reliability prior.
- Deduplication and a review queue.

**Out of scope here:** paid newswires, paid market data, large LLM spend.

**Exit:** at least two live source classes update a watched event without a human pasting text.

## Phase 3 — Scoring and expectation paths

**Depends on:** ingest.

- Deterministic scoring: size of move, source grade, analogue proximity.
- Proposed probability revisions with a diff the UI already knows how to show.
- Expectation-path job: every accepted revision appends a point.

**Exit:** a new official notice can move a watched probability with a visible audit trail.

## Phase 4 — Agents as coworkers

**Depends on:** scoring + write path.

- Agent jobs: summarize new evidence, propose causes, suggest analogues, flag contradictions.
- Human decision states: accept, edit, reject, defer.
- No silent overwrites. Agents never become the system of record.

**Exit:** an analyst can clear a morning queue of proposed revisions faster than they can rebuild the notes by hand.

## Phase 5 — Graph that earns its keep

**Depends on:** persisted events and entities.

- Replace the SVG placeholder with a real layout engine and a query API (`neighbors`, `paths`, `impact cone`).
- Entity resolution (orgs, instruments, regions, facilities).
- Saved views: “semiconductor cone”, “shipping cone”, “rates cone”.

**Exit:** opening one event surfaces the rest of the book that should now be re-read.

## Phase 6 — Markets as an evidence class

**Depends on:** adapter pattern; optional vendor contract.

- Pluggable `MarketAdapter` behind the existing `RelatedMarket` type.
- Start with delayed or first-party series; paid venues only when a customer relationship exists.
- Never block the core product on a market-data license.

**Exit:** a probability card can show a linked series without the UI knowing the vendor.

## Phase 7 — Multi-user, then production identity

**Depends on:** persistence and a reason to isolate tenants.

- Workspaces, roles (viewer / analyst / admin), audit log.
- Production authentication (SSO) only when there is more than one real tenant.
- Still no payments until there is a packaged SKU.

## Phase 8 — Commercial surface (last)

Billing, entitlements, and usage metering. Only after the operating picture is something a desk would miss if it went down.

## Explicit non-goals for the near term

- Trading execution or order routing.
- Consumer social features.
- A general-purpose chatbot that is not grounded in the event object.
- Spending on foundation-model APIs before ingest and scoring exist.

## How to use this document

When proposing work, name the **phase**, the **port or adapter** it touches, and the **exit criterion**. If a change requires payments, production auth, or a paid API, it does not belong before the phase that introduces that dependency.
