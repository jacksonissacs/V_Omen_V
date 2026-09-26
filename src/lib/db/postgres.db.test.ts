import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

import { Client, Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { __resetRepositoryForTests, getRepository, summarizeProvenance } from "@/lib/data/repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { readEventRevisionHistory, readHistoryCoverage, readMoveLogHistory } from "@/lib/db/event-reader"
import { publishHistoryCheckpoint, verifyHistoryCheckpoint } from "@/lib/db/history-checkpoint"
import { HistoryConflictError, writeEventBundle } from "@/lib/db/event-store"
import {
  assertWritableDatabase,
  DatabaseSafetyError,
  identifyDatabase,
  loadMigrations,
  migrate,
} from "@/lib/db/migrate"
import { EXPECTED_SCHEMA_VERSION } from "@/lib/db/schema-version"
import {
  createDisposableDatabase,
  createMigratedDatabase,
  type DisposableDatabase,
  withClient,
} from "@/test/postgres-harness"

const ROOT = path.resolve(__dirname, "../../..")
const SEED_FILE = path.join(ROOT, "db/fixtures/demo-evt-boc-cut.json")
const CORRECTION_FILE = path.join(ROOT, "db/fixtures/demo-evt-boc-cut.correction.json")
const POPULATED_V1_FIXTURE = path.join(ROOT, "db/fixtures/test-populated-v1-evt-boc-cut.sql")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const populateV1History = (client: Client) => client.query(readFileSync(POPULATED_V1_FIXTURE, "utf8"))
const seedBundle = () => parseEventBundle(readJson(SEED_FILE))
const correctionBundle = () => parseEventBundle(readJson(CORRECTION_FILE))

/** A second, independent event whose records claim sourced provenance. */
const sourcedBundle = () =>
  parseEventBundle({
    event: {
      id: "evt-sourced-sample",
      title: "Sample sourced event",
      question: "Will the sample agency publish its report before 1 December 2026?",
      status: "watch",
      deadline: "2026-12-01T00:00:00Z",
      resolutionCriteria: "Resolves YES if the report appears on the agency website before the deadline.",
      category: "Science",
      significance: "low",
      region: "Global",
      summary: "Test record entered from a cited source.",
      provenance: "sourced",
      catalogPosition: 1,
    },
    observations: [
      {
        sourceKind: "author",
        sourceName: "test analyst",
        probabilityType: "forecaster_estimate",
        probabilityPct: 40,
        observedAt: "2026-09-10T00:00:00Z",
        capturedAt: "2026-09-10T00:05:00Z",
        provenance: "sourced",
      },
    ],
    evidence: [
      {
        id: "ev-sourced-1",
        sourceName: "Agency schedule",
        sourceUrl: "https://example.org/schedule",
        sourcePublishedAt: "2026-09-01T00:00:00Z",
        firstObservedAt: "2026-09-09T00:00:00Z",
        capturedAt: "2026-09-09T00:01:00Z",
        summary: "Schedule lists the report for November.",
        stance: "supports",
        reliability: 0.7,
        recordedBy: "test",
        provenance: "sourced",
      },
    ],
  })

async function expectDatabaseError(client: Client, sql: string, params: unknown[], message: RegExp) {
  await client.query("SAVEPOINT attempt")
  let error: unknown
  try {
    await client.query(sql, params)
  } catch (caught) {
    error = caught
  }
  await client.query("ROLLBACK TO SAVEPOINT attempt")
  expect(error, `expected ${sql} to fail`).toBeInstanceOf(Error)
  const { message: text, constraint } = error as Error & { constraint?: string }
  expect(`${constraint ?? ""} ${text}`).toMatch(message)
}

const created: DisposableDatabase[] = []
async function migratedDatabase() {
  const database = await createMigratedDatabase()
  created.push(database)
  return database
}
async function emptyDatabase() {
  const database = await createDisposableDatabase()
  created.push(database)
  return database
}

afterAll(async () => {
  __resetRepositoryForTests()
  await Promise.all(created.map((database) => database.drop()))
})

describe("migrations", () => {
  it("identifies an empty database, applies every migration once and records checksums", async () => {
    const database = await emptyDatabase()
    await withClient(database.url, async (client) => {
      const identity = await identifyDatabase(client, "test", "migration test")
      expect(identity.environment).toBe("test")

      const migrations = loadMigrations()
      expect(migrations.at(-1)?.version).toBe(EXPECTED_SCHEMA_VERSION)
      const first = await migrate(client, migrations)
      expect(first.applied.map((migration) => migration.version)).toEqual([1, 2, 3])
      const second = await migrate(client, migrations)
      expect(second.applied).toEqual([])
      expect(second.alreadyApplied).toBe(3)

      const { rows } = await client.query("SELECT version, checksum FROM omen_schema_migrations ORDER BY version")
      expect(rows).toEqual([
        { version: 1, checksum: migrations[0]!.checksum },
        { version: 2, checksum: migrations[1]!.checksum },
        { version: 3, checksum: migrations[2]!.checksum },
      ])
      const tables = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      )
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "event_revisions",
        "events",
        "evidence",
        "history_checkpoint_members",
        "history_checkpoints",
        "move_log_revisions",
        "move_logs",
        "omen_database_identity",
        "omen_history_coverage",
        "omen_schema_migrations",
        "probability_observations",
      ])
    })
  })

  it("refuses to adopt, migrate or write to a database it did not identify", async () => {
    const database = await emptyDatabase()
    await withClient(database.url, async (client) => {
      await client.query("CREATE TABLE someone_elses_data (id int)")
      await expect(identifyDatabase(client, "development", "adopt")).rejects.toThrow(
        "Refusing to identify a database that already contains tables.",
      )
      await expect(migrate(client, loadMigrations())).rejects.toThrow(/has no OMEN identity/)
      await expect(assertWritableDatabase(client)).rejects.toBeInstanceOf(DatabaseSafetyError)
      const { rows } = await client.query("SELECT to_regclass('public.events') AS events")
      expect(rows[0].events).toBeNull()
    })
  })

  it("refuses production processes and cannot be labelled production", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await expect(migrate(client, loadMigrations(), { NODE_ENV: "production" })).rejects.toThrow(
        "Refusing to write: NODE_ENV=production.",
      )
      await expect(assertWritableDatabase(client, { VERCEL_ENV: "production" })).rejects.toThrow(
        "Refusing to write: VERCEL_ENV=production.",
      )
      await expect(
        client.query("UPDATE omen_database_identity SET environment = 'production'"),
      ).rejects.toThrow(/check constraint/)
    })
  })

  it("rejects a migration that was edited after it was applied", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      const edited = loadMigrations().map((migration) => ({ ...migration, checksum: "edited" }))
      await expect(migrate(client, edited)).rejects.toThrow(/was edited after it was applied/)
    })
  })
})

describe("constraints", () => {
  let database: DisposableDatabase
  let client: Client

  beforeAll(async () => {
    database = await migratedDatabase()
    await withClient(database.url, async (writer) => {
      await writeEventBundle(writer, seedBundle())
      await writeEventBundle(writer, sourcedBundle())
    })
    client = new Client({ connectionString: database.url })
    await client.connect()
    await client.query("BEGIN")
  })

  afterAll(async () => {
    await client.query("ROLLBACK")
    await client.end()
  })

  const eventColumns =
    "id, title, question, status, deadline, resolution_criteria, category, significance, region, summary, provenance"
  const validEvent = [
    "evt-constraint",
    "Constraint event",
    "Will the constraint hold?",
    "watch",
    "2026-12-01T00:00:00Z",
    "Resolves YES when the constraint holds for the full period.",
    "Science",
    "low",
    "Global",
    "Summary",
    "demo",
  ]
  const withEvent = (index: number, value: unknown) =>
    validEvent.map((item, position) => (position === index ? value : item))
  const insertEvent = `INSERT INTO events (${eventColumns}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`

  it("requires a precise question, known status and resolution criteria on events", async () => {
    await expectDatabaseError(client, insertEvent, withEvent(2, "Constraint holds"), /events_question_precise/)
    await expectDatabaseError(client, insertEvent, withEvent(3, "open"), /events_status_known/)
    await expectDatabaseError(client, insertEvent, withEvent(5, "   "), /events_resolution_criteria_length/)
    await expectDatabaseError(client, insertEvent, withEvent(10, "live"), /events_provenance_known/)
    await expectDatabaseError(client, insertEvent, withEvent(4, null), /null value in column "deadline"/)
  })

  it("refuses to commit an event without a probability observation", async () => {
    await withClient(database.url, async (other) => {
      await other.query("BEGIN")
      await other.query(insertEvent, validEvent)
      await expect(other.query("COMMIT")).rejects.toThrow("event evt-constraint has no probability observation")
    })
  })

  const insertObservation = `INSERT INTO probability_observations
    (event_id, source_kind, source_name, probability_type, probability_pct, observed_at, captured_at, provenance)
    VALUES ('evt-boc-cut', 'author', 'constraint test', $1, $2, $3, $4, 'demo')`

  it("holds observations to the documented 0–100 percentage-point scale and capture order", async () => {
    const t = "2026-09-20T00:00:00Z"
    await expectDatabaseError(client, insertObservation, ["forecaster_estimate", 100.01, t, t], /observations_probability_scale/)
    await expectDatabaseError(client, insertObservation, ["forecaster_estimate", -0.01, t, t], /observations_probability_scale/)
    await expectDatabaseError(client, insertObservation, ["forecaster_estimate", "NaN", t, t], /observations_probability_scale/)
    await expectDatabaseError(client, insertObservation, ["gut_feel", 50, t, t], /observations_probability_type_known/)
    await expectDatabaseError(
      client,
      insertObservation,
      ["forecaster_estimate", 50, t, "2026-09-19T23:59:59Z"],
      /observations_captured_after_observed/,
    )
    await client.query("SAVEPOINT rounding")
    const { rows } = await client.query(`${insertObservation} RETURNING probability_pct::text AS stored`, [
      "forecaster_estimate",
      99.999,
      t,
      t,
    ])
    expect(rows[0].stored).toBe("100.00")
    await client.query("ROLLBACK TO SAVEPOINT rounding")
  })

  it("keeps source publication time distinct from and no later than first observation", async () => {
    const insertEvidence = `INSERT INTO evidence
      (id, event_id, source_name, source_published_at, first_observed_at, captured_at, summary, stance, reliability, recorded_by, provenance)
      VALUES ('ev-constraint', 'evt-boc-cut', 'Test', $1, $2, $3, 'Summary', 'supports', $4, 'test', 'demo')`
    await expectDatabaseError(
      client,
      insertEvidence,
      ["2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-03T00:00:00Z", 0.5],
      /evidence_published_before_observed/,
    )
    await expectDatabaseError(
      client,
      insertEvidence,
      [null, "2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z", 0.5],
      /evidence_observed_before_captured/,
    )
    await expectDatabaseError(
      client,
      insertEvidence,
      [null, "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", 1.5],
      /evidence_reliability_scale/,
    )
    await expectDatabaseError(
      client,
      insertEvidence,
      [null, "2026-09-01T00:00:00Z", null, 0.5],
      /null value in column "captured_at"/,
    )
  })

  const insertRevision = `INSERT INTO move_log_revisions
    (move_log_id, version, published_at, author, what_changed, likely_cause, explained_pct, evidence_ids, correction_note, provenance)
    VALUES ('ml-boc-cut-2026-09-04', $1, $2, 'test', 'Changed', 'Cause', 50, $3, $4, 'demo')`

  it("publishes move log revisions in order, with notes on corrections and same-event evidence only", async () => {
    const later = "2026-09-06T00:00:00Z"
    await expectDatabaseError(client, insertRevision, [3, later, [], "Skipped a version"], /must publish version 2, not 3/)
    await expectDatabaseError(client, insertRevision, [1, later, [], null], /must publish version 2, not 1/)
    await expectDatabaseError(client, insertRevision, [2, later, [], null], /move_log_revisions_correction_note/)
    await expectDatabaseError(
      client,
      insertRevision,
      [2, "2026-09-04T18:00:00Z", [], "Backdated"],
      /revision 2 is published before revision 1/,
    )
    await expectDatabaseError(
      client,
      insertRevision,
      [2, later, ["ev-sourced-1"], "Links another event's evidence"],
      /links evidence ev-sourced-1 that is not recorded on event evt-boc-cut/,
    )
    await expectDatabaseError(
      client,
      insertRevision,
      [2, later, ["ev-missing"], "Links missing evidence"],
      /links evidence ev-missing/,
    )
    await expectDatabaseError(
      client,
      insertRevision,
      [2, later, ["ev-boc-1", "ev-boc-1"], "Duplicate link"],
      /links the same evidence twice/,
    )
  })

  it("rejects UPDATE, DELETE and TRUNCATE on recorded history", async () => {
    const statements: Array<[string, RegExp]> = [
      ["UPDATE probability_observations SET probability_pct = 1", /append-only: UPDATE on probability_observations/],
      ["DELETE FROM probability_observations", /append-only: DELETE on probability_observations/],
      ["UPDATE evidence SET source_published_at = NULL", /append-only: UPDATE on evidence/],
      ["DELETE FROM evidence", /append-only: DELETE on evidence/],
      ["UPDATE move_log_revisions SET explained_pct = 99", /append-only: UPDATE on move_log_revisions/],
      ["DELETE FROM move_log_revisions", /append-only: DELETE on move_log_revisions/],
      ["UPDATE event_revisions SET question = 'Changed?'", /append-only: UPDATE on event_revisions/],
      ["DELETE FROM event_revisions", /append-only: DELETE on event_revisions/],
      ["UPDATE history_checkpoints SET member_count = 1", /append-only: UPDATE on history_checkpoints/],
      ["DELETE FROM history_checkpoints", /append-only: DELETE on history_checkpoints/],
      ["UPDATE history_checkpoint_members SET row_key = 'x'", /append-only: UPDATE on history_checkpoint_members/],
      ["DELETE FROM history_checkpoint_members", /append-only: DELETE on history_checkpoint_members/],
      ["UPDATE omen_history_coverage SET semantic_event_fields_from = now()", /omen_history_coverage is immutable/],
      ["DELETE FROM omen_history_coverage", /omen_history_coverage is immutable/],
      ["TRUNCATE omen_history_coverage", /omen_history_coverage is immutable/],
      ["TRUNCATE history_checkpoint_members", /append-only: TRUNCATE on/],
      ["UPDATE move_logs SET event_id = 'evt-sourced-sample'", /append-only: UPDATE on move_logs/],
      ["TRUNCATE evidence CASCADE", /append-only: TRUNCATE on/],
      ["TRUNCATE events CASCADE", /append-only: TRUNCATE on/],
    ]
    for (const [sql, message] of statements) {
      await expectDatabaseError(client, sql, [], message)
    }
    await expectDatabaseError(client, "DELETE FROM events WHERE id = 'evt-boc-cut'", [], /violates foreign key constraint/)
  })
})

describe("PostgreSQL repository reads and writes", () => {
  let database: DisposableDatabase
  let pool: Pool
  let repository: PostgresIntelligenceRepository

  beforeAll(async () => {
    database = await migratedDatabase()
    pool = new Pool({ connectionString: database.url, max: 2 })
    repository = new PostgresIntelligenceRepository(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("writes one complete event and reads it back through the repository interface", async () => {
    const summary = await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    expect(summary).toMatchObject({
      eventId: "evt-boc-cut",
      event: "inserted",
      eventRevisions: { appended: 1, unchanged: 0 },
      observations: { appended: 4, unchanged: 0 },
      evidence: { appended: 3, unchanged: 0 },
      moveLogRevisions: { appended: 1, unchanged: 0 },
    })
    expect(summary.checkpoint).toMatchObject({ sequence: 1, created: true, semanticHistory: "recorded" })
    expect(summary.checkpoint.contentMd5).toMatch(/^[0-9a-f]{32}$/)
    expect(await verifyHistoryCheckpoint(pool, summary.checkpoint.id)).toBe("ok")

    const event = await repository.getEvent("evt-boc-cut")
    expect(event).toMatchObject({
      id: "evt-boc-cut",
      provenance: "demo",
      question: "Will the Bank of Canada cut the overnight rate at the 28–29 October 2026 decision?",
      status: "active",
      deadline: "2026-10-29T13:45:00.000Z",
      resolvesAt: "Oct 29 2026",
      probability: 73.8,
      previousProbability: 61.2,
      change: 12.6,
      timestamp: "2026-09-04T18:42:00.000Z",
      explained: 69,
      likelyCause: "Statistics Canada CPI release",
      moveLog: { id: "ml-boc-cut-2026-09-04", version: 1, evidenceIds: ["ev-boc-1", "ev-boc-2"] },
    })
    expect(event?.resolutionCriteria).toMatch(/^Resolves YES if the Bank of Canada/)
    expect(event?.expectationHistory.map((point) => point.probability)).toEqual([48, 58.4, 61.2, 73.8])
    expect(event?.evidence.find((item) => item.id === "ev-boc-3")).toMatchObject({
      publishedAt: "2026-07-30T14:00:00.000Z",
      firstObservedAt: "2026-09-04T18:36:05.000Z",
    })
  })

  it("serves every core read from the stored rows", async () => {
    expect(repository.storage).toBe("database")
    expect((await repository.listEvents()).map((event) => event.id)).toEqual(["evt-boc-cut"])
    expect(await repository.listEvents({ domain: "technology" })).toEqual([])
    expect(await repository.listFollowedEventIds()).toEqual(["evt-boc-cut"])
    expect((await repository.getFeaturedAnomaly())?.id).toBe("evt-boc-cut")
    expect((await repository.search("canada")).map((hit) => hit.id)).toContain("evt-boc-cut")
    expect(await repository.getRelatedEvents("evt-boc-cut")).toEqual([])
    expect(await repository.getEvent("evt-unknown")).toBeUndefined()
    expect((await repository.listFeed()).map((item) => item.eventId)).toEqual(["evt-boc-cut"])
    expect((await repository.getGraph()).nodes.map((node) => node.id)).toEqual(["evt-boc-cut"])
  })

  it("re-running an identical bundle changes nothing", async () => {
    const summary = await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    expect(summary.event).toBe("updated")
    expect(summary.checkpoint).toMatchObject({ sequence: 1, created: false, semanticHistory: "recorded" })
    expect(summary.eventRevisions).toEqual({ appended: 0, unchanged: 1 })
    expect(summary.observations).toEqual({ appended: 0, unchanged: 4 })
    expect(summary.evidence).toEqual({ appended: 0, unchanged: 3 })
    expect(summary.moveLogRevisions).toEqual({ appended: 0, unchanged: 1 })
  })

  it("keeps provenance independent of storage: demo stays demo next to sourced rows", async () => {
    await withClient(database.url, (client) => writeEventBundle(client, sourcedBundle()))
    const events = await repository.listEvents({ order: "catalog" })
    expect(events.map((event) => [event.id, event.provenance])).toEqual([
      ["evt-boc-cut", "demo"],
      ["evt-sourced-sample", "sourced"],
    ])
    expect(summarizeProvenance(events)).toBe("mixed")
    const sourced = events[1]!
    expect(sourced.moveLog).toBeUndefined()
    expect(sourced.whatChanged).toBe("No move log has been published for this event yet.")
    expect(sourced.timeline).toEqual([
      { time: "00:00:00", text: "OMEN first observed: Agency schedule", type: "source" },
    ])
  })

  it("rolls back the whole bundle when it would change a recorded observation", async () => {
    const bundle = seedBundle()
    bundle.observations[0] = { ...bundle.observations[0]!, probabilityPct: 49 }
    bundle.observations.push({
      sourceKind: "author",
      sourceName: "should not persist",
      probabilityType: "forecaster_estimate",
      probabilityPct: 10,
      observedAt: "2026-09-10T00:00:00.000Z",
      capturedAt: "2026-09-10T00:00:00.000Z",
      provenance: "demo",
    })
    await expect(withClient(database.url, (client) => writeEventBundle(client, bundle))).rejects.toThrow(
      HistoryConflictError,
    )
    const event = await repository.getEvent("evt-boc-cut")
    expect(event?.expectationHistory.map((point) => point.probability)).toEqual([48, 58.4, 61.2, 73.8])
  })

  it("publishes a correction as a new version and preserves the original revision", async () => {
    const summary = await withClient(database.url, (client) => writeEventBundle(client, correctionBundle()))
    expect(summary.moveLogRevisions).toEqual({ appended: 1, unchanged: 0 })

    const event = await repository.getEvent("evt-boc-cut")
    expect(event?.explained).toBe(64)
    expect(event?.moveLog).toMatchObject({
      version: 2,
      publishedAt: "2026-09-05T13:10:00.000Z",
      firstPublishedAt: "2026-09-04T18:45:00.000Z",
      correctionNote: expect.stringMatching(/^Coverage revised from 69% to 64%/),
      evidenceIds: ["ev-boc-1", "ev-boc-2", "ev-boc-3", "ev-boc-4"],
    })
    expect(event?.evidence.find((item) => item.id === "ev-boc-4")).toMatchObject({
      publishedAt: null,
      firstObservedAt: "2026-09-05T12:40:00.000Z",
    })

    const history = await readMoveLogHistory(pool, "evt-boc-cut")
    expect(history.map(({ version, explainedPct, publishedAt, evidenceIds, correctionNote }) => ({
      version,
      explainedPct,
      publishedAt,
      evidenceIds,
      correctionNote,
    }))).toEqual([
      {
        version: 1,
        explainedPct: 69,
        publishedAt: "2026-09-04T18:45:00.000Z",
        evidenceIds: ["ev-boc-1", "ev-boc-2"],
        correctionNote: null,
      },
      {
        version: 2,
        explainedPct: 64,
        publishedAt: "2026-09-05T13:10:00.000Z",
        evidenceIds: ["ev-boc-1", "ev-boc-2", "ev-boc-3", "ev-boc-4"],
        correctionNote: expect.stringMatching(/^Coverage revised/),
      },
    ])
  })

  it("refuses to rewrite a published revision and points to the next version", async () => {
    const bundle = seedBundle()
    bundle.moveLogRevisions[0] = { ...bundle.moveLogRevisions[0]!, explainedPct: 80 }
    await expect(withClient(database.url, (client) => writeEventBundle(client, bundle))).rejects.toThrow(
      "Move log ml-boc-cut-2026-09-04 version 1 is already published and cannot be rewritten. Publish the correction as version 3 with a correctionNote.",
    )
    const history = await readMoveLogHistory(pool, "evt-boc-cut")
    expect(history.map((revision) => revision.explainedPct)).toEqual([69, 64])
  })

  it("records event metadata corrections as new revisions and blocks bypassing the write path", async () => {
    const bundle = seedBundle()
    bundle.event = {
      ...bundle.event!,
      status: "watch",
      correctionNote: "Status corrected after desk review.",
    }
    const summary = await withClient(database.url, (client) => writeEventBundle(client, bundle))
    expect(summary.eventRevisions).toEqual({ appended: 1, unchanged: 0 })

    const history = await readEventRevisionHistory(pool, "evt-boc-cut")
    expect(history.map((revision) => [revision.version, revision.status, revision.correctionNote])).toEqual([
      [1, "active", null],
      [2, "watch", "Status corrected after desk review."],
    ])
    expect(await repository.getEvent("evt-boc-cut")).toMatchObject({ status: "watch" })

    await withClient(database.url, async (client) => {
      await client.query("BEGIN")
      await expect(
        client.query("UPDATE events SET status = 'resolved' WHERE id = 'evt-boc-cut'"),
      ).rejects.toThrow(/semantic fields are revision-controlled/)
      await client.query("ROLLBACK")
    })
  })

  it("keeps each source and probability type in its own series and takes the headline change from one series", async () => {
    await withClient(database.url, (client) =>
      writeEventBundle(
        client,
        parseEventBundle({
          eventId: "evt-sourced-sample",
          observations: [
            {
              sourceKind: "provider",
              sourceName: "Sample exchange",
              probabilityType: "market_implied",
              probabilityPct: 55,
              observedAt: "2026-09-08T00:00:00Z",
              capturedAt: "2026-09-08T00:02:00Z",
              provenance: "sourced",
            },
            {
              sourceKind: "provider",
              sourceName: "Sample exchange",
              probabilityType: "market_implied",
              probabilityPct: 52.25,
              observedAt: "2026-09-09T00:00:00Z",
              capturedAt: "2026-09-09T00:02:00Z",
              provenance: "sourced",
            },
          ],
        }),
      ),
    )
    const event = await repository.getEvent("evt-sourced-sample")
    expect(event?.probabilitySeries.map((series) => [series.sourceName, series.probabilityType, series.observations.length])).toEqual([
      ["Sample exchange", "market_implied", 2],
      ["test analyst", "forecaster_estimate", 1],
    ])
    // The analyst's later 40% is a different series, so it is neither the headline nor part of the change.
    expect(event).toMatchObject({ probability: 52.25, previousProbability: 55, change: -2.8, timestamp: "2026-09-09T00:00:00.000Z" })
    expect(event?.expectationHistory.map((point) => point.probability)).toEqual([55, 52.25])
    expect(event?.probabilitySeries[0]?.observations.at(-1)?.capturedAt).toBe("2026-09-09T00:02:00.000Z")
    expect(event?.evidence[0]?.capturedAt).toBe("2026-09-09T00:01:00.000Z")
    expect(event?.forecasts).toEqual([])
  })
})

const execFileAsync = promisify(execFile)
const TSX = path.join(ROOT, "node_modules/.bin/tsx")

async function cli(args: string[], env: Record<string, string>) {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, ["scripts/omen-db.ts", ...args], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "development", ...env },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string }
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr }
  }
}

describe("persistence across processes", () => {
  it("reads in this process what separate CLI processes wrote, and a third process reads it back", async () => {
    const database = await migratedDatabase()
    const env = { DATABASE_URL: database.url }

    const seed = await cli(["upsert", "--file", SEED_FILE], env)
    expect(seed.stderr).toBe("")
    expect(seed.code).toBe(0)
    expect(seed.stdout).toContain("Event evt-boc-cut: inserted")
    expect(seed.stdout).not.toContain(database.url)

    const correction = await cli(["upsert", "--file", CORRECTION_FILE], env)
    expect(correction.code).toBe(0)
    expect(correction.stdout).toContain("moveLogRevisions: 1 appended")

    const pool = new Pool({ connectionString: database.url })
    try {
      const event = await new PostgresIntelligenceRepository(pool).getEvent("evt-boc-cut")
      expect(event?.moveLog?.version).toBe(2)
      expect(event?.probability).toBe(73.8)
      expect(event?.provenance).toBe("demo")
    } finally {
      await pool.end()
    }

    const show = await cli(["show", "--event", "evt-boc-cut"], env)
    expect(show.code).toBe(0)
    const shown = JSON.parse(show.stdout)
    expect(shown.moveLogHistory.map((revision: { version: number; explainedPct: number }) => [revision.version, revision.explainedPct])).toEqual([
      [1, 69],
      [2, 64],
    ])
    expect(shown.provenance).toBe("demo")
  })

  it("refuses to write from a production process or to an unidentified database", async () => {
    const database = await migratedDatabase()
    const production = await cli(["upsert", "--file", SEED_FILE], { DATABASE_URL: database.url, NODE_ENV: "production" })
    expect(production.code).toBe(1)
    expect(production.stderr).toContain('Refusing to run "upsert": NODE_ENV=production.')

    const unidentified = await emptyDatabase()
    const refused = await cli(["upsert", "--file", SEED_FILE], { DATABASE_URL: unidentified.url })
    expect(refused.code).toBe(1)
    expect(refused.stderr).toMatch(/has no OMEN identity/)

    const status = await cli(["status"], { DATABASE_URL: database.url })
    expect(status.stdout).toContain("rows: events=0")
  })

  it("reports an unreachable database without printing the connection string or password", async () => {
    const database = await migratedDatabase()
    const missing = database.url.replace("omen_test_", "omen_missing_")
    const result = await cli(["upsert", "--file", SEED_FILE], { DATABASE_URL: missing })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Could not connect to the database named by DATABASE_URL")
    expect(result.stderr).not.toContain(missing)
    expect(result.stderr).not.toContain(`:${new URL(missing).password}@`)
  })
})

describe("temporal storage and record availability", () => {
  it("establishes a coverage baseline without inventing pre-migration event revision history", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      const coverage = await readHistoryCoverage(client)
      expect(coverage.semanticEventFieldsFrom).toBe(coverage.recordAvailabilityRealignedAt)
      const { rows } = await client.query("SELECT count(*)::int AS count FROM event_revisions")
      expect(rows[0].count).toBe(0)
    })
  })

  it("realigns pre-existing history rows when migration 0002 runs on a populated database", async () => {
    const database = await emptyDatabase()
    const migrations = loadMigrations()
    let beforeCounts: {
      observations: number
      evidence: number
      moveLogRevisions: number
      latestProbability: string
    }
    await withClient(database.url, async (client) => {
      await identifyDatabase(client, "test", `vitest ${database.name}`)
      await migrate(client, migrations.slice(0, 1))
      await populateV1History(client)
      const { rows: revisionTable } = await client.query(
        "SELECT to_regclass('public.event_revisions') AS event_revisions",
      )
      expect(revisionTable[0].event_revisions).toBeNull()
      const counts = await client.query<{
        observations: number
        evidence: number
        move_log_revisions: number
        latest_probability: string
      }>(
        `SELECT
           (SELECT count(*)::int FROM probability_observations WHERE event_id = 'evt-boc-cut') AS observations,
           (SELECT count(*)::int FROM evidence WHERE event_id = 'evt-boc-cut') AS evidence,
           (SELECT count(*)::int FROM move_log_revisions r
              JOIN move_logs m ON m.id = r.move_log_id WHERE m.event_id = 'evt-boc-cut') AS move_log_revisions,
           (SELECT probability_pct::text FROM probability_observations
              WHERE event_id = 'evt-boc-cut'
              ORDER BY captured_at DESC LIMIT 1) AS latest_probability`,
      )
      beforeCounts = {
        observations: counts.rows[0].observations,
        evidence: counts.rows[0].evidence,
        moveLogRevisions: counts.rows[0].move_log_revisions,
        latestProbability: counts.rows[0].latest_probability,
      }
      expect(beforeCounts.observations).toBe(4)
    })
    await withClient(database.url, async (client) => {
      await migrate(client, migrations)
      const coverage = await readHistoryCoverage(client)
      const realignedAt = new Date(coverage.recordAvailabilityRealignedAt)
      expect(coverage.semanticEventFieldsFrom).toBe(coverage.recordAvailabilityRealignedAt)
      const { rows: revisionRows } = await client.query("SELECT count(*)::int AS count FROM event_revisions")
      expect(revisionRows[0].count).toBe(0)
      const { rows: checkpointRows } = await client.query("SELECT count(*)::int AS count FROM history_checkpoints")
      expect(checkpointRows[0].count).toBe(0)
      const afterCounts = await client.query<{
        observations: number
        evidence: number
        move_log_revisions: number
        latest_probability: string
      }>(
        `SELECT
           (SELECT count(*)::int FROM probability_observations WHERE event_id = 'evt-boc-cut') AS observations,
           (SELECT count(*)::int FROM evidence WHERE event_id = 'evt-boc-cut') AS evidence,
           (SELECT count(*)::int FROM move_log_revisions r
              JOIN move_logs m ON m.id = r.move_log_id WHERE m.event_id = 'evt-boc-cut') AS move_log_revisions,
           (SELECT probability_pct::text FROM probability_observations
              WHERE event_id = 'evt-boc-cut'
              ORDER BY captured_at DESC LIMIT 1) AS latest_probability`,
      )
      expect(afterCounts.rows[0].observations).toBe(beforeCounts.observations)
      expect(afterCounts.rows[0].evidence).toBe(beforeCounts.evidence)
      expect(afterCounts.rows[0].move_log_revisions).toBe(beforeCounts.moveLogRevisions)
      expect(afterCounts.rows[0].latest_probability).toBe(beforeCounts.latestProbability)
      const { rows } = await client.query<{ captured_at: Date; record_available_at: Date }>(
        `SELECT captured_at, record_available_at FROM probability_observations WHERE event_id = 'evt-boc-cut'
         UNION ALL
         SELECT captured_at, record_available_at FROM evidence WHERE event_id = 'evt-boc-cut'
         UNION ALL
         SELECT published_at AS captured_at, record_available_at
           FROM move_log_revisions r
           JOIN move_logs m ON m.id = r.move_log_id
          WHERE m.event_id = 'evt-boc-cut'`,
      )
      expect(rows.length).toBe(
        beforeCounts.observations + beforeCounts.evidence + beforeCounts.moveLogRevisions,
      )
      for (const row of rows) {
        expect(row.record_available_at.toISOString()).toBe(realignedAt.toISOString())
        expect(row.record_available_at.getTime()).toBeGreaterThan(row.captured_at.getTime())
      }
      await expect(
        client.query(`UPDATE probability_observations SET note = 'blocked' WHERE event_id = 'evt-boc-cut'`),
      ).rejects.toThrow(/append-only/)
      await expect(client.query(`UPDATE evidence SET summary = 'blocked' WHERE event_id = 'evt-boc-cut'`)).rejects.toThrow(
        /append-only/,
      )
      await expect(
        client.query(
          `UPDATE move_log_revisions SET what_changed = 'blocked'
             WHERE move_log_id = (SELECT id FROM move_logs WHERE event_id = 'evt-boc-cut' LIMIT 1)`,
        ),
      ).rejects.toThrow(/append-only/)
    })
  })

  it("does not backdate record_available_at when capture times are backdated", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
      const before = Date.now()
      await writeEventBundle(
        client,
        parseEventBundle({
          eventId: "evt-boc-cut",
          observations: [
            {
              sourceKind: "author",
              sourceName: "backdate probe",
              probabilityType: "forecaster_estimate",
              probabilityPct: 33,
              observedAt: "2020-01-01T00:00:00Z",
              capturedAt: "2020-01-01T00:01:00Z",
              provenance: "demo",
            },
          ],
          evidence: [
            {
              id: "ev-backdate-probe",
              sourceName: "Backdate evidence",
              sourcePublishedAt: "2020-01-01T00:00:00Z",
              firstObservedAt: "2020-01-01T00:00:30Z",
              capturedAt: "2020-01-01T00:01:00Z",
              summary: "Backdated evidence row.",
              stance: "contextual",
              reliability: 0.5,
              recordedBy: "test",
              provenance: "demo",
            },
          ],
          moveLogRevisions: [
            {
              moveLogId: "ml-backdate-probe",
              version: 1,
              publishedAt: "2020-01-01T00:02:00Z",
              author: "test",
              whatChanged: "Backdated move log.",
              likelyCause: "test",
              explainedPct: 50,
              unexplainedFactors: [],
              evidenceIds: ["ev-backdate-probe"],
              provenance: "demo",
            },
          ],
        }),
      )
      const after = Date.now()
      const { rows } = await client.query<{
        table_name: string
        captured_at: Date
        record_available_at: Date
      }>(
        `SELECT 'observation' AS table_name, captured_at, record_available_at
           FROM probability_observations
          WHERE source_name = 'backdate probe'
         UNION ALL
         SELECT 'evidence', captured_at, record_available_at
           FROM evidence
          WHERE id = 'ev-backdate-probe'
         UNION ALL
         SELECT 'move_log', published_at AS captured_at, record_available_at
           FROM move_log_revisions
          WHERE move_log_id = 'ml-backdate-probe'`,
      )
      expect(rows).toHaveLength(3)
      for (const row of rows) {
        expect(row.record_available_at.getTime()).toBeGreaterThanOrEqual(before - 2_000)
        expect(row.record_available_at.getTime()).toBeLessThanOrEqual(after + 2_000)
        expect(row.record_available_at.getTime()).toBeGreaterThan(row.captured_at.getTime())
      }
      expect(rows.find((row) => row.table_name === "observation")!.captured_at.toISOString()).toBe(
        "2020-01-01T00:01:00.000Z",
      )
    })
  })

  it("assigns one record_available_at instant to every row inserted in the same bundle transaction", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
      const { rows } = await client.query<{ record_available_at: Date }>(
        `SELECT record_available_at FROM probability_observations WHERE event_id = 'evt-boc-cut'
         UNION ALL
         SELECT record_available_at FROM evidence WHERE event_id = 'evt-boc-cut'
         UNION ALL
         SELECT record_available_at FROM move_log_revisions r
           JOIN move_logs m ON m.id = r.move_log_id
          WHERE m.event_id = 'evt-boc-cut'
         UNION ALL
         SELECT record_available_at FROM event_revisions WHERE event_id = 'evt-boc-cut'`,
      )
      const instants = new Set(rows.map((row) => row.record_available_at.toISOString()))
      expect(instants.size).toBe(1)
    })
  })

  it("rolls back the projection when a metadata correction omits the required note", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
    })
    const bundle = seedBundle()
    bundle.event = { ...bundle.event!, status: "resolved" }
    await expect(withClient(database.url, (client) => writeEventBundle(client, bundle))).rejects.toThrow(
      /Include event.correctionNote to publish revision 2/,
    )
    const history = await withClient(database.url, (client) => readEventRevisionHistory(client, "evt-boc-cut"))
    expect(history.map((revision) => revision.status)).toEqual(["active"])
  })

  it("allocates event revision versions serially under concurrent writes", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))

    const run = (status: "watch" | "resolved", note: string) => {
      const base = seedBundle()
      return withClient(database.url, (client) =>
        writeEventBundle(client, {
          ...base,
          event: { ...base.event!, status, correctionNote: note },
          observations: [],
          evidence: [],
          moveLogRevisions: [],
        }),
      )
    }

    const results = await Promise.allSettled([
      run("watch", "Concurrent correction A"),
      run("resolved", "Concurrent correction B"),
    ])
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
    expect(failures).toEqual([])

    const history = await withClient(database.url, (client) => readEventRevisionHistory(client, "evt-boc-cut"))
    expect(history.map((revision) => revision.version)).toEqual([1, 2, 3])
    expect(new Set(history.map((revision) => revision.status))).toEqual(new Set(["active", "watch", "resolved"]))
  })

  it("treats concurrent identical first creates as an unchanged replay once revision 1 exists", async () => {
    const database = await migratedDatabase()
    const bundle = seedBundle()
    bundle.eventId = "evt-concurrent-create"
    bundle.event = { ...bundle.event!, id: "evt-concurrent-create" }

    const results = await Promise.allSettled([
      withClient(database.url, (client) => writeEventBundle(client, bundle)),
      withClient(database.url, (client) => writeEventBundle(client, bundle)),
    ])
    expect(results.every((result) => result.status === "fulfilled")).toBe(true)

    const history = await withClient(database.url, (client) =>
      readEventRevisionHistory(client, "evt-concurrent-create"),
    )
    expect(history.map((revision) => revision.version)).toEqual([1])
    const { rows } = await withClient(database.url, (client) =>
      client.query("SELECT count(*)::int AS count FROM events WHERE id = 'evt-concurrent-create'"),
    )
    expect(rows[0].count).toBe(1)
  })
})

async function openClient(url: string, applicationName: string) {
  const client = new Client({ connectionString: url, application_name: applicationName })
  await client.connect()
  return client
}

async function closeClient(client: Client) {
  await client.query("ROLLBACK").catch(() => undefined)
  await client.end()
}

async function waitUntil(label: string, predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`timed out waiting for ${label}`)
}

const HISTORY_COUNTS = `
  SELECT
    (SELECT count(*)::int FROM probability_observations WHERE event_id = 'evt-boc-cut') AS observations,
    (SELECT count(*)::int FROM evidence WHERE event_id = 'evt-boc-cut') AS evidence,
    (SELECT count(*)::int FROM move_log_revisions r
       JOIN move_logs m ON m.id = r.move_log_id
      WHERE m.event_id = 'evt-boc-cut') AS move_log_revisions,
    (SELECT count(*)::int FROM event_revisions WHERE event_id = 'evt-boc-cut') AS event_revisions
`

async function historyCounts(client: Client) {
  const { rows } = await client.query<{
    observations: number
    evidence: number
    move_log_revisions: number
    event_revisions: number
  }>(HISTORY_COUNTS)
  return rows[0]
}

function spanBundle() {
  const base = seedBundle()
  return {
    eventId: base.eventId,
    event: { ...base.event!, status: "watch" as const, correctionNote: "Span correction" },
    observations: [
      {
        sourceKind: "author" as const,
        sourceName: "span probe",
        probabilityType: "forecaster_estimate" as const,
        probabilityPct: 44,
        observedAt: "2026-09-06T00:00:00Z",
        capturedAt: "2026-09-06T00:01:00Z",
        provenance: "demo" as const,
      },
    ],
    evidence: [
      {
        id: "ev-span-probe",
        sourceName: "Span source",
        sourcePublishedAt: "2026-09-06T00:00:00Z",
        firstObservedAt: "2026-09-06T00:00:30Z",
        capturedAt: "2026-09-06T00:01:00Z",
        summary: "Evidence written in the same bundle.",
        stance: "contextual" as const,
        reliability: 0.4,
        recordedBy: "test",
        provenance: "demo" as const,
      },
    ],
    moveLogRevisions: [
      {
        moveLogId: "ml-span-probe",
        version: 1,
        publishedAt: "2026-09-06T00:02:00Z",
        author: "test",
        whatChanged: "Span move.",
        likelyCause: "test",
        explainedPct: 40,
        unexplainedFactors: [],
        evidenceIds: ["ev-span-probe"],
        provenance: "demo" as const,
      },
    ],
  }
}

describe("temporal visibility checkpoints", () => {
  it("reproduces that a delayed commit is invisible after record_available_at", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const writer = await openClient(database.url, "omen-delayed-writer")
    try {
      await writer.query("BEGIN")
      const clocks = await writer.query<{ started: Date; sampled: Date }>(
        "SELECT transaction_timestamp() AS started, clock_timestamp() AS sampled",
      )
      await writer.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'delay probe', 'forecaster_estimate', 41,
           '2026-09-05T00:00:00Z', '2026-09-05T00:01:00Z', 'demo'
         )`,
      )
      const stored = await writer.query<{ record_available_at: Date }>(
        "SELECT record_available_at FROM probability_observations WHERE source_name = 'delay probe'",
      )
      expect(stored.rows[0].record_available_at.toISOString()).toBe(clocks.rows[0].started.toISOString())

      const during = await withClient(database.url, async (reader) => {
        const { rows } = await reader.query<{ observed_at: Date; visible: boolean }>(
          `SELECT clock_timestamp() AS observed_at,
                  EXISTS (SELECT 1 FROM probability_observations WHERE source_name = 'delay probe') AS visible`,
        )
        return rows[0]
      })
      expect(during.visible).toBe(false)
      expect(stored.rows[0].record_available_at.getTime()).toBeLessThanOrEqual(during.observed_at.getTime())
      expect(clocks.rows[0].sampled.getTime()).toBeLessThanOrEqual(during.observed_at.getTime())

      const duringCheckpoint = await withClient(database.url, (reader) =>
        publishHistoryCheckpoint(reader, "evt-boc-cut"),
      )
      expect(duringCheckpoint.created).toBe(false)
      const hidden = await withClient(database.url, (reader) =>
        reader.query(
          `SELECT 1 FROM history_checkpoint_members
            WHERE checkpoint_id = $1 AND row_key IN (
              SELECT id::text FROM probability_observations WHERE source_name = 'delay probe'
            )`,
          [duringCheckpoint.id],
        ),
      )
      expect(hidden.rowCount).toBe(0)

      await writer.query("COMMIT")
      const after = await withClient(database.url, async (reader) => {
        const visible = await reader.query(
          "SELECT 1 FROM probability_observations WHERE source_name = 'delay probe'",
        )
        const checkpoint = await publishHistoryCheckpoint(reader, "evt-boc-cut")
        return { visible: visible.rowCount, checkpoint }
      })
      expect(after.visible).toBe(1)
      expect(after.checkpoint.created).toBe(true)
      expect(await withClient(database.url, (reader) => verifyHistoryCheckpoint(reader, after.checkpoint.id))).toBe("ok")
      expect(await withClient(database.url, (reader) => verifyHistoryCheckpoint(reader, duringCheckpoint.id))).toBe("ok")
    } finally {
      await closeClient(writer)
    }
  })

  it("reproduces that a lock-waiting writer is not visible at its transaction start", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const holder = await openClient(database.url, "omen-lock-holder")
    const waiter = await openClient(database.url, "omen-lock-waiter")
    try {
      await holder.query("BEGIN")
      await holder.query("SELECT id FROM events WHERE id = 'evt-boc-cut' FOR UPDATE")
      await waiter.query("BEGIN")
      const started = await waiter.query<{ started: Date }>("SELECT transaction_timestamp() AS started")
      const waiterPid = await waiter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      const blocked = waiter.query("SELECT id FROM events WHERE id = 'evt-boc-cut' FOR UPDATE")
      await waitUntil("lock waiter", async () => {
        const { rowCount } = await withClient(database.url, (client) =>
          client.query(
            "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type IS NOT NULL",
            [waiterPid.rows[0].pid],
          ),
        )
        return rowCount === 1
      })
      await holder.query("COMMIT")
      await blocked
      await waiter.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'lock probe', 'forecaster_estimate', 42,
           '2026-09-05T00:00:00Z', '2026-09-05T00:02:00Z', 'demo'
         )`,
      )
      const stored = await waiter.query<{ record_available_at: Date }>(
        "SELECT record_available_at FROM probability_observations WHERE source_name = 'lock probe'",
      )
      expect(stored.rows[0].record_available_at.toISOString()).toBe(started.rows[0].started.toISOString())
      const during = await withClient(database.url, async (reader) => {
        const { rows } = await reader.query<{ observed_at: Date; visible: boolean }>(
          `SELECT clock_timestamp() AS observed_at,
                  EXISTS (SELECT 1 FROM probability_observations WHERE source_name = 'lock probe') AS visible`,
        )
        return rows[0]
      })
      expect(during.visible).toBe(false)
      expect(stored.rows[0].record_available_at.getTime()).toBeLessThanOrEqual(during.observed_at.getTime())
      await waiter.query("COMMIT")
      const visible = await withClient(database.url, (reader) =>
        reader.query("SELECT 1 FROM probability_observations WHERE source_name = 'lock probe'"),
      )
      expect(visible.rowCount).toBe(1)
    } finally {
      await closeClient(holder)
      await closeClient(waiter)
    }
  })

  it("keeps an earlier transaction timestamp from ranking as earlier visibility", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const slow = await openClient(database.url, "omen-slow-writer")
    try {
      await slow.query("BEGIN")
      const started = await slow.query<{ started: Date }>("SELECT transaction_timestamp() AS started")
      const fastAvailable = await withClient(database.url, async (fast) => {
        await fast.query("BEGIN")
        await fast.query(
          `INSERT INTO probability_observations (
             event_id, source_kind, source_name, probability_type, probability_pct,
             observed_at, captured_at, provenance
           ) VALUES (
             'evt-boc-cut', 'author', 'fast probe', 'forecaster_estimate', 43,
             '2026-09-07T00:00:00Z', '2026-09-07T00:01:00Z', 'demo'
           )`,
        )
        const { rows } = await fast.query<{ record_available_at: Date }>(
          "SELECT record_available_at FROM probability_observations WHERE source_name = 'fast probe'",
        )
        await fast.query("COMMIT")
        return rows[0].record_available_at
      })
      expect(started.rows[0].started.getTime()).toBeLessThanOrEqual(fastAvailable.getTime())

      const middle = await withClient(database.url, (reader) => publishHistoryCheckpoint(reader, "evt-boc-cut"))
      expect(middle.created).toBe(true)
      const middleKeys = await withClient(database.url, (reader) =>
        reader.query<{ source_name: string | null }>(
          `SELECT o.source_name
             FROM history_checkpoint_members m
             LEFT JOIN probability_observations o
               ON m.relation_name = 'probability_observations' AND m.row_key = o.id::text
            WHERE m.checkpoint_id = $1`,
          [middle.id],
        ),
      )
      expect(middleKeys.rows.map((row) => row.source_name)).toContain("fast probe")
      expect(middleKeys.rows.map((row) => row.source_name)).not.toContain("slow probe")

      await slow.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'slow probe', 'forecaster_estimate', 39,
           '2026-09-08T00:00:00Z', '2026-09-08T00:01:00Z', 'demo'
         )`,
      )
      const slowAvailable = await slow.query<{ record_available_at: Date }>(
        "SELECT record_available_at FROM probability_observations WHERE source_name = 'slow probe'",
      )
      const during = await withClient(database.url, async (reader) => {
        const { rows } = await reader.query<{ visible: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM probability_observations WHERE source_name = 'slow probe') AS visible`,
        )
        return rows[0]
      })
      expect(during.visible).toBe(false)
      expect(slowAvailable.rows[0].record_available_at.getTime()).toBeLessThanOrEqual(fastAvailable.getTime())
      await slow.query("COMMIT")

      const after = await withClient(database.url, (reader) => publishHistoryCheckpoint(reader, "evt-boc-cut"))
      expect(after.created).toBe(true)
      expect(await withClient(database.url, (reader) => verifyHistoryCheckpoint(reader, middle.id))).toBe("ok")
      expect(await withClient(database.url, (reader) => verifyHistoryCheckpoint(reader, after.id))).toBe("ok")
      const afterNames = await withClient(database.url, (reader) =>
        reader.query<{ source_name: string }>(
          `SELECT o.source_name
             FROM history_checkpoint_members m
             JOIN probability_observations o
               ON m.relation_name = 'probability_observations' AND m.row_key = o.id::text
            WHERE m.checkpoint_id = $1 AND o.source_name IN ('fast probe', 'slow probe')
            ORDER BY o.source_name`,
          [after.id],
        ),
      )
      expect(afterNames.rows.map((row) => row.source_name)).toEqual(["fast probe", "slow probe"])
    } finally {
      await closeClient(slow)
    }
  })

  it("does not treat backdated source or capture times as checkpoint membership", async () => {
    const database = await migratedDatabase()
    const seeded = await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const written = await withClient(database.url, (client) =>
      writeEventBundle(
        client,
        parseEventBundle({
          eventId: "evt-boc-cut",
          observations: [
            {
              sourceKind: "author",
              sourceName: "backdate probe",
              probabilityType: "forecaster_estimate",
              probabilityPct: 33,
              observedAt: "2020-01-01T00:00:00Z",
              capturedAt: "2020-01-01T00:01:00Z",
              provenance: "demo",
            },
          ],
          evidence: [
            {
              id: "ev-backdate-probe",
              sourceName: "Backdate evidence",
              sourcePublishedAt: "2020-01-01T00:00:00Z",
              firstObservedAt: "2020-01-01T00:00:30Z",
              capturedAt: "2020-01-01T00:01:00Z",
              summary: "Backdated evidence row.",
              stance: "contextual",
              reliability: 0.5,
              recordedBy: "test",
              provenance: "demo",
            },
          ],
          moveLogRevisions: [
            {
              moveLogId: "ml-backdate-probe",
              version: 1,
              publishedAt: "2020-01-01T00:02:00Z",
              author: "test",
              whatChanged: "Backdated move log.",
              likelyCause: "test",
              explainedPct: 50,
              unexplainedFactors: [],
              evidenceIds: ["ev-backdate-probe"],
              provenance: "demo",
            },
          ],
        }),
      ),
    )
    expect(written.checkpoint.created).toBe(true)
    expect(written.checkpoint.sequence).toBe(seeded.checkpoint.sequence + 1)
    await withClient(database.url, async (client) => {
      const before = await client.query(
        `SELECT 1 FROM history_checkpoint_members
          WHERE checkpoint_id = $1
            AND row_key IN ('ev-backdate-probe')`,
        [seeded.checkpoint.id],
      )
      expect(before.rowCount).toBe(0)
      const after = await client.query<{
        source_published_at: Date | null
        captured_at: Date
        record_available_at: Date
      }>(
        `SELECT e.source_published_at, e.captured_at, e.record_available_at
           FROM evidence e
           JOIN history_checkpoint_members m
             ON m.relation_name = 'evidence' AND m.row_key = e.id
          WHERE m.checkpoint_id = $1 AND e.id = 'ev-backdate-probe'`,
        [written.checkpoint.id],
      )
      expect(after.rows[0].source_published_at?.toISOString()).toBe("2020-01-01T00:00:00.000Z")
      expect(after.rows[0].captured_at.toISOString()).toBe("2020-01-01T00:01:00.000Z")
      expect(after.rows[0].record_available_at.getTime()).toBeGreaterThan(after.rows[0].captured_at.getTime())
      expect(await verifyHistoryCheckpoint(client, seeded.checkpoint.id)).toBe("ok")
      expect(await verifyHistoryCheckpoint(client, written.checkpoint.id)).toBe("ok")
    })
  })

  it("publishes one snapshot for a bundle that spans every history table", async () => {
    const database = await migratedDatabase()
    const seeded = await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const writer = await openClient(database.url, "omen-span-writer")
    try {
      await writer.query("BEGIN")
      await writer.query("SET LOCAL omen.allow_event_projection = true")
      await writer.query(
        `INSERT INTO event_revisions (
           event_id, version, title, question, status, deadline, resolution_criteria, category,
           significance, region, summary, tags, related_event_ids, provenance, correction_note
         )
         SELECT event_id, 2, title, question, 'resolved', deadline, resolution_criteria, category,
                significance, region, summary, tags, related_event_ids, provenance, 'Open span correction'
           FROM event_revisions WHERE event_id = 'evt-boc-cut' AND version = 1`,
      )
      await writer.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'open span probe', 'forecaster_estimate', 45,
           '2026-09-06T00:00:00Z', '2026-09-06T00:01:00Z', 'demo'
         )`,
      )
      await writer.query(
        `INSERT INTO evidence (
           id, event_id, source_name, source_published_at, first_observed_at, captured_at,
           summary, stance, reliability, recorded_by, provenance
         ) VALUES (
           'ev-open-span', 'evt-boc-cut', 'Open span', '2026-09-06T00:00:00Z', '2026-09-06T00:00:30Z',
           '2026-09-06T00:01:00Z', 'Held open with the other history rows.', 'contextual', 0.4, 'test', 'demo'
         )`,
      )
      await writer.query(
        `INSERT INTO move_logs (id, event_id) VALUES ('ml-open-span', 'evt-boc-cut')`,
      )
      await writer.query(
        `INSERT INTO move_log_revisions (
           move_log_id, version, published_at, author, what_changed, likely_cause,
           explained_pct, unexplained_factors, evidence_ids, provenance
         ) VALUES (
           'ml-open-span', 1, '2026-09-06T00:02:00Z', 'test', 'Open span move.', 'test',
           40, ARRAY[]::text[], ARRAY['ev-open-span'], 'demo'
         )`,
      )
      const during = await withClient(database.url, async (reader) => {
        const checkpoint = await publishHistoryCheckpoint(reader, "evt-boc-cut")
        const counts = await historyCounts(reader)
        return { checkpoint, counts }
      })
      expect(during.checkpoint).toMatchObject({ id: seeded.checkpoint.id, created: false })
      expect(during.counts).toEqual({ observations: 4, evidence: 3, move_log_revisions: 1, event_revisions: 1 })
      await writer.query("ROLLBACK")
    } finally {
      await closeClient(writer)
    }

    const written = await withClient(database.url, (client) => writeEventBundle(client, spanBundle()))
    expect(written.checkpoint.created).toBe(true)
    await withClient(database.url, async (client) => {
      const counts = await historyCounts(client)
      expect(counts).toEqual({ observations: 5, evidence: 4, move_log_revisions: 2, event_revisions: 2 })
      const members = await client.query<{ relation_name: string; members: number }>(
        `SELECT relation_name, count(*)::int AS members
           FROM history_checkpoint_members
          WHERE checkpoint_id = $1
          GROUP BY relation_name
          ORDER BY relation_name`,
        [written.checkpoint.id],
      )
      expect(members.rows).toEqual([
        { relation_name: "event_revisions", members: 2 },
        { relation_name: "evidence", members: 4 },
        { relation_name: "move_log_revisions", members: 2 },
        { relation_name: "probability_observations", members: 5 },
      ])
      const contract = await client.query<{ visibility_contract: string }>(
        "SELECT visibility_contract FROM history_checkpoints WHERE id = $1",
        [written.checkpoint.id],
      )
      expect(contract.rows[0].visibility_contract).toBe("observed_snapshot_members")
      expect(await verifyHistoryCheckpoint(client, written.checkpoint.id)).toBe("ok")
    })
  })

  it("labels a legacy event without a semantic revision as unavailable", async () => {
    const database = await emptyDatabase()
    const migrations = loadMigrations()
    await withClient(database.url, async (client) => {
      await identifyDatabase(client, "test", `vitest ${database.name}`)
      await migrate(client, migrations.slice(0, 1))
      await populateV1History(client)
    })
    await withClient(database.url, async (client) => {
      await migrate(client, migrations)
      const published = await publishHistoryCheckpoint(client, "evt-boc-cut")
      expect(published).toMatchObject({ sequence: 1, created: true, semanticHistory: "unavailable" })
      expect(await verifyHistoryCheckpoint(client, published.id)).toBe("ok")
      const label = await client.query(
        `SELECT semantic_history, pre_baseline_event_revisions, visibility_contract
           FROM history_checkpoints WHERE id = $1`,
        [published.id],
      )
      expect(label.rows[0]).toEqual({
        semantic_history: "unavailable",
        pre_baseline_event_revisions: "not_recorded",
        visibility_contract: "observed_snapshot_members",
      })
      const relations = await client.query<{ relation_name: string; count: number }>(
        `SELECT relation_name, count(*)::int AS count
           FROM history_checkpoint_members
          WHERE checkpoint_id = $1
          GROUP BY relation_name
          ORDER BY relation_name`,
        [published.id],
      )
      expect(relations.rows).toEqual([
        { relation_name: "evidence", count: 1 },
        { relation_name: "move_log_revisions", count: 1 },
        { relation_name: "probability_observations", count: 4 },
      ])
      const { rows: events } = await client.query<{ question: string }>(
        "SELECT question FROM events WHERE id = 'evt-boc-cut'",
      )
      const invented = await client.query(
        "SELECT count(*)::int AS count FROM event_revisions WHERE question = $1",
        [events[0].question],
      )
      expect(invented.rows[0].count).toBe(0)
      const again = await publishHistoryCheckpoint(client, "evt-boc-cut")
      expect(again).toMatchObject({ id: published.id, sequence: 1, created: false, semanticHistory: "unavailable" })
    })
  })

  it("reads history tables from one snapshot and keeps a repeatable read consistent", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const repeatable = await openClient(database.url, "omen-repeatable-reader")
    const torn = await openClient(database.url, "omen-torn-reader")
    try {
      await repeatable.query("BEGIN ISOLATION LEVEL REPEATABLE READ")
      const firstCounts = await historyCounts(repeatable)
      const firstDigest = await repeatable.query<{ digest: string }>(
        `SELECT md5(coalesce(string_agg(
                  omen_digest_piece(relation_name, row_key, line),
                  E'\\n' ORDER BY relation_name, row_key), '')) AS digest
           FROM omen_visible_history_members('evt-boc-cut')`,
      )
      await torn.query("BEGIN")
      const tornObservations = await torn.query<{ observations: number }>(
        "SELECT count(*)::int AS observations FROM probability_observations WHERE event_id = 'evt-boc-cut'",
      )

      const written = await withClient(database.url, (client) => writeEventBundle(client, spanBundle()))
      const tornEvidence = await torn.query<{ evidence: number }>(
        "SELECT count(*)::int AS evidence FROM evidence WHERE event_id = 'evt-boc-cut'",
      )
      const tornObservationsAfter = await torn.query<{ observations: number }>(
        "SELECT count(*)::int AS observations FROM probability_observations WHERE event_id = 'evt-boc-cut'",
      )
      expect(tornObservations.rows[0].observations).toBe(4)
      expect(tornEvidence.rows[0].evidence).toBe(4)
      expect(tornObservationsAfter.rows[0].observations).toBe(5)

      const secondCounts = await historyCounts(repeatable)
      const secondDigest = await repeatable.query<{ digest: string }>(
        `SELECT md5(coalesce(string_agg(
                  omen_digest_piece(relation_name, row_key, line),
                  E'\\n' ORDER BY relation_name, row_key), '')) AS digest
           FROM omen_visible_history_members('evt-boc-cut')`,
      )
      expect(secondCounts).toEqual(firstCounts)
      expect(secondDigest.rows[0].digest).toBe(firstDigest.rows[0].digest)
      expect(firstCounts).toEqual({ observations: 4, evidence: 3, move_log_revisions: 1, event_revisions: 1 })

      const checkpointDigest = await withClient(database.url, (client) =>
        client.query<{ content_md5: string; sequence: number }>(
          `SELECT sequence, content_md5 FROM history_checkpoints
            WHERE event_id = 'evt-boc-cut' ORDER BY sequence`,
        ),
      )
      expect(checkpointDigest.rows.map((row) => row.sequence)).toEqual([1, 2])
      expect(firstDigest.rows[0].digest).toBe(checkpointDigest.rows[0].content_md5)
      expect(firstDigest.rows[0].digest).not.toBe(written.checkpoint.contentMd5)
      expect(await withClient(database.url, (client) => verifyHistoryCheckpoint(client, written.checkpoint.id))).toBe(
        "ok",
      )
    } finally {
      await closeClient(repeatable)
      await closeClient(torn)
    }
  })

  it("serialises a lock-waiting correction into verified checkpoint prefixes", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const holder = await openClient(database.url, "omen-correction-holder")
    const waiter = await openClient(database.url, "omen-correction-waiter")
    const base = seedBundle()
    let pending: Promise<unknown> | undefined
    try {
      await holder.query("BEGIN")
      await holder.query("SELECT id FROM events WHERE id = 'evt-boc-cut' FOR UPDATE")
      await holder.query("SET LOCAL omen.allow_event_projection = true")
      await holder.query(
        `INSERT INTO event_revisions (
           event_id, version, title, question, status, deadline, resolution_criteria, category,
           significance, region, summary, tags, related_event_ids, provenance, correction_note
         )
         SELECT event_id, 2, title, question, 'watch', deadline, resolution_criteria, category,
                significance, region, summary, tags, related_event_ids, provenance, 'Locked correction A'
           FROM event_revisions WHERE event_id = 'evt-boc-cut' AND version = 1`,
      )
      await holder.query("UPDATE events SET status = 'watch' WHERE id = 'evt-boc-cut'")
      const hidden = await holder.query<{ record_available_at: Date }>(
        "SELECT record_available_at FROM event_revisions WHERE event_id = 'evt-boc-cut' AND version = 2",
      )
      const waiterPid = await waiter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      pending = writeEventBundle(waiter, {
        ...base,
        event: { ...base.event!, status: "resolved", correctionNote: "Queued correction B" },
        observations: [],
        evidence: [],
        moveLogRevisions: [],
      })
      const raced = await Promise.race([
        pending.then(() => "finished" as const),
        waitUntil("correction waiter", async () => {
          const { rowCount } = await withClient(database.url, (client) =>
            client.query(
              "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type IS NOT NULL",
              [waiterPid.rows[0].pid],
            ),
          )
          return rowCount === 1
        }).then(() => "blocked" as const),
      ])
      expect(raced).toBe("blocked")
      const during = await withClient(database.url, async (reader) => {
        const { rows } = await reader.query<{ observed_at: Date; visible: boolean }>(
          `SELECT clock_timestamp() AS observed_at,
                  EXISTS (
                    SELECT 1 FROM event_revisions WHERE event_id = 'evt-boc-cut' AND version = 2
                  ) AS visible`,
        )
        return rows[0]
      })
      expect(during.visible).toBe(false)
      expect(hidden.rows[0].record_available_at.getTime()).toBeLessThanOrEqual(during.observed_at.getTime())
      await holder.query("COMMIT")
      await pending
    } finally {
      await closeClient(holder)
      if (pending) await pending.catch(() => undefined)
      await closeClient(waiter)
    }

    await withClient(database.url, async (client) => {
      const history = await readEventRevisionHistory(client, "evt-boc-cut")
      expect(history.map((revision) => revision.version)).toEqual([1, 2, 3])
      expect(history.map((revision) => revision.correctionNote)).toEqual([
        null,
        "Locked correction A",
        "Queued correction B",
      ])
      const checkpoints = await client.query<{ sequence: number; versions: number[] }>(
        `SELECT c.sequence,
                array_agg(er.version ORDER BY er.version) AS versions
           FROM history_checkpoints c
           JOIN history_checkpoint_members m
             ON m.checkpoint_id = c.id AND m.relation_name = 'event_revisions'
           JOIN event_revisions er ON er.id::text = m.row_key
          WHERE c.event_id = 'evt-boc-cut'
          GROUP BY c.sequence
          ORDER BY c.sequence`,
      )
      expect(checkpoints.rows).toEqual([
        { sequence: 1, versions: [1] },
        { sequence: 2, versions: [1, 2, 3] },
      ])
      const ids = await client.query<{ id: string }>(
        "SELECT id FROM history_checkpoints WHERE event_id = 'evt-boc-cut' ORDER BY sequence",
      )
      for (const row of ids.rows) {
        expect(await verifyHistoryCheckpoint(client, row.id)).toBe("ok")
      }
    })
  })

  it("does not keep a supplied snapshot or digest, and refuses an uncommitted publish", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    await withClient(database.url, async (client) => {
      await client.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'forged snapshot probe', 'forecaster_estimate', 48,
           '2026-09-11T00:00:00Z', '2026-09-11T00:01:00Z', 'demo'
         )`,
      )
      await client.query("BEGIN")
      const saved = await client.query<{ snap: string }>("SELECT pg_current_snapshot()::text AS snap")
      await client.query("SELECT pg_current_xact_id()")
      await client.query("COMMIT")
      await client.query(
        `INSERT INTO history_checkpoints (
           event_id, sequence, observed_snapshot, content_md5, member_count, semantic_history,
           semantic_event_fields_from, record_availability_realigned_at,
           pre_baseline_event_revisions, visibility_contract
         )
         SELECT 'evt-boc-cut', 2, $1::pg_snapshot, repeat('ab', 16), 1, 'recorded',
                semantic_event_fields_from, record_availability_realigned_at,
                'not_recorded', 'observed_snapshot_members'
           FROM omen_history_coverage`,
        [saved.rows[0].snap],
      )
      const stored = await client.query<{ id: string; observed_snapshot: string; content_md5: string; sequence: number }>(
        `SELECT id, observed_snapshot::text AS observed_snapshot, content_md5, sequence
           FROM history_checkpoints
          WHERE event_id = 'evt-boc-cut'
          ORDER BY sequence DESC
          LIMIT 1`,
      )
      expect(stored.rows[0].sequence).toBe(2)
      expect(stored.rows[0].observed_snapshot).not.toBe(saved.rows[0].snap)
      expect(stored.rows[0].content_md5).not.toBe("ab".repeat(16))
      expect(await verifyHistoryCheckpoint(client, stored.rows[0].id)).toBe("ok")
      const member = await client.query(
        `SELECT 1
           FROM history_checkpoint_members m
           JOIN probability_observations o ON o.id::text = m.row_key
          WHERE m.checkpoint_id = $1 AND o.source_name = 'forged snapshot probe'`,
        [stored.rows[0].id],
      )
      expect(member.rowCount).toBe(1)
    })

    const writer = await openClient(database.url, "omen-uncommitted-publisher")
    try {
      await writer.query("BEGIN")
      await writer.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'uncommitted probe', 'forecaster_estimate', 46,
           '2026-09-09T00:00:00Z', '2026-09-09T00:01:00Z', 'demo'
         )`,
      )
      await expect(publishHistoryCheckpoint(writer, "evt-boc-cut")).rejects.toThrow(/uncommitted history/)
      await writer.query("ROLLBACK")
    } finally {
      await closeClient(writer)
    }
  })

  it("does not publish in-progress history after snapshot membership flips", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    const writer = await openClient(database.url, "omen-flip-writer")
    const other = await openClient(database.url, "omen-flip-other")
    try {
      await writer.query("BEGIN")
      await writer.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'flip probe', 'forecaster_estimate', 41,
           '2026-09-12T00:00:00Z', '2026-09-12T00:01:00Z', 'demo'
         )`,
      )
      await other.query("SELECT txid_current()")
      const flags = await writer.query<{ in_snap: boolean; status: string; uncommitted: boolean }>(
        `SELECT pg_visible_in_snapshot(xmin::text::xid8, pg_current_snapshot()) AS in_snap,
                pg_xact_status(xmin::text::xid8) AS status,
                omen_event_has_uncommitted_history('evt-boc-cut') AS uncommitted
           FROM probability_observations WHERE source_name = 'flip probe'`,
      )
      expect(flags.rows[0]).toEqual({ in_snap: true, status: "in progress", uncommitted: true })
      const reader = await withClient(database.url, (client) =>
        client.query<{ visible: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM probability_observations WHERE source_name = 'flip probe') AS visible`,
        ),
      )
      expect(reader.rows[0].visible).toBe(false)
      await expect(publishHistoryCheckpoint(writer, "evt-boc-cut")).rejects.toThrow(/uncommitted history/)

      await writer.query("ROLLBACK")
      await writer.query("BEGIN")
      await writer.query("SAVEPOINT sub_insert")
      await writer.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'sub flip probe', 'forecaster_estimate', 42,
           '2026-09-13T00:00:00Z', '2026-09-13T00:01:00Z', 'demo'
         )`,
      )
      await writer.query("RELEASE SAVEPOINT sub_insert")
      await other.query("SELECT txid_current()")
      const sub = await writer.query<{ in_snap: boolean; status: string; top_matches: boolean }>(
        `SELECT pg_visible_in_snapshot(xmin::text::xid8, pg_current_snapshot()) AS in_snap,
                pg_xact_status(xmin::text::xid8) AS status,
                xmin::text::xid8 = pg_current_xact_id() AS top_matches
           FROM probability_observations WHERE source_name = 'sub flip probe'`,
      )
      expect(sub.rows[0].in_snap).toBe(true)
      expect(sub.rows[0].status).toBe("in progress")
      expect(sub.rows[0].top_matches).toBe(false)
      await expect(publishHistoryCheckpoint(writer, "evt-boc-cut")).rejects.toThrow(/uncommitted history/)
      await writer.query("ROLLBACK")
    } finally {
      await closeClient(writer)
      await closeClient(other)
    }
  })

  it("publishes without waiting on an open event revision", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    await withClient(database.url, (client) =>
      client.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'uncheckpointed probe', 'forecaster_estimate', 47,
           '2026-09-14T00:00:00Z', '2026-09-14T00:01:00Z', 'demo'
         )`,
      ),
    )
    const holder = await openClient(database.url, "omen-revision-holder")
    const publisher = await openClient(database.url, "omen-revision-publisher")
    try {
      await holder.query("BEGIN")
      await holder.query(
        `INSERT INTO event_revisions (
           event_id, version, title, question, status, deadline, resolution_criteria,
           category, significance, region, summary, tags, related_event_ids, provenance, correction_note
         )
         SELECT id, 2, title, question, status, deadline, resolution_criteria,
                category, significance, region, summary, tags, related_event_ids, provenance, 'held open'
           FROM events WHERE id = 'evt-boc-cut'`,
      )
      await publisher.query("BEGIN")
      await publisher.query("SET LOCAL statement_timeout = '2s'")
      const published = await publishHistoryCheckpoint(publisher, "evt-boc-cut")
      expect(published.created).toBe(true)
      await publisher.query("COMMIT")
      const during = await withClient(database.url, (client) =>
        client.query<{ versions: number[] | null; source_name: string | null }>(
          `SELECT (SELECT array_agg(er.version ORDER BY er.version)
                     FROM history_checkpoint_members m
                     JOIN event_revisions er ON er.id::text = m.row_key
                    WHERE m.checkpoint_id = $1 AND m.relation_name = 'event_revisions') AS versions,
                  (SELECT o.source_name
                     FROM history_checkpoint_members m
                     JOIN probability_observations o ON o.id::text = m.row_key
                    WHERE m.checkpoint_id = $1 AND o.source_name = 'uncheckpointed probe') AS source_name`,
          [published.id],
        ),
      )
      expect(during.rows[0].versions).toEqual([1])
      expect(during.rows[0].source_name).toBe("uncheckpointed probe")
      expect(await withClient(database.url, (client) => verifyHistoryCheckpoint(client, published.id))).toBe("ok")

      await holder.query("COMMIT")
      const after = await withClient(database.url, (client) => publishHistoryCheckpoint(client, "evt-boc-cut"))
      expect(after.created).toBe(true)
      const versions = await withClient(database.url, (client) =>
        client.query<{ version: number }>(
          `SELECT er.version
             FROM history_checkpoint_members m
             JOIN event_revisions er ON er.id::text = m.row_key
            WHERE m.checkpoint_id = $1 AND m.relation_name = 'event_revisions'
            ORDER BY er.version`,
          [after.id],
        ),
      )
      expect(versions.rows.map((row) => row.version)).toEqual([1, 2])
      expect(await withClient(database.url, (client) => verifyHistoryCheckpoint(client, after.id))).toBe("ok")
    } finally {
      await closeClient(holder)
      await closeClient(publisher)
    }
  })

  it("rejects a checkpoint member from another event", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    await withClient(database.url, (client) => writeEventBundle(client, sourcedBundle()))
    await withClient(database.url, (client) =>
      client.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct,
           observed_at, captured_at, provenance
         ) VALUES (
           'evt-boc-cut', 'author', 'member guard probe', 'forecaster_estimate', 49,
           '2026-09-15T00:00:00Z', '2026-09-15T00:01:00Z', 'demo'
         )`,
      ),
    )
    const attacker = await openClient(database.url, "omen-cross-event-member")
    try {
      await attacker.query("BEGIN")
      const published = await publishHistoryCheckpoint(attacker, "evt-boc-cut")
      expect(published.created).toBe(true)
      const foreign = await attacker.query<{ id: string; xmin: string }>(
        `SELECT id::text AS id, xmin::text AS xmin
           FROM probability_observations WHERE event_id = 'evt-sourced-sample' LIMIT 1`,
      )
      await expect(
        attacker.query(
          `INSERT INTO history_checkpoint_members (checkpoint_id, relation_name, row_key, inserting_xid)
           VALUES ($1, 'probability_observations', $2, $3::xid8)`,
          [published.id, foreign.rows[0].id, foreign.rows[0].xmin],
        ),
      ).rejects.toThrow(/belongs to event/)
      await attacker.query("ROLLBACK")
    } finally {
      await closeClient(attacker)
    }
  })
})

describe("explicit database failures", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    __resetRepositoryForTests()
  })

  it("rejects reads against a database without the OMEN schema", async () => {
    const database = await emptyDatabase()
    const pool = new Pool({ connectionString: database.url })
    try {
      await expect(new PostgresIntelligenceRepository(pool).listEvents()).rejects.toThrow(
        "PostgreSQL storage has no OMEN schema. Run `npm run db:migrate`.",
      )
    } finally {
      await pool.end()
    }
  })

  it("rejects reads when the schema version does not match this build", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) =>
      client.query("INSERT INTO omen_schema_migrations (version, name, checksum) VALUES (99, 'future', 'x')"),
    )
    const pool = new Pool({ connectionString: database.url })
    try {
      await expect(new PostgresIntelligenceRepository(pool).getEvent("evt-boc-cut")).rejects.toThrow(
        `PostgreSQL storage schema is at version 99; this build expects ${EXPECTED_SCHEMA_VERSION}.`,
      )
    } finally {
      await pool.end()
    }
    await withClient(database.url, async (client) => {
      await expect(migrate(client, loadMigrations())).rejects.toThrow(/that this checkout does not know/)
    })
  })

  it("rejects reads with bad credentials without leaking them", async () => {
    const database = await migratedDatabase()
    const url = new URL(database.url)
    url.password = "wrong-password-xyz"
    const pool = new Pool({ connectionString: url.toString() })
    try {
      const failure = await new PostgresIntelligenceRepository(pool).listEvents().catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(RepositoryUnavailableError)
      expect((failure as Error).message).toBe("Could not connect to PostgreSQL storage.")
      expect(String((failure as Error).cause)).not.toContain("wrong-password-xyz")
    } finally {
      await pool.end()
    }
  })

  it("in database mode, a missing database fails every read instead of serving demo events", async () => {
    const database = await migratedDatabase()
    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url.replace("omen_test_", "omen_absent_"))
    __resetRepositoryForTests()
    const repository = getRepository()
    expect(repository.storage).toBe("database")
    await expect(repository.listEvents()).rejects.toBeInstanceOf(RepositoryUnavailableError)
    await expect(repository.getEvent("evt-boc-cut")).rejects.toBeInstanceOf(RepositoryUnavailableError)
  })

  it("in database mode, reads the configured database through getRepository", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url)
    __resetRepositoryForTests()
    const events = await getRepository().listEvents()
    expect(events.map((event) => [event.id, event.provenance])).toEqual([["evt-boc-cut", "demo"]])
  })
})
