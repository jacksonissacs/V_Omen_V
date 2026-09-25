# OMEN V0 build contract

This contract applies to every OMEN V0 task, whether done by a person or an agent. When a task conflicts with it, stop and ask.

## What V0 is for

V0 prioritizes one loop, in this order:

1. **Event** — a tracked question with a probability that moved.
2. **Evidence** — the sources that explain the move, and what they do not explain.
3. **Published Move Log** — a durable, append-only record of each move and its evidence.
4. **Historical reconstruction** — showing what was believed at a past point in time, and why.

Work that does not advance this loop waits until after V0.

## Brand and surfaces

- Preserve OMEN branding: name, mark, visual language, and copy tone.
- Preserve the existing marketing page at `/` (`src/app/(marketing)/`). Do not redesign it as a side effect of workspace work.
- Historical AION internal names (`AionEvent`, `.aion-app`, `--a-*`) stay as they are unless a task needs to change them. Renaming them is not a goal in itself.

## Data honesty

- Clearly distinguish **demo data** from **sourced observations**, in the UI and in the code. Every stored record carries its own `provenance` (`demo` or `sourced`), separately from the repository's `storage` mode (`demo` or `database`). Demo records stay demo when they are stored in PostgreSQL, and demo data must never be presented as sourced.
- Do not fabricate forecasts, attribution percentages, performance or accuracy claims, or live-status indicators. If a number is illustrative, label it as illustrative. If it is not available, show that it is not available.
- No "live", "real-time", or streaming indicators unless the data is actually live.

## Data boundary

- The core workspace (Pulse, Events, event detail, related events, Following/watchlists, ⌘K event search) reads data through the async `IntelligenceRepository` in `src/lib/data/repository.ts`.
- Data is loaded in server components or route handlers and passed to client components as serializable props.
- Client components must not import the repository, its adapters, or seeded fixtures (`@/data/events`). `src/test/data-boundary.test.ts` enforces this.
- The mock adapter stays available for development and tests.
- `OMEN_STORAGE_MODE` selects demo or PostgreSQL storage. Database mode must fail visibly and never fall back to demo data. `DATABASE_URL` stays server-side and must never be exposed through a `NEXT_PUBLIC_` variable. See [database.md](database.md).

## Every task delivers

- Tests for the change, including regression tests for behavior it touches. Do not delete tests or weaken checks to get a green run.
- Actual verification results: tests, lint, TypeScript (`tsc --noEmit`), and the production build, recorded before and after the change. Report blocked checks as blocked, with the reason.
- Browser verification only when it was actually performed. Never claim it otherwise.
- A reviewable pull request on its own branch: scoped changes, a description of what changed and why, the check results, and known limitations. Never push directly to `main`, force-push, merge, or deploy as part of a task.

## Requires explicit approval

Do not start any of the following without explicit approval from the repository owner:

- Authentication or identity.
- Payments, billing, or entitlements.
- Public write paths (any endpoint or form that lets outside users change data).
- Production database operations (provisioning, migrations, writes, or deletes against production data).
- Paid infrastructure, paid APIs, or paid data sources.
