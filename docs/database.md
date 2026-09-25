# OMEN storage: demo and PostgreSQL

The core workspace reads through `IntelligenceRepository` (`src/lib/data/repository.ts`). `OMEN_STORAGE_MODE` chooses the adapter:

| `OMEN_STORAGE_MODE` | Adapter | Reads from |
| --- | --- | --- |
| unset, empty or `demo` | `MockIntelligenceRepository` | the in-process demo book in `src/data/events.ts` |
| `database` | `PostgresIntelligenceRepository` | the PostgreSQL database named by `DATABASE_URL` |
| anything else | none: every read fails | — |

Database mode never falls back to demo data. The following all make every read fail with `RepositoryUnavailableError`:

- `DATABASE_URL` is missing or malformed;
- the server is unreachable or rejects the credentials;
- the database has no OMEN schema, or its schema version doesn't match this build.

When reads fail, pages render **Workspace data unavailable** and the top bar shows **Data unavailable**. `/api/events` and `/api/events/:id` return `503`. Messages and logs never include the connection string.

Workspace routes render per request (`await connection()` in the workspace layout). A build never contacts the database, and switching mode doesn't require a rebuild.

## Storage mode is not provenance

Storage says where records are kept. Provenance says where they came from. Every event, observation, evidence item and Move Log revision carries `provenance`, which is either `demo` or `sourced`.

- Illustrative records stay `demo` after they're written to PostgreSQL. The committed fixtures are all `demo`.
- On the core routes (Pulse, Events, event detail, Watchlists), the top bar shows provenance ("Demo data", "Sourced data", "Demo + sourced data", or "Data unavailable"). In database mode it also shows a separate "PostgreSQL" storage chip. Legacy demo-only screens always show "Demo data", because they never read the store.
- `/api/events` returns `storage` and `provenance` as separate fields. Each event also carries its own `provenance`.
- `sourced` means entered from a cited source. It does **not** mean live. Nothing in V0 is a live feed.

## Schema

Migrations live in `db/migrations/NNNN_name.sql`, numbered consecutively. They are applied in order and recorded with a SHA-256 checksum in `omen_schema_migrations`. Editing an applied migration is refused; add a new one instead. The highest migration number must equal `EXPECTED_SCHEMA_VERSION` in `src/lib/db/schema-version.ts`, and a test checks that they match.

`0001_core_event_storage.sql` and `0002_trustworthy_temporal_storage.sql` create the following tables.

| Table | Holds | Mutability |
| --- | --- | --- |
| `events` | Current projection: precise question (must end in `?`), status (`watch`/`active`/`resolved`), deadline, resolution criteria (≥ 20 chars), category, significance, provenance, catalog/follow flags, and a `display` JSON object with presentation-only context (signals, analogues, timeline…) | Semantic columns update only through the write path (see below). Cannot be deleted while it has history. |
| `event_revisions` | Append-only versions of reconstructible event metadata: title, question, status, deadline, resolution criteria, category, significance, region, summary, tags, related events, provenance. Excludes `display`, catalog position and follow flags. | Append-only |
| `probability_observations` | Event, source kind (`provider`/`author`) and name, probability type (`market_implied`/`forecaster_estimate`/`model_estimate`), value, `observed_at`, `captured_at`, `record_available_at`, provenance | Append-only |
| `evidence` | Source name/URL, `source_published_at` (nullable: the source may carry no date), `first_observed_at` (when OMEN first saw it), `captured_at`, `record_available_at`, stance, reliability 0–1, `recorded_by`, provenance | Append-only |
| `move_logs` | One row per move on an event | Append-only |
| `move_log_revisions` | Version, `published_at`, `recorded_at`, `record_available_at`, author, what changed, likely cause, explained %, unexplained factors, linked `evidence_ids`, correction note, provenance | Append-only |
| `omen_history_coverage` | One row: when trustworthy semantic event history begins, and when pre-existing history rows were aligned to trustworthy `record_available_at` | Set at migration 0002 |

Every event must have at least one observation. This is a deferred constraint trigger, checked at commit.

### Probability scale

Every probability is stored in **percentage points**, as `numeric(5,2)` constrained to `0.00–100.00` inclusive, so `73.8` means 73.8%. The same scale applies to `explained_pct`. `reliability` is a 0–1 fraction. The write command rejects values with more than two decimals, and PostgreSQL rounds any more-precise value written directly.

### Time fields and reconstruction availability

Three different times appear on history rows. Do not treat source or capture times as proof that OMEN could have reconstructed a past view earlier.

| Field | Meaning |
| --- | --- |
| Source time (`observed_at`, `source_published_at`, move log `published_at`) | What the source or publication claims about when something happened or was published. Callers may supply these; they do not establish OMEN knowledge. |
| Capture time (`captured_at`, evidence `first_observed_at`, move log `recorded_at`, event revision `recorded_at`) | When OMEN observed or recorded the claim in the write path. Bundles may supply `capturedAt` on observations and evidence; the database still enforces ordering against source times. |
| **`record_available_at`** | When the stored row became available for point-in-time reconstruction. Set only by the database at insert (`clock_timestamp()`). Never caller-supplied. A reconstruction at instant *T* may include a row only when `record_available_at <= T`. |

Additional rules:

- `observed_at`: when the probability applied.
- `captured_at`: when OMEN recorded the observation. The database enforces `captured_at >= observed_at`.
- `source_published_at`: what the source claims. It is never filled in from `first_observed_at`. When the source has no date it stays `NULL`, and the UI shows "Not stated by source".
- The database enforces `source_published_at <= first_observed_at <= captured_at`.
- Backdated `capturedAt` values do **not** backdate `record_available_at`. Pre-migration rows receive `record_available_at` from `omen_history_coverage.record_availability_realigned_at`, not from their old capture times.

**Transaction semantics:** each bundle runs in one transaction. Event projection updates set `SET LOCAL omen.allow_event_projection = true`; direct SQL updates to revision-controlled event columns are rejected otherwise. Event and move log revision version numbers are allocated under a row lock on the parent event or move log so concurrent writers cannot skip or duplicate versions. Identical bundle replays are no-ops; meaningful changes append new history rows.

### History coverage baseline (migration 0002)

Migration `0002_trustworthy_temporal_storage.sql` does **not** backfill `event_revisions` from existing `events` rows. Semantic event history before the first revision recorded after migration is **unavailable** for reconstruction. The migration stores `omen_history_coverage.semantic_event_fields_from` as the baseline instant from which append-only event metadata history is trustworthy.

Existing probability observations, evidence items and move log revisions keep their source and capture times, but their `record_available_at` is set to the migration instant so reconstruction does not pretend those rows were available earlier than Task 04A.

### Event metadata revisions

Semantic changes go through `event_revisions`, mirroring move logs:

- version 1 is recorded when an event is first inserted through the write path;
- later changes require `event.correctionNote` in the bundle and append the next consecutive version;
- the `events` row remains the read-optimized projection; historical views must read `event_revisions`, not infer past semantics from today's projection.

Presentation-only `display` data is not versioned and must not be imported into historical reconstructions.

### Move Log revisions and corrections

A trigger on `move_log_revisions` enforces four rules:

- versions are consecutive from 1;
- `published_at` never goes backwards;
- linked evidence must exist on the same event;
- the same evidence can't be linked twice.

Version 1 has no correction note, and every later version requires one. UPDATE, DELETE and TRUNCATE on history tables raise an error. A correction is therefore always a new, visible version. The event page shows the latest version, its first publication time and the correction note. `npm run db:show` prints the full revision history.

Workspace reads map the rows as follows:

- observations are grouped into series by source kind, source name, probability type and provenance. Only observations in the same series are compared;
- the headline series is the market-implied one when there is one, otherwise the most recently observed. Current and previous probability are its two most recent observations, and `expectationHistory` is its path, oldest first;
- every series, with `observed_at` and `captured_at` per point, is returned as `probabilitySeries`. Evidence carries its `captured_at`;
- the event page labels a series **Illustrative** when its provenance is `demo`, whatever its probability type. Sourced `market_implied` series are **Market-implied**; `forecaster_estimate` and `model_estimate` are **Authored forecast**;
- there is no forecast table yet, so `forecasts` is always empty and the event page shows no OMEN forecast;
- "what changed", likely cause and explained % come from the latest revision of the event's most recent move log;
- if an event has no `display.timeline`, its timeline is built only from stored evidence and revisions.

## Local setup (disposable database)

Use a local PostgreSQL 14+ server you can throw away. Do not point these commands at a shared, hosted or production database.

```bash
# Example for Ubuntu; any local PostgreSQL works.
sudo apt-get install -y postgresql
sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE omen_local LOGIN CREATEDB PASSWORD 'choose-a-local-password'"
sudo -u postgres createdb -O omen_local omen_dev

cp .env.example .env.local   # then edit DATABASE_URL / OMEN_TEST_DATABASE_ADMIN_URL
```

`.env.local` is git-ignored. Next.js loads it for the app, and `npm run db:*` loads it for the command. `DATABASE_URL` is server-only: never copy it into a `NEXT_PUBLIC_` variable, and a test fails if one appears.

```bash
npm run db:migrate -- --identify development --label "my laptop"   # once, on the empty database
npm run db:upsert -- --file db/fixtures/demo-evt-boc-cut.json          # one complete demo event
npm run db:upsert -- --file db/fixtures/demo-evt-boc-cut.correction.json  # publishes Move Log v2
npm run db:status
npm run db:show -- --event evt-boc-cut

OMEN_STORAGE_MODE=database npm run dev   # or set it in .env.local
```

### The write command

`scripts/omen-db.ts` is the only write path. There is no HTTP write endpoint. It is for nonproduction use only:

- It refuses to run `migrate` or `upsert` when `NODE_ENV`, `VERCEL_ENV` or `OMEN_DEPLOYMENT_ENV` is `production`.
- It writes only to a database carrying an OMEN identity (`omen_database_identity`). The identity's environment must be `development`, `test` or `demo`; the column cannot hold `production`.
- `--identify` records that identity, and only on a database with **no** tables. An existing, unidentified database is never adopted.
- There is no reset or seed-everything command. The identity is a safety rail against mistakes. It is not access control.

`upsert --file` takes a JSON bundle. The fixtures in `db/fixtures/` show both shapes.

- `event` (optional; upserts the event projection and append-only metadata revisions) or `eventId` (append to an existing event).
- `observations`, `evidence` and `moveLogRevisions` to append. `sourcePublishedAt` is required; use `null` when the source has no date. Move log corrections need `version > 1` and a `correctionNote`. Event metadata corrections need `event.correctionNote` when revision version would be greater than 1.

A bundle is validated in full before connecting, then written in one transaction:

- Re-running an identical bundle changes nothing.
- A bundle that would change a recorded observation, evidence item, event revision or published move log revision is rejected, and the whole transaction rolls back. For revisions, the error names the next free version to publish as a correction.

## Tests

```bash
npm test          # unit and component tests; no database needed
npm run test:db   # PostgreSQL integration tests
```

`npm run test:db` needs `OMEN_TEST_DATABASE_ADMIN_URL`, a connection to a **local** server whose role has `CREATEDB`. Each run creates uniquely named `omen_test_<pid>_<hex>` databases and identifies them as `test`. It drops only databases matching that pattern. Without the variable, every integration test fails with a `BLOCKED:` message instead of passing silently.

The integration suite covers:

- migrations and checksum drift;
- refusal of unidentified or production targets;
- every table constraint and trigger, including append-only history;
- repository reads and writes, idempotent re-runs and rollback on conflict;
- correction as a new version with v1 preserved (move logs and event metadata);
- trustworthy `record_available_at`, coverage baseline, backdated capture input, and concurrent revision allocation;
- persistence across processes: separate `tsx scripts/omen-db.ts` processes write, the test reads over a fresh pool, and a third process reads the data back;
- explicit failures for a missing schema, schema version drift, bad credentials and a missing database in database mode.

## Not included

- No hosted database provisioning, production migrations or production writes (owner approval required).
- No public write endpoint, auth, per-user watchlists, or billing. "Followed by default" is a column on the event.
- No Archive / workspace UI for point-in-time reconstruction yet (`/archive` remains a demo shell). The storage layer is ready; reads still use the latest projection.
- Legacy demo-only screens (Markets, Signals and others listed in `docs/architecture.md`) still read the in-process demo book in both modes.
