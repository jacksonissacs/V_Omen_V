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

`0001_core_event_storage.sql` creates the following tables.

| Table | Holds | Mutability |
| --- | --- | --- |
| `events` | Precise question (must end in `?`), status (`watch`/`active`/`resolved`), deadline, resolution criteria (≥ 20 chars), category, significance, provenance, and a `display` JSON object with presentation-only context (signals, analogues, timeline…) | Updatable. Cannot be deleted while it has history. |
| `probability_observations` | Event, source kind (`provider`/`author`) and name, probability type (`market_implied`/`forecaster_estimate`/`model_estimate`), value, `observed_at`, `captured_at`, provenance | Append-only |
| `evidence` | Source name/URL, `source_published_at` (nullable: the source may carry no date), `first_observed_at` (when OMEN first saw it), `captured_at`, stance, reliability 0–1, `recorded_by`, provenance | Append-only |
| `move_logs` | One row per move on an event | Append-only |
| `move_log_revisions` | Version, `published_at`, author, what changed, likely cause, explained %, unexplained factors, linked `evidence_ids`, correction note, provenance | Append-only |

Every event must have at least one observation. This is a deferred constraint trigger, checked at commit.

### Probability scale

Every probability is stored in **percentage points**, as `numeric(5,2)` constrained to `0.00–100.00` inclusive, so `73.8` means 73.8%. The same scale applies to `explained_pct`. `reliability` is a 0–1 fraction. The write command rejects values with more than two decimals, and PostgreSQL rounds any more-precise value written directly.

### Time fields

- `observed_at`: when the probability applied.
- `captured_at`: when OMEN recorded it. The database enforces `captured_at >= observed_at`.
- `source_published_at`: what the source claims. It is never filled in from `first_observed_at`. When the source has no date it stays `NULL`, and the UI shows "Not stated by source".
- The database enforces `source_published_at <= first_observed_at <= captured_at`.

### Move Log revisions and corrections

A trigger on `move_log_revisions` enforces four rules:

- versions are consecutive from 1;
- `published_at` never goes backwards;
- linked evidence must exist on the same event;
- the same evidence can't be linked twice.

Version 1 has no correction note, and every later version requires one. UPDATE, DELETE and TRUNCATE on history tables raise an error. A correction is therefore always a new, visible version. The event page shows the latest version, its first publication time and the correction note. `npm run db:show` prints the full revision history.

Workspace reads map the rows as follows:

- observations are grouped into series by source kind, source name, probability type and provenance. Only observations in the same series are compared;
- the headline series is the market-implied one when there is one, otherwise the most recently observed. Current probability is its latest observation. Previous probability and the change use the two most recent observations of that same series, and only when at least two exist — a one-point series has no previous probability and no change. `expectationHistory` is that series, oldest first;
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

- `event` (optional; upserts the event) or `eventId` (append to an existing event).
- `observations`, `evidence` and `moveLogRevisions` to append. `sourcePublishedAt` is required; use `null` when the source has no date. Corrections need `version > 1` and a `correctionNote`.

A bundle is validated in full before connecting, then written in one transaction:

- Re-running an identical bundle changes nothing.
- A bundle that would change a recorded observation, evidence item or published revision is rejected, and the whole transaction rolls back. For revisions, the error names the next free version to publish as a correction.

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
- correction as a new version with v1 preserved;
- persistence across processes: separate `tsx scripts/omen-db.ts` processes write, the test reads over a fresh pool, and a third process reads the data back;
- explicit failures for a missing schema, schema version drift, bad credentials and a missing database in database mode.

## Not included

- No hosted database provisioning, production migrations or production writes (owner approval required).
- No public write endpoint, auth, per-user watchlists, or billing. "Followed by default" is a column on the event.
- No revision history for mutable event fields (title, question, status, deadline, criteria). Upserts overwrite them. History is preserved for observations, evidence and Move Logs.
- Legacy demo-only screens (Markets, Signals and others listed in `docs/architecture.md`) still read the in-process demo book in both modes.
