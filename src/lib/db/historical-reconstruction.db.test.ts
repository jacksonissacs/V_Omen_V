import { Client, Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { GET as getCheckpoint } from "@/app/api/events/[id]/history/[checkpointId]/route"
import { GET as listCheckpoints } from "@/app/api/events/[id]/history/route"
import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { readStoredReconstruction } from "@/lib/db/historical-reader"
import { publishHistoryCheckpoint } from "@/lib/db/history-checkpoint"
import { writeEventBundle, type WriteSummary } from "@/lib/db/event-store"
import type { HistoricalReconstruction, ReconstructionOutcome } from "@/lib/domain/historical-reconstruction"
import { createMigratedDatabase, type DisposableDatabase, withClient } from "@/test/postgres-harness"

const WIDE = "9007199254740993"

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

  async function write(bundle: ReturnType<typeof parseEventBundle>): Promise<WriteSummary> {
    return withClient(database.url, (client) => writeEventBundle(client, bundle))
  }

  it("keeps later corrections, backdated evidence and semantic edits out of the earlier checkpoint", async () => {
    const earlier = await write(replayBundle(originalEvent))
    expect(earlier.checkpoint.created).toBe(true)
    expect(earlier.checkpoint.semanticHistory).toBe("recorded")
    expect(earlier.checkpoint.contentMd5).toMatch(/^[0-9a-f]{32}$/)
    expect(typeof earlier.checkpoint.id).toBe("string")

    const retry = await withClient(database.url, (client) => publishHistoryCheckpoint(client, "evt-replay"))
    expect(retry).toMatchObject({ id: earlier.checkpoint.id, sequence: 1, created: false })
    const replay = await write(replayBundle(originalEvent))
    expect(replay.checkpoint).toMatchObject({ id: earlier.checkpoint.id, created: false, sequence: 1 })

    const later = await write(
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
    expect(later.checkpoint.sequence).toBe(2)
    expect(later.checkpoint.id).not.toBe(earlier.checkpoint.id)

    const current = await withClient(database.url, async (client) => {
      const { rows } = await client.query<{ title: string; status: string; tags: string[] }>(
        "SELECT title, status, tags FROM events WHERE id = 'evt-replay'",
      )
      return rows[0]!
    })
    expect(current).toEqual({ title: "CURRENT_TITLE_LEAK", status: "resolved", tags: ["leaked-tag"] })

    const early = viewOf(await repository.reconstructEvent("evt-replay", earlier.checkpoint.id))
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
    expect(typeof early.observations[0]?.id).toBe("string")
    expect(typeof early.moveLogs[0]?.id).toBe("string")
    expect(early.provenance).toBe("demo")
    expect(early.coverage.semanticHistory).toBe("recorded")
    expect(early.coverage.preBaselineEventRevisions).toBe("not_recorded")
    expect(early.checkpoint).toMatchObject({
      id: earlier.checkpoint.id,
      sequence: 1,
      contentMd5: earlier.checkpoint.contentMd5,
    })
    expect(early.checkpoint).not.toHaveProperty("contentSha256")
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
    expect(early).not.toHaveProperty("display")

    const next = viewOf(await repository.reconstructEvent("evt-replay", later.checkpoint.id))
    expect(next.semantics).toMatchObject({
      version: 2,
      title: "CURRENT_TITLE_LEAK",
      status: "resolved",
      tags: ["leaked-tag"],
      relatedEventIds: ["evt-leaked-link"],
    })
    expect(next.moveLogs).toEqual([
      expect.objectContaining({
        version: 2,
        whatChanged: "CORRECTED_MOVE_LEAK",
        evidenceIds: ["ev-original", "ev-later"],
      }),
    ])
    expect(next.evidence.map((item) => item.summary).sort()).toEqual(["LATER_EVIDENCE_LEAK", "Original evidence"])
    expect(next.observations.map((item) => item.probabilityPct).sort((a, b) => a - b)).toEqual([55, 99])
    expect(JSON.stringify(next)).not.toContain("Original move log")
    expect(JSON.stringify(next)).not.toContain("Original recorded title")
    expect(JSON.stringify(next)).not.toContain("DISPLAY_LEAK_TOKEN")

    const storedIds = await withClient(database.url, async (client) => {
      const observation = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM probability_observations
          WHERE event_id = 'evt-replay' AND probability_pct = 55`,
      )
      const revision = await client.query<{ id: string }>(
        `SELECT r.id::text AS id FROM move_log_revisions r
           JOIN move_logs m ON m.id = r.move_log_id
          WHERE m.event_id = 'evt-replay' AND r.version = 1`,
      )
      return { observation: observation.rows[0]!.id, revision: revision.rows[0]!.id }
    })
    expect(early.observations[0]?.id).toBe(storedIds.observation)
    expect(early.moveLogs[0]?.id).toBe(storedIds.revision)

    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url)
    __resetRepositoryForTests()
    const response = await getCheckpoint(
      new Request(`http://omen.test/api/events/evt-replay/history/${earlier.checkpoint.id}`),
      { params: Promise.resolve({ id: "evt-replay", checkpointId: earlier.checkpoint.id }) },
    )
    expect(response.status).toBe(200)
    const text = await response.text()
    const body = JSON.parse(text) as { outcome: string; semantics: { title: string }; checkpoint: { id: string } }
    expect(body.outcome).toBe("reconstruction")
    expect(body.semantics.title).toBe("Original recorded title")
    expect(body.checkpoint.id).toBe(earlier.checkpoint.id)
    expect(text).toContain(`"id":"${earlier.checkpoint.id}"`)
    expect(text).not.toContain("CURRENT_TITLE_LEAK")
    expect(text).not.toContain("DISPLAY_LEAK_TOKEN")
    expect(text).not.toContain("contentSha256")
  })

  it("excludes a row committed after the checkpoint even when its availability marker is earlier than the read", async () => {
    const seeded = await write(
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
      expect(published).toMatchObject({ id: seeded.checkpoint.id, created: false })
      const clock = await publisher.query<{ now: Date }>("SELECT clock_timestamp() AS now")
      await writer.query("COMMIT")

      const stored = await publisher.query<{ record_available_at: Date }>(
        "SELECT record_available_at FROM evidence WHERE id = 'ev-late'",
      )
      expect(stored.rows[0]!.record_available_at.getTime()).toBeLessThan(clock.rows[0]!.now.getTime())

      const historical = viewOf(await repository.reconstructEvent("evt-late", published.id))
      expect(historical.evidence.map((item) => item.id)).toEqual(["ev-late-base"])
      expect(JSON.stringify(historical)).not.toContain("LATE_COMMIT_LEAK")

      const after = await withClient(database.url, (client) => publishHistoryCheckpoint(client, "evt-late"))
      expect(after.created).toBe(true)
      expect(after.sequence).toBe(published.sequence + 1)
      const included = viewOf(await repository.reconstructEvent("evt-late", after.id))
      expect(included.evidence.map((item) => item.id).sort()).toEqual(["ev-late", "ev-late-base"])
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined)
      await writer.end()
      await publisher.end()
    }
  })

  it("reports missing semantic revisions as pre-coverage without copying the current projection", async () => {
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

    const published = await withClient(database.url, (client) => publishHistoryCheckpoint(client, "evt-legacy"))
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
    const response = await getCheckpoint(
      new Request(`http://omen.test/api/events/evt-legacy/history/${published.id}`),
      { params: Promise.resolve({ id: "evt-legacy", checkpointId: published.id }) },
    )
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.outcome).toBe("pre_coverage")
    expect(body.semantics).toBeNull()
    expect(JSON.stringify(body)).not.toContain("LIVE_TITLE_LEAK")
  })

  it("distinguishes unknown events, missing checkpoints, cross-event ids, verification failure and storage failure", async () => {
    expect(await repository.reconstructEvent("evt-replay", "999999")).toEqual({
      outcome: "missing_checkpoint",
      message: "No verified history checkpoint matches this event.",
    })
    expect(await repository.reconstructEvent("evt-missing", "1")).toEqual({ outcome: "unknown_event" })
    expect((await repository.reconstructEvent("nope", "not-a-checkpoint")).outcome).toBe("invalid_request")

    const foreign = await withClient(database.url, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "SELECT id::text AS id FROM history_checkpoints WHERE event_id = 'evt-late' ORDER BY sequence LIMIT 1",
      )
      return rows[0]!.id
    })
    const crossed = await repository.reconstructEvent("evt-replay", foreign)
    expect(crossed.outcome).toBe("missing_checkpoint")
    expect(JSON.stringify(crossed)).not.toContain("Late commit")
    expect(JSON.stringify(crossed)).not.toContain("LATE_COMMIT_LEAK")

    await withClient(database.url, async (client) => {
      await client.query("BEGIN")
      await client.query("ALTER TABLE history_checkpoints DISABLE TRIGGER history_checkpoints_append_only")
      await client.query(
        "UPDATE history_checkpoints SET content_md5 = repeat('ab', 16) WHERE id = $1::bigint",
        [foreign],
      )
      await client.query("ALTER TABLE history_checkpoints ENABLE TRIGGER history_checkpoints_append_only")
      await client.query("COMMIT")
    })
    const failed = await repository.reconstructEvent("evt-late", foreign)
    expect(failed).toEqual({
      outcome: "verification_failed",
      message: `Checkpoint ${foreign} failed verification (digest-mismatch).`,
    })
    expect(JSON.stringify(failed)).not.toContain("LATE_COMMIT_LEAK")
    expect(JSON.stringify(failed)).not.toContain("Late commit subject")
    const stillReadable = await repository.getEvent("evt-late")
    expect(stillReadable?.title).toBe("Late commit subject")

    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url)
    __resetRepositoryForTests()
    const response = await getCheckpoint(
      new Request(`http://omen.test/api/events/evt-late/history/${foreign}`),
      { params: Promise.resolve({ id: "evt-late", checkpointId: foreign }) },
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ outcome: "verification_failed" })

    const url = new URL(database.url)
    url.password = "wrong-password-xyz"
    const broken = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 })
    try {
      const failure = await new PostgresIntelligenceRepository(broken)
        .reconstructEvent("evt-replay", "1")
        .catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(RepositoryUnavailableError)
      expect((failure as Error).message).toBe("Could not connect to PostgreSQL storage.")
      expect(String(failure)).not.toContain("wrong-password-xyz")
      expect(String(failure)).not.toContain("Original recorded title")
    } finally {
      await broken.end()
    }
  })

  it("publishes a checkpoint on retry after history committed without one, and does not publish twice", async () => {
    await withClient(database.url, async (client) => {
      await client.query("BEGIN")
      await client.query(
        `INSERT INTO evidence (
           id, event_id, source_name, source_published_at, first_observed_at, captured_at,
           summary, stance, reliability, recorded_by, provenance
         ) VALUES (
           'ev-retry', 'evt-replay', 'retry source', '2026-09-07T00:00:00Z', '2026-09-07T00:00:00Z',
           '2026-09-07T00:01:00Z', 'RETRY_EVIDENCE', 'contextual', 0.30, 'tester', 'demo'
         )`,
      )
      await client.query("COMMIT")
      const before = await client.query<{ max: number }>(
        "SELECT coalesce(max(sequence), 0)::int AS max FROM history_checkpoints WHERE event_id = 'evt-replay'",
      )
      const published = await publishHistoryCheckpoint(client, "evt-replay")
      expect(published.created).toBe(true)
      expect(published.sequence).toBe(before.rows[0]!.max + 1)
      const again = await publishHistoryCheckpoint(client, "evt-replay")
      expect(again).toMatchObject({ id: published.id, sequence: published.sequence, created: false })
      const view = viewOf(await readStoredReconstruction(client, "evt-replay", published.id))
      expect(view.evidence.map((item) => item.id)).toContain("ev-retry")
    })

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
      await expect(publishHistoryCheckpoint(client, "evt-replay")).rejects.toThrow(/uncommitted history/)
      await client.query("ROLLBACK")
    })
  })

  it("lists checkpoints in bounded pages without member rows or the live projection", async () => {
    const base = {
      id: "evt-pages",
      title: "PAGE_TITLE_LEAK",
      question: "Will checkpoint pages stay bounded?",
      status: "active" as const,
      deadline: "2026-10-01T00:00:00.000Z",
      resolutionCriteria: "Paging criteria are long enough to store.",
      category: "Economics" as const,
      significance: "low" as const,
      region: "Global",
      summary: "Paging summary.",
      provenance: "demo" as const,
      display: { signals: [{ label: "DISPLAY_LEAK_TOKEN" }] },
    }
    await write(replayBundle(base, { evidence: "ev-page-1", moveLog: "ml-page" }))
    await write(
      parseEventBundle({
        eventId: "evt-pages",
        observations: [
          {
            sourceKind: "author",
            sourceName: "page desk",
            probabilityType: "forecaster_estimate",
            probabilityPct: 21,
            observedAt: "2026-09-02T00:00:00.000Z",
            capturedAt: "2026-09-02T00:01:00.000Z",
            provenance: "demo",
          },
        ],
      }),
    )
    await write(
      parseEventBundle({
        eventId: "evt-pages",
        observations: [
          {
            sourceKind: "author",
            sourceName: "page desk",
            probabilityType: "forecaster_estimate",
            probabilityPct: 22,
            observedAt: "2026-09-03T00:00:00.000Z",
            capturedAt: "2026-09-03T00:01:00.000Z",
            provenance: "demo",
          },
        ],
      }),
    )

    const page = await repository.listHistoryCheckpoints("evt-pages", { limit: 2 })
    expect(page.outcome).toBe("checkpoints")
    if (page.outcome !== "checkpoints") return
    expect(page.checkpoints.map((checkpoint) => checkpoint.sequence)).toEqual([3, 2])
    expect(page.hasMore).toBe(true)
    expect(page.limit).toBe(2)
    const listed = JSON.stringify(page)
    expect(listed).not.toContain("PAGE_TITLE_LEAK")
    expect(listed).not.toContain("DISPLAY_LEAK_TOKEN")
    expect(listed).not.toContain("contentSha256")
    expect(listed).not.toContain("ev-page-1")
    for (const checkpoint of page.checkpoints) {
      expect(checkpoint.id).toMatch(/^[1-9][0-9]*$/)
      expect(checkpoint.contentMd5).toMatch(/^[0-9a-f]{32}$/)
      expect(checkpoint).not.toHaveProperty("observations")
    }

    const older = await repository.listHistoryCheckpoints("evt-pages", {
      limit: 2,
      beforeSequence: page.checkpoints[1]!.sequence,
    })
    expect(older).toMatchObject({
      outcome: "checkpoints",
      hasMore: false,
      checkpoints: [expect.objectContaining({ sequence: 1 })],
    })

    expect((await repository.listHistoryCheckpoints("evt-pages", { limit: 1000 })).outcome).toBe("invalid_request")
    expect(await repository.listHistoryCheckpoints("evt-missing")).toEqual({ outcome: "unknown_event" })

    const newest = page.checkpoints[0]!
    const replay = viewOf(await repository.reconstructEvent("evt-pages", newest.id))
    expect(replay.observations.map((item) => item.probabilityPct).sort((a, b) => a - b)).toEqual([21, 22, 55])

    vi.stubEnv("OMEN_STORAGE_MODE", "database")
    vi.stubEnv("DATABASE_URL", database.url)
    __resetRepositoryForTests()
    const response = await listCheckpoints(new Request("http://omen.test/api/events/evt-pages/history?limit=1"), {
      params: Promise.resolve({ id: "evt-pages" }),
    })
    expect(response.status).toBe(200)
    const text = await response.text()
    const body = JSON.parse(text) as { checkpoints: { id: string; sequence: number }[]; hasMore: boolean }
    expect(body.checkpoints).toHaveLength(1)
    expect(body.checkpoints[0]!.sequence).toBe(3)
    expect(body.hasMore).toBe(true)
    expect(typeof body.checkpoints[0]!.id).toBe("string")
    expect(text).toContain(`"id":"${body.checkpoints[0]!.id}"`)
    expect(text).not.toContain("PAGE_TITLE_LEAK")
    expect(text).not.toContain("DISPLAY_LEAK_TOKEN")
  })
})

describe("lossless bigint checkpoint identifiers", () => {
  it("round-trips an int8 past Number.MAX_SAFE_INTEGER through SQL, TypeScript and JSON", async () => {
    const database = await createMigratedDatabase()
    const pool = new Pool({ connectionString: database.url })
    try {
      const repository = new PostgresIntelligenceRepository(pool)
      await withClient(database.url, async (client) => {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('history_checkpoints', 'id'), $1::bigint, false)`,
          [WIDE],
        )
        await client.query(
          `SELECT setval(pg_get_serial_sequence('probability_observations', 'id'), $1::bigint, false)`,
          [WIDE],
        )
      })
      const summary = await withClient(database.url, (client) =>
        writeEventBundle(
          client,
          parseEventBundle({
            event: {
              id: "evt-wide",
              title: "Wide identifier subject",
              question: "Will the checkpoint id survive JSON?",
              status: "active",
              deadline: "2026-10-01T00:00:00.000Z",
              resolutionCriteria: "Wide identifier criteria are long enough.",
              category: "Economics",
              significance: "low",
              region: "Global",
              summary: "Wide identifier summary.",
              provenance: "demo",
            },
            observations: [
              {
                sourceKind: "author",
                sourceName: "wide desk",
                probabilityType: "forecaster_estimate",
                probabilityPct: 12,
                observedAt: "2026-09-01T00:00:00.000Z",
                capturedAt: "2026-09-01T00:01:00.000Z",
                note: "WIDE_OBSERVATION",
                provenance: "demo",
              },
            ],
          }),
        ),
      )
      expect(summary.checkpoint.id).toBe(WIDE)
      expect(String(Number(WIDE))).not.toBe(WIDE)

      const stored = await withClient(database.url, async (client) => {
        const checkpoint = await client.query<{ id: string }>(
          "SELECT id::text AS id FROM history_checkpoints WHERE event_id = 'evt-wide'",
        )
        const observation = await client.query<{ id: string }>(
          "SELECT id::text AS id FROM probability_observations WHERE event_id = 'evt-wide'",
        )
        return { checkpoint: checkpoint.rows[0]!.id, observation: observation.rows[0]!.id }
      })
      expect(stored).toEqual({ checkpoint: WIDE, observation: WIDE })

      const view = viewOf(await repository.reconstructEvent("evt-wide", summary.checkpoint.id))
      expect(view.checkpoint.id).toBe(WIDE)
      expect(view.observations[0]?.id).toBe(WIDE)
      const text = JSON.stringify(view)
      expect(text).toContain(`"id":"${WIDE}"`)
      expect(text).not.toContain("9007199254740992")

      vi.stubEnv("OMEN_STORAGE_MODE", "database")
      vi.stubEnv("DATABASE_URL", database.url)
      __resetRepositoryForTests()
      const response = await getCheckpoint(
        new Request(`http://omen.test/api/events/evt-wide/history/${WIDE}`),
        { params: Promise.resolve({ id: "evt-wide", checkpointId: WIDE }) },
      )
      expect(response.status).toBe(200)
      const raw = await response.text()
      expect(raw).toContain(`"id":"${WIDE}"`)
      expect(raw).not.toContain("9007199254740992")
      const body = JSON.parse(raw) as { checkpoint: { id: string }; observations: { id: string }[] }
      expect(body.checkpoint.id).toBe(WIDE)
      expect(body.observations[0]?.id).toBe(WIDE)
    } finally {
      __resetRepositoryForTests()
      await pool.end()
      await database.drop()
    }
  })
})
