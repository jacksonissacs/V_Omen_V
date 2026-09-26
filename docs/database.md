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

`0001_core_event_storage.sql` through `0005_intake_review_bridge.sql` create the following tables.

| Table | Holds | Mutability |
| --- | --- | --- |
| `events` | Current projection: precise question (must end in `?`), status (`watch`/`active`/`resolved`), deadline, resolution criteria (≥ 20 chars), category, significance, provenance, catalog/follow flags, and a `display` JSON object with presentation-only context (signals, analogues, timeline…) | Semantic columns update only through the write path (see below). Cannot be deleted while it has history. |
| `event_revisions` | Append-only versions of reconstructible event metadata: title, question, status, deadline, resolution criteria, category, significance, region, summary, tags, related events, provenance. Excludes `display`, catalog position and follow flags. | Append-only |
| `probability_observations` | Event, source kind (`provider`/`author`) and name, probability type (`market_implied`/`forecaster_estimate`/`model_estimate`), value, `observed_at`, `captured_at`, `record_available_at`, provenance | Append-only |
| `evidence` | Source name/URL, `source_published_at` (nullable: the source may carry no date), `first_observed_at` (when OMEN first saw it), `captured_at`, `record_available_at`, stance, reliability 0–1, `recorded_by`, provenance | Append-only |
| `move_logs` | One row per move on an event | Append-only |
| `move_log_revisions` | Version, `published_at`, `recorded_at`, `record_available_at`, author, what changed, likely cause, explained % (nullable when no share is recorded), unexplained factors, linked `evidence_ids`, correction note, provenance | Append-only |
| `source_review_items` | Staged operator intake. Status is `staged`, `approved`, or `rejected`. A file-queue capture keeps source id, captured version, canonical URL, source clock time, calendar date, fetch time, and content identity. Re-import of the same version updates nothing | Review outcome is durable. Payload is not rewritten after staging |
| `publication_operations` | Idempotent publish attempts: bundle JSON, status (`pending`, `checkpoint_pending`, `completed`, `failed`), write summary, checkpoint id and sequence as bigint, optional link to a review item | Updated through the operator publish path. The bundle for one idempotency key does not change |
| `omen_history_coverage` | One row: when append-only semantic event history begins, and when pre-existing history rows received their `record_available_at` realignment marker | Set at migration 0002. Immutable afterwards |
| `history_checkpoints` | One immutable verified reconstruction point for an event: publishing transaction id, the publishing statement's snapshot, content digest, member count, and semantic-history label. No foreign key to `events` | Append-only |
| `history_checkpoint_members` | History rows visible in that snapshot (`probability_observations`, `evidence`, `move_log_revisions`, `event_revisions`), with the inserting transaction id | Append-only. Written only by the publishing transaction |

Every event must have at least one observation. This is a deferred constraint trigger, checked at commit.

### Probability scale

Every probability is stored in **percentage points**, as `numeric(5,2)` constrained to `0.00–100.00` inclusive, so `73.8` means 73.8%. The same scale applies to `explained_pct` when it is recorded; otherwise the column stays `NULL` and readers report that the explained share is not recorded. `reliability` is a 0–1 fraction. The write command rejects values with more than two decimals, and PostgreSQL rounds any more-precise value written directly.

### Source time, recording time, snapshot capture, and publication

These are different facts. V0 does not reconstruct an arbitrary wall-clock instant, and one timestamp on a bundle is not a visibility proof.

| Kind | Fields | Meaning |
| --- | --- | --- |
| Source time | `observed_at`, `source_published_at`, move log `published_at` | What the source or publication claims. Callers may supply these. They do not say when OMEN recorded the claim or when a row became visible. |
| Recording time | `captured_at`, evidence `first_observed_at`, move log `recorded_at`, event revision `recorded_at`, `record_available_at` | When the write path recorded the claim. Bundles may supply `capturedAt` and evidence observation times, and those values may be backdated. `recorded_at` defaults to the insert statement's clock. **`record_available_at`** is set only by the database to `transaction_timestamp()`: the start of the inserting transaction, shared by every history row that transaction inserts. It is never caller-supplied. It is not the commit time. |
| Snapshot capture | `history_checkpoints.observed_snapshot` | The publishing statement's `pg_current_snapshot()`. Membership is the history rows whose inserting transaction ids are visible in that snapshot. |
| Publication | the committed `history_checkpoints` row | The checkpoint becomes a fact when its transaction commits. No publication timestamp is stored. A later reader must not treat `record_available_at`, source time, or recording time as the time the checkpoint or its members became visible. |

Additional rules:

- `observed_at`: when the probability applied.
- `captured_at`: when OMEN recorded the observation. The database enforces `captured_at >= observed_at`.
- `source_published_at`: what the source claims. It is never filled in from `first_observed_at`. When the source has no date it stays `NULL`, and the UI shows "Not stated by source".
- The database enforces `source_published_at <= first_observed_at <= captured_at`.
- Backdated `capturedAt` values do **not** change `record_available_at`.

**Reproduced visibility gap.** `record_available_at <= T` does not mean a row was visible at T. A committed reader can miss the row while the inserting transaction is still open, including when that transaction is waiting on a lock, at a wall-clock time later than `record_available_at`. A transaction that starts earlier can become visible later than one that starts later, so the column does not order commit visibility. Two snapshots can also overlap in wall-clock time and see different committed rows (a `REPEATABLE READ` reader keeps its snapshot; a new reader sees the later commit). Arbitrary-time reconstruction is therefore not a single state, and V0 does not implement it.

**Reproduced checkpoint defects, fixed in migration 0003.** These were observed against an earlier draft of this migration; the checks below are what closed them.

- `pg_visible_in_snapshot` returned true for the publishing transaction's own uncommitted row, including a subtransaction xid, after another transaction committed. The row's `pg_xact_status` stayed `in progress`, and a second backend's snapshot still listed that xid. A checkpoint published in the open transaction stored the row and verified as `ok`. Membership now requires `pg_xact_status` to be `committed` (or NULL when the status has been discarded). Publishing still refuses while any history row for the event is `in progress`.
- A checkpoint insert that referenced `events` took `FOR KEY SHARE` and waited on an open `event_revisions` `FOR UPDATE`. The statement snapshot was taken before the wait, so the checkpoint committed without the revision that had just committed. `history_checkpoints` has no foreign key to `events`. The guard reads the event without a row lock.
- In the publishing transaction, an extra `history_checkpoint_members` row for another event's observation committed. Verification then returned `member-count-mismatch`, and nothing called verification before commit. The member guard rejects a row whose event is not the checkpoint's event, and a deferred constraint rejects a member count that no longer matches when the transaction commits.

**Not used.** Replacing `transaction_timestamp()` with per-row `clock_timestamp()`, a sleep, or a commit-timestamp column would still be a wall-clock value. A reading taken before commit, including `clock_timestamp()` inside the open transaction, is already earlier than a committed observation that the row is absent. V0 does not store `pg_xact_commit_timestamp` or a deferred-trigger clock; those mechanisms are not a substitute for a snapshot. `xmin::text::xid8` drops an xid epoch after wraparound; that cast is not a second visibility proof.

**Transaction semantics.** Bundle rows commit in one transaction. Event projection updates set `SET LOCAL omen.allow_event_projection = true`; direct SQL updates to revision-controlled event columns are rejected otherwise. Event and move log revision version numbers are allocated under a row lock on the parent event or move log so concurrent writers cannot skip or duplicate versions. After that transaction commits, a second transaction publishes a checkpoint. Identical bundle replays change nothing and do not append a checkpoint. If the data commit succeeds and publishing fails, the rows stay committed and retrying the bundle publishes the checkpoint.

### Verified checkpoints (migration 0003)

`history_checkpoints.visibility_contract` is always `observed_snapshot_members`. That is the only visibility claim V0 stores.

Publishing (`omen_publish_history_checkpoint`) takes a transaction advisory lock for that event so two publishers serialise. It does not lock `events`. It refuses when the same transaction already has uncommitted history for the event, including history inserted in a subtransaction, judged by `pg_xact_status` rather than `pg_visible_in_snapshot`. The insert trigger captures `pg_current_snapshot()` once and stores that value, and stores the publishing transaction's top-level xid. A snapshot or digest supplied in the `INSERT` is not kept: two calls in one statement can observe different xid horizons once this transaction takes an xid or another transaction commits. Membership is history whose inserting transaction had committed and is visible in the captured snapshot. Triggers reject:

- a publish attempted while the same transaction has in-progress history for the event;
- a member whose inserting transaction is not committed, is not visible in the stored snapshot, belongs to another event, or was not written by the publishing transaction;
- a member count other than the rows copied from that snapshot, including a count that changes before the publishing transaction commits;
- any coverage label other than the baseline copied from `omen_history_coverage`, or any visibility contract other than `observed_snapshot_members`;
- a sequence that is not the next one for the event;
- a checkpoint whose event row is absent.

An insert whose digest matches the latest checkpoint writes nothing.

`content_md5` is the MD5 of the canonical member payload. PostgreSQL recomputes it in `omen_verify_history_checkpoint`. The digest detects a member set or payload that no longer matches the checkpoint. It is not a cryptographic signature: a role that can disable triggers can rewrite the database. History rows themselves stay append-only.

`semantic_history` is `recorded` when the snapshot includes at least one `event_revisions` row, and `unavailable` when it includes none. The current `events` projection is never copied into a revision. `pre_baseline_event_revisions` is always `not_recorded`.

A checkpoint does not cover other events. A committed state that no publishing transaction observed is not a verified reconstruction point: lock-waiting writers can commit an intermediate revision that the next publisher never saw on its own. Latest-projection reads still use `events` and the latest history rows. Archive must not treat those rows as a verified past view until a checkpoint includes them.

`move_logs` is the parent of move log revisions and is not itself a checkpoint member. The revision row carries the publication.

`writeEventBundle` is the only publication path. It commits history, then calls `omen_publish_history_checkpoint` in a later transaction. `npm run db:upsert` prints that checkpoint. It does not publish a second time. Migration `0003` is unchanged by the historical reader: there is no competing checkpoint migration, and checksums of applied migrations are not rewritten.

### Stored reconstruction

Historical reads use checkpoint membership. They do not filter on `record_available_at`, capture time, source publication time, or the current `events` row.

`GET /api/events/:id/history` lists published checkpoints for one event, newest sequence first. The page is bounded (`limit` defaults to 20 and cannot exceed 50; `beforeSequence` requests the next older page). The list does not include member rows and does not verify them. `GET /api/events/:id/history/:checkpointId` reads one checkpoint through `IntelligenceRepository.reconstructEvent` inside one repeatable-read snapshot. Member rows are loaded by primary key. `history_checkpoints.id` and other bigint row ids are decimal strings in TypeScript and JSON, so values past `Number.MAX_SAFE_INTEGER` stay exact. The digest field is `contentMd5`.

The read response is a historical record, not an `AionEvent`:

- event semantics are the highest **member** `event_revisions` version;
- observations, evidence and Move Log revisions are the member rows only. Each Move Log contributes its highest member version;
- `display`, catalog position and follow flags are omitted;
- when `semantic_history` is `unavailable`, the response is **pre-coverage**: `semantics` is null and the current projection is not copied in.

`?at=` and `?cutoff=` return `422` and do not query storage. Outcomes stay distinct:

| Situation | Outcome | HTTP |
| --- | --- | --- |
| Malformed event or checkpoint id, or a limit outside 1–50 | `invalid_request` | 400 |
| Event is not stored | `unknown_event` | 404 |
| Checkpoint id is absent, or belongs to another event | `missing_checkpoint` | 422 |
| Checkpoint has no semantic revision | `pre_coverage` | 409 |
| `omen_verify_history_checkpoint` is not `ok`, or members do not form a coherent view | `verification_failed` | 422 |
| Demo storage, or a wall-clock cutoff | `unsupported_history` | 422 |
| Database connection, schema, or query failure | `unavailable` | 503 |

Database mode does not fall back to current or demo rows. A checkpoint that fails verification does not make the rest of storage unavailable.

### History coverage baseline (migration 0002)

Migration `0002_trustworthy_temporal_storage.sql` does **not** backfill `event_revisions` from existing `events` rows. Semantic event history before the first revision recorded after migration is **unavailable**. The migration stores `omen_history_coverage.semantic_event_fields_from` as the baseline from which append-only event metadata history exists. Migration 0003 makes that row immutable.

Existing probability observations, evidence items and move log revisions keep their source and recording times. Their `record_available_at` is set to the migration's `clock_timestamp()`, a realignment marker taken inside the migration transaction before that transaction commits. It is not the time those rows became visible, and reconstruction does not filter on it. A later checkpoint includes those rows only because its snapshot sees them as committed, and it labels `semantic_history` as `unavailable` until a real `event_revisions` row exists. Migration 0003 does not rewrite history rows and does not publish checkpoints during the upgrade.

Migration 0002 temporarily disables the three append-only row triggers from 0001 only while running those one-time `UPDATE`s. The comment in that file that calls `record_available_at` reconstruction availability is superseded by this section; the file is not edited, so its checksum stays valid. There is no down migration. Failed upgrades roll back with the migrator transaction.

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

`scripts/omen-db.ts` is the low-level write path. `scripts/omen-operator.ts` (`npm run operator`) stages review items and publishes only through `publishEventBundle`, which calls `writeEventBundle`. There is no HTTP write endpoint. Both are for nonproduction use only:

- It refuses to run `migrate` or `upsert` when `NODE_ENV`, `VERCEL_ENV` or `OMEN_DEPLOYMENT_ENV` is `production`.
- It writes only to a database carrying an OMEN identity (`omen_database_identity`). The identity's environment must be `development`, `test` or `demo`; the column cannot hold `production`.
- `--identify` records that identity, and only on a database with **no** tables. An existing, unidentified database is never adopted.
- There is no reset or seed-everything command. The identity is a safety rail against mistakes. It is not access control.

`upsert --file` takes a JSON bundle. The fixtures in `db/fixtures/` show both shapes.

- `event` (optional; upserts the event projection and append-only metadata revisions) or `eventId` (append to an existing event).
- `observations`, `evidence` and `moveLogRevisions` to append. `sourcePublishedAt` is required; use `null` when the source has no date. Move log corrections need `version > 1` and a `correctionNote`. Event metadata corrections need `event.correctionNote` when revision version would be greater than 1.

A bundle is validated in full before connecting. History rows are written in one transaction, and a checkpoint is published in a second transaction:

- Re-running an identical bundle changes nothing.
- A bundle that would change a recorded observation, evidence item, event revision or published move log revision is rejected, and the whole transaction rolls back. For revisions, the error names the next free version to publish as a correction.

## Tests

```bash
npm test          # unit and component tests; no database needed
npm run test:db   # PostgreSQL integration tests
npm run test:workflow  # production Next.js + disposable PostgreSQL + Chrome
npm run intake:check   # external CISA KEV reachability; not part of test:workflow
```

`npm run test:db` needs `OMEN_TEST_DATABASE_ADMIN_URL`, a connection to a **local** server whose role has `CREATEDB`. Each run creates uniquely named `omen_test_<pid>_<hex>` databases and identifies them as `test`. It drops only databases matching that pattern. Without the variable, every integration test fails with a `BLOCKED:` message instead of passing silently.

The integration suite covers:

- migrations and checksum drift;
- refusal of unidentified or production targets;
- every table constraint and trigger, including append-only history;
- repository reads and writes, idempotent re-runs and rollback on conflict;
- correction as a new version with v1 preserved (move logs and event metadata);
- recording-time `record_available_at` (not a visibility predicate), coverage baseline, backdated source and capture input, and concurrent revision allocation;
- verified checkpoints: delayed commits, lock-waiting writers, an open event revision that must not stall publication, multi-table bundles, legacy events with no semantic revision, consistent multi-table reads, and rejection of uncommitted or cross-event members;
- stored reconstruction from checkpoint membership: later corrections, backdated evidence, late commits, missing semantic revisions, cross-event checkpoint ids, verification failure, retries, bounded checkpoint listing, and lossless bigint ids;
- operator publishing: review before publication, nullable explained percentages, corrections, checkpoint retry without duplicate rows, and lossless checkpoint ids;
- source-intake import: one review item per source version, no invented probability or publication timestamp, rejection of stale approvals, changed versions, and concurrent checkpoint retry;
- persistence across processes: separate `tsx scripts/omen-db.ts` processes write, the test reads over a fresh pool, and a third process reads the data back;
- explicit failures for a missing schema, schema version drift, bad credentials and a missing database in database mode.

`npm run test:workflow` is a separate deterministic suite. It needs a production build (`npm run build`), `OMEN_TEST_DATABASE_ADMIN_URL`, and Chrome (`CHROME_PATH` when the binary is not on the default path). It creates a disposable database, writes labelled synthetic fixtures through `omen-db` and `omen-operator`, and starts `next start`. Checkpoint ids in that suite are the decimal `history_checkpoints.id` values published with `content_md5`. It does not request CISA or any other external source. Failure screenshots, HTML and console diagnostics are written to `test-artifacts/` (gitignored).

`npm run intake:check` is the external-source smoke check. It GETs the allowlisted CISA KEV document, prints catalog metadata, and does not write the review queue. CI runs it as its own job so a feed outage is not confused with a deterministic workflow failure.

## Not included

- No hosted database provisioning, production migrations or production writes (owner approval required).
- No public write endpoint, auth, server-side per-user watchlists, or billing. Following is stored in the browser for the current storage mode. "Followed by default" is a column on the event.
- `/archive` and `/events/:id/history/:checkpointId` replay stored checkpoints. They do not reconstruct an arbitrary wall-clock instant. Latest-projection reads stay on the event page.
- Legacy demo-only screens (Markets, Signals and others listed in `docs/architecture.md`) still read the in-process demo book in both modes.
- Source intake ([source-intake.md](source-intake.md)) writes a gitignored local review queue. Importing a selected version stages a database review item for an event that already exists. It does not insert observations, evidence, or Move Log rows until an operator approves that item and publishes it.
