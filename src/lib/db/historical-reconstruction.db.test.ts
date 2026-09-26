import { Client, Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/events/[id]/history/[checkpointId]/route"
import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { publishHistoryCheckpoint } from "@/lib/db/history-checkpoint"
import { writeEventBundle } from "@/lib/db/event-store"
import type { HistoricalReconstruction, ReconstructionOutcome } from "@/lib/domain/historical-reconstruction"
import { createMigratedDatabase, type DisposableDatabase, withClient } from "@/test/postgres-harness"

const CHECKPOINT = "11111111-1111-4111-8111-111111111111"

function viewOf(result: ReconstructionOutcome): HistoricalReconstruction {
  if (result.outcome !== "reconstruction" && result.outcome !== "pre_coverage") {
    throw new Error(`expected a historical view, received ${result.outcome}`)
  }
  return result.reconstruction
}

function replayBundle(
  event: Record<string, unknown>,
  ids: { evidence: string; moveLog: string } = { evidence: "ev-original", moveLog: "ml-replay" },
) {
  return parseEventBundle({
    event,
    observations: [
      {
        sourceKind: "provider",
        sourceName: "desk",
        probabilityType: "market_implied",
        probabilityPct: 55,
        observedAt: "2026-09-01T00:00:00.000Z",
        capturedAt: "2026-09-01T00:01:00.000Z",
        provenance: "demo",
      },
    ],
    evidence: [
      {
        id: ids.evidence,
        sourceName: "original source",
        sourcePublishedAt: "2026-08-01T00:00:00.000Z",
        firstObservedAt: "2026-09-01T00:00:00.000Z",
        capturedAt: "2026-09-01T00:01:00.000Z",
        summary: "Original evidence",
        stance: "supports",
        reliability: 0.8,
        recordedBy: "tester",
        provenance: "demo",
      },
    ],
    moveLogRevisions: [
      {
        moveLogId: ids.moveLog,
        version: 1,
        publishedAt: "2026-09-01T12:00:00.000Z",
        author: "tester",
        whatChanged: "Original move log",
        likelyCause: "original cause",
        explainedPct: 40,
        unexplainedFactors: ["original residual"],
        evidenceIds: [ids.evidence],
        provenance: "demo",
      },
    ],
  })
}

const originalEvent = {
  id: "evt-replay",
  title: "Original recorded title",
  question: "Will the original recorded question stand?",
  status: "active",
  deadline: "2026-10-01T00:00:00.000Z",
  resolutionCriteria: "Original criteria are long enough to store.",
  category: "Economics",
  significance: "high",
  region: "Canada",
  summary: "Original summary.",
  tags: ["original-tag"],
  relatedEventIds: ["evt-original-link"],
  provenance: "demo",
  display: {
    signals: [{ id: "sig-leak", label: "DISPLAY_LEAK_TOKEN", value: "1", direction: "up" }],
  },
}

describe("stored checkpoint reconstruction", () => {
  let database: DisposableDatabase
  let pool: Pool
  let repository: PostgresIntelligenceRepository

  beforeAll(async () => {
    database = await createMigratedDatabase()
    pool = new Pool({ connectionString: database.url })
    repository = new PostgresIntelligenceRepository(pool)
  })

  afterAll(async () => {
    __resetRepositoryForTests()
    await pool?.end()
    await database?.drop()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    __resetRepositoryForTests()
  })

  async function write(bundle: ReturnType<typeof parseEventBundle>) {
    await withClient(database.url, (client) => writeEventBundle(client, bundle))
  }

  async function publish(eventId: string) {
    return withClient(database.url, (client) => publishHistoryCheckpoint(client, eventId))
  }

  it("keeps later evidence, corrections, semantic edits and display defaults out of the earlier checkpoint", async () => {
    await write(replayBundle(originalEvent))
    const earlier = await publish("evt-replay")
    expect(earlier.created).toBe(true)
    expect(earlier.semanticHistory).toBe("recorded")
    const again = await publish("evt-replay")
    expect(again).toMatchObject({ id: earlier.id, sequence: 1, created: false })

    await write(
      parseEventBundle({
        event: {
          ...originalEvent,
          title: "CURRENT_TITLE_LEAK",
          question: "Will the leaked rewritten question stand?",
          status: "resolved",
          deadline: "2026-12-31T00:00:00.000Z",
          resolutionCriteria: "Rewritten criteria are long enough to store.",
          summary: "LEAKED_SUMMARY",
          tags: ["leaked-tag"],
          relatedEventIds: ["evt-leaked-link"],
          correctionNote: "Semantic correction after the first checkpoint.",
          display: {
            signals: [{ id: "sig-leak", label: "DISPLAY_LEAK_TOKEN", value: "9", direction: "down" }],
          },
        },
        observations: [
          {
            sourceKind: "provider",
            sourceName: "desk",
            probabilityType: "market_implied",
            probabilityPct: 99,
            observedAt: "2026-09-06T00:00:00.000Z",
            capturedAt: "2026-09-06T00:01:00.000Z",
            note: "LATE_OBSERVATION_LEAK",
            provenance: "demo",
          },
        ],
        evidence: [
          {
            id: "ev-later",
            sourceName: "later source",
            sourcePublishedAt: "2020-01-01T00:00:00.000Z",
            firstObservedAt: "2026-09-06T00:00:00.000Z",
            capturedAt: "2026-09-06T00:01:00.000Z",
            summary: "LATER_EVIDENCE_LEAK",
            stance: "contradicts",
            reliability: 0.4,
            recordedBy: "tester",
            provenance: "demo",
          },
        ],
        moveLogRevisions: [
          {
            moveLogId: "ml-replay",
            version: 2,
            publishedAt: "2026-09-06T12:00:00.000Z",
            author: "tester",
            whatChanged: "CORRECTED_MOVE_LEAK",
            likelyCause: "corrected cause",
            explainedPct: 11,
            unexplainedFactors: ["later residual"],
            evidenceIds: ["ev-original", "ev-later"],
            correctionNote: "Correction published after the first checkpoint.",
            provenance: "demo",
          },
        ],
      }),
    )
    const later = await publish("evt-replay")
    expect(later.sequence).toBe(2)
    expect(later.id).not.toBe(earlier.id)

    const current = await withClient(database.url, async (client) => {
      const { rows } = await client.query<{ title: string; status: string; tags: string[] }>(
        "SELECT title, status, tags FROM events WHERE id = 'evt-replay'",
      )
      return rows[0]!
    })
    expect(current).toEqual({ title: "CURRENT_TITLE_LEAK", status: "resolved", tags: ["leaked-tag"] })

    const early = viewOf(await repository.reconstructEvent("evt-replay", earlier.id))
    const earlyText = JSON.stringify(early)
    expect(early.semantics).toMatchObject({
      version: 1,
      title: "Original recorded title",
      status: "active",
      deadline: "2026-10-01T00:00:00.000Z",
      tags: ["original-tag"],
      relatedEventIds: ["evt-original-link"],
      question: "Will the original recorded question stand?",
    })
    expect(early.moveLogs).toEqual([
      expect.objectContaining({ version: 1, whatChanged: "Original move log", explainedPct: 40, evidenceIds: ["ev-original"] }),
    ])
    expect(early.evidence.map((item) => item.id)).toEqual(["ev-original"])
    expect(early.observations.map((item) => item.probabilityPct)).toEqual([55])
    expect(early.provenance).toBe("demo")
    expect(early.coverage.semanticHistory).toBe("recorded")
    expect(early.coverage.preBaselineEventRevisions).toBe("not_recorded")
    expect(early.checkpoint).toMatchObject({ id: earlier.id, sequence: 1 })
    for (const leak of [
      "CURRENT_TITLE_LEAK",
      "LEAKED_SUMMARY",
      "leaked-tag",
      "evt-leaked-link",
      "DISPLAY_LEAK_TOKEN",
      "LATER_EVIDENCE_LEAK",
      "LATE_OBSERVATION_LEAK",
      "CORRECTED_MOVE_LEAK",
      "corrected cause",
      "Rewritten criteria",
    ]) {
      expect(earlyText, leak).not.toContain(leak)
    }
    expect(earlyText).not.toContain('"probability"')
    expect(early).not.toHaveProperty("display")

    const next = viewOf(await repository.reconstructEvent("evt-replay", later.id))
    expect(next.semantics).toMatchObject({
      version: 2,
      title: "CURRENT_TITLE_LEAK",
      status: "resolved",
      tags: ["leaked-tag"],
      relatedEventIds: ["evt-leaked-link"],
    })
    expect(next.moveLogs).toEqual([
      expect.objectContaining({ version: 2, whatChanged: "CORRECTED_MOVE_LEAK", evidenceIds: ["ev-original", "ev-later"] }),
    ])
    expect(next.evidence.map((item) => item.summary).sort()).toEqual(["LATER_EVIDENCE_LEAK", "Original evidence"])
    expect(next.observations.map((item) => item.probabilityPct).sort()).toEqual([55, 99])
    expect(JSON.stringify(next)).not.toContain("Original move log")
    expect(JSON.stringify(next)).not.toContain("Original recorded title")
    expect(JSON.stringify(next)).not.toContain("DISPLAY_LEAK_TOKEN")

    const versions = await withClient(database.url, async (client) => {
      const revisions = await client.query<{ version: number }>(
        "SELECT version FROM event_revisions WHERE event_id = 'evt-replay' ORDER BY version",
      )
      const logs = await client.query<{ version: number }>(
        `SELECT version FROM move_log_revisions r
           JOIN move_logs m ON m.id = r.move_log_id
          WHERE m.event_id = 'evt-replay'
          ORDER BY version`,
      )
      return { revisions: revisions.rows.map((row) => row.version), logs: logs.rows.map((row) => row.version) }
    })
    expect(versions).toEqual({ revisions: [1, 2], logs: [1, 2] })

    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url)
    __resetRepositoryForTests()
    const response = await GET(
      new Request(`http://omen.test/api/events/evt-replay/history/${earlier.id}`),
      { params: Promise.resolve({ id: "evt-replay", checkpointId: earlier.id }) },
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.outcome).toBe("reconstruction")
    expect(body.semantics.title).toBe("Original recorded title")
    expect(JSON.stringify(body)).not.toContain("CURRENT_TITLE_LEAK")
    expect(JSON.stringify(body)).not.toContain("DISPLAY_LEAK_TOKEN")
  })

  it("excludes a row committed after the checkpoint even when its availability marker is earlier than the read", async () => {
    await write(
      replayBundle(
        {
          ...originalEvent,
          id: "evt-late",
          title: "Late commit subject",
          question: "Will the late commit stay out of the earlier view?",
          relatedEventIds: [],
          tags: [],
        },
        { evidence: "ev-late-base", moveLog: "ml-late" },
      ),
    )
    const writer = new Client({ connectionString: database.url, application_name: "omen-late-writer" })
    const publisher = new Client({ connectionString: database.url, application_name: "omen-late-publisher" })
    await writer.connect()
    await publisher.connect()
    try {
      await writer.query("BEGIN")
      await writer.query(
        `INSERT INTO evidence (
           id, event_id, source_name, source_published_at, first_observed_at, captured_at,
           summary, stance, reliability, recorded_by, provenance
         ) VALUES (
           'ev-late', 'evt-late', 'late source', '2020-01-01T00:00:00Z', '2026-09-02T00:00:00Z',
           '2026-09-02T00:01:00Z', 'LATE_COMMIT_LEAK', 'contextual', 0.40, 'tester', 'demo'
         )`,
      )
      await publisher.query("SET lock_timeout = '3s'")
      const published = await publishHistoryCheckpoint(publisher, "evt-late")
      const clock = await publisher.query<{ now: Date }>("SELECT clock_timestamp() AS now")
      await writer.query("COMMIT")

      const stored = await publisher.query<{ record_available_at: Date }>(
        "SELECT record_available_at FROM evidence WHERE id = 'ev-late'",
      )
      expect(stored.rows[0]!.record_available_at.getTime()).toBeLessThan(clock.rows[0]!.now.getTime())

      const historical = viewOf(await repository.reconstructEvent("evt-late", published.id))
      expect(historical.evidence.map((item) => item.id)).toEqual(["ev-late-base"])
      expect(JSON.stringify(historical)).not.toContain("LATE_COMMIT_LEAK")

      const after = await publish("evt-late")
      expect(after.sequence).toBe(published.sequence + 1)
      const included = viewOf(await repository.reconstructEvent("evt-late", after.id))
      expect(included.evidence.map((item) => item.id).sort()).toEqual(["ev-late", "ev-late-base"])
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined)
      await writer.end()
      await publisher.end()
    }
  })

  it("reports pre-coverage without copying the current event projection", async () => {
    await withClient(database.url, async (client) => {
      await client.query("BEGIN")
      await client.query(
        `INSERT INTO events (
           id, title, question, status, deadline, resolution_criteria, category, significance,
           region, summary, tags, related_event_ids, provenance, display
         ) VALUES (
           'evt-legacy', 'LIVE_TITLE_LEAK', 'Will the legacy projection be copied into history?',
           'resolved', '2026-12-31T00:00:00Z', 'Legacy criteria are long enough to store.',
           'Economics', 'low', 'Global', 'LIVE_SUMMARY_LEAK', ARRAY['leak-tag'], ARRAY['evt-leaked-link'],
           'demo', '{"signals":[{"label":"DISPLAY_LEAK_TOKEN"}]}'::jsonb
         )`,
      )
      await client.query(
        `INSERT INTO probability_observations (
           event_id, source_kind, source_name, probability_type, probability_pct, observed_at, captured_at, provenance
         ) VALUES (
           'evt-legacy', 'author', 'legacy analyst', 'forecaster_estimate', 33,
           '2026-09-01T00:00:00Z', '2026-09-01T00:01:00Z', 'demo'
         )`,
      )
      await client.query(
        `INSERT INTO evidence (
           id, event_id, source_name, source_published_at, first_observed_at, captured_at,
           summary, stance, reliability, recorded_by, provenance
         ) VALUES (
           'ev-legacy', 'evt-legacy', 'legacy source', NULL, '2026-09-01T00:00:00Z', '2026-09-01T00:01:00Z',
           'Legacy evidence text', 'contextual', 0.50, 'tester', 'sourced'
         )`,
      )
      await client.query("COMMIT")
    })

    const published = await publish("evt-legacy")
    expect(published.semanticHistory).toBe("unavailable")

    await withClient(database.url, async (client) => {
      await client.query("BEGIN")
      await client.query("SET LOCAL omen.allow_event_projection = true")
      await client.query("UPDATE events SET title = 'REWRITTEN_AFTER_CHECKPOINT' WHERE id = 'evt-legacy'")
      await client.query("COMMIT")
    })

    const result = await repository.reconstructEvent("evt-legacy", published.id)
    expect(result.outcome).toBe("pre_coverage")
    const historical = viewOf(result)
    expect(historical.semantics).toBeNull()
    expect(historical.coverage.semanticHistory).toBe("unavailable")
    expect(historical.coverage.semanticEventFieldsFrom).toBe(historical.coverage.recordAvailabilityRealignedAt)
    expect(historical.observations).toEqual([
      expect.objectContaining({ probabilityPct: 33, provenance: "demo", sourceName: "legacy analyst" }),
    ])
    expect(historical.evidence).toEqual([
      expect.objectContaining({ id: "ev-legacy", summary: "Legacy evidence text", provenance: "sourced" }),
    ])
    expect(historical.provenance).toBe("mixed")
    const text = JSON.stringify(historical)
    expect(text).not.toContain("LIVE_TITLE_LEAK")
    expect(text).not.toContain("REWRITTEN_AFTER_CHECKPOINT")
    expect(text).not.toContain("LIVE_SUMMARY_LEAK")
    expect(text).not.toContain("leak-tag")
    expect(text).not.toContain("evt-leaked-link")
    expect(text).not.toContain("DISPLAY_LEAK_TOKEN")

    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url)
    __resetRepositoryForTests()
    const response = await GET(
      new Request(`http://omen.test/api/events/evt-legacy/history/${published.id}`),
      { params: Promise.resolve({ id: "evt-legacy", checkpointId: published.id }) },
    )
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.outcome).toBe("pre_coverage")
    expect(body.semantics).toBeNull()
    expect(JSON.stringify(body)).not.toContain("LIVE_TITLE_LEAK")
  })

  it("distinguishes unknown events, missing checkpoints and same-transaction publication", async () => {
    expect(await repository.reconstructEvent("evt-replay", CHECKPOINT)).toEqual({
      outcome: "unsupported_history",
      message: "No verified history checkpoint matches this event.",
    })
    expect(await repository.reconstructEvent("evt-missing", CHECKPOINT)).toEqual({ outcome: "unknown_event" })
    expect((await repository.reconstructEvent("nope", "not-a-uuid")).outcome).toBe("invalid_request")

    await withClient(database.url, async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ")
      await client.query(
        `INSERT INTO evidence (
           id, event_id, source_name, source_published_at, first_observed_at, captured_at,
           summary, stance, reliability, recorded_by, provenance
         ) VALUES (
           'ev-same-tx', 'evt-replay', 'same transaction', '2026-09-03T00:00:00Z', '2026-09-03T00:00:00Z',
           '2026-09-03T00:01:00Z', 'same transaction evidence', 'contextual', 0.20, 'tester', 'demo'
         )`,
      )
      await expect(client.query("SELECT * FROM omen_publish_history_checkpoint('evt-replay')")).rejects.toThrow(
        /transaction that wrote its history/,
      )
      await client.query("ROLLBACK")
    })
  })

  it("fails a database read visibly instead of returning demo or current rows", async () => {
    const url = new URL(database.url)
    url.password = "wrong-password-xyz"
    const broken = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 })
    try {
      const failure = await new PostgresIntelligenceRepository(broken)
        .reconstructEvent("evt-replay", CHECKPOINT)
        .catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(RepositoryUnavailableError)
      expect((failure as Error).message).toBe("Could not connect to PostgreSQL storage.")
      expect(String(failure)).not.toContain("wrong-password-xyz")
      expect(String(failure)).not.toContain("Original recorded title")
      expect(String(failure)).not.toContain("CURRENT_TITLE_LEAK")
    } finally {
      await broken.end()
    }
  })
})
