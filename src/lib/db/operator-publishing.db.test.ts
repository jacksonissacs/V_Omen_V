import { readFileSync } from "node:fs"
import path from "node:path"

import { Pool } from "pg"
import { afterAll, describe, expect, it, vi } from "vitest"

import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { readEvents, readMoveLogHistory } from "@/lib/db/event-reader"
import * as historyCheckpoint from "@/lib/db/history-checkpoint"
import { writeEventBundle } from "@/lib/db/event-store"
import {
  getPublicationOperation,
  publishApprovedReviewItem,
  publishEventBundle,
  retryPublicationOperation,
  verifyCheckpointDigest,
} from "@/lib/db/publication"
import {
  approveSourceReviewItem,
  getSourceReviewItem,
  listSourceReviewItems,
  stageSourceReviewItem,
} from "@/lib/db/source-review"
import { createMigratedDatabase, type DisposableDatabase, withClient } from "@/test/postgres-harness"

const ROOT = path.resolve(__dirname, "../../..")
const SEED_FILE = path.join(ROOT, "db/fixtures/demo-evt-boc-cut.json")
const seedBundle = () => parseEventBundle(JSON.parse(readFileSync(SEED_FILE, "utf8")))

const created: DisposableDatabase[] = []
async function migratedDatabase() {
  const database = await createMigratedDatabase()
  created.push(database)
  return database
}

afterAll(async () => {
  await Promise.all(created.map((database) => database.drop()))
})

describe("operator publishing workflow", () => {
  it("reviews intake, publishes evidence and an authored Move Log, corrects, and retries checkpoint publication", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
    })

    const evidenceStage = {
      id: "src-boc-evidence-1",
      eventId: "evt-boc-cut",
      stagedBy: "operator.test",
      intakeNote: "CPI detail from StatsCan release",
      candidate: {
        kind: "evidence",
        evidence: {
          id: "ev-boc-cpi-sep26",
          sourceName: "Statistics Canada CPI",
          sourceUrl: "https://example.org/cpi",
          sourcePublishedAt: "2026-09-01T14:30:00.000Z",
          firstObservedAt: "2026-09-01T14:35:00.000Z",
          capturedAt: "2026-09-01T14:36:00.000Z",
          summary: "Headline CPI printed below consensus for August.",
          stance: "supports",
          reliability: 0.82,
          recordedBy: "operator.test",
          provenance: "sourced",
        },
      },
    }

    await withClient(database.url, async (client) => {
      await stageSourceReviewItem(client, evidenceStage)
      await approveSourceReviewItem(client, "src-boc-evidence-1", "reviewer.test", "Source URL verified.")
      const staged = await listSourceReviewItems(client, { status: "staged" })
      expect(staged).toHaveLength(0)
    })

    let firstCheckpointId = ""
    await withClient(database.url, async (client) => {
      const result = await publishApprovedReviewItem(
        client,
        (await getSourceReviewItem(client, "src-boc-evidence-1"))!,
        "idem-evidence-1",
      )
      expect(result.summary.evidence.appended).toBe(1)
      firstCheckpointId = result.summary.checkpoint.id
      expect(await verifyCheckpointDigest(client, firstCheckpointId)).toBe("ok")
    })

    const moveLogStage = {
      id: "src-boc-move-1",
      eventId: "evt-boc-cut",
      stagedBy: "operator.test",
      candidate: {
        kind: "move_log",
        moveLog: {
          moveLogId: "ml-boc-cut-sep26",
          publishedAt: "2026-09-20T15:00:00.000Z",
          author: "A. Operator",
          observedChange: "October cut implied probability rose after the CPI print.",
          citedEvidenceIds: ["ev-boc-cpi-sep26"],
          interpretation: "Softer inflation reduces the bar for an October cut.",
          remainsUnknown: ["Whether the BoC reacts to one month of data"],
          provenance: "sourced",
        },
      },
    }

    await withClient(database.url, async (client) => {
      await stageSourceReviewItem(client, moveLogStage)
      await approveSourceReviewItem(client, "src-boc-move-1", "reviewer.test")
      const result = await publishApprovedReviewItem(
        client,
        (await listSourceReviewItems(client, { status: "approved" })).find((item) => item.id === "src-boc-move-1")!,
        "idem-move-1",
      )
      expect(result.summary.moveLogRevisions.appended).toBe(1)
      const history = await readMoveLogHistory(client, "evt-boc-cut")
      const revision = history.find((row) => row.moveLogId === "ml-boc-cut-sep26")
      expect(revision?.explainedPct).toBeNull()
      expect(revision?.whatChanged).toContain("CPI print")
    })

    const pool = new Pool({ connectionString: database.url })
    try {
      const repository = new PostgresIntelligenceRepository(pool)
      const event = await repository.getEvent("evt-boc-cut")
      expect(event?.evidence.some((item) => item.id === "ev-boc-cpi-sep26")).toBe(true)
      expect(event?.explained).toBeNull()
    } finally {
      await pool.end()
    }

    const correctionBundle = parseEventBundle({
      eventId: "evt-boc-cut",
      moveLogRevisions: [
        {
          moveLogId: "ml-boc-cut-sep26",
          version: 2,
          publishedAt: "2026-09-21T16:00:00.000Z",
          author: "A. Operator",
          whatChanged: "Clarified that the move followed the CPI detail, not the headline alone.",
          likelyCause: "Desk commentary focused on the core CPI path.",
          unexplainedFactors: ["Whether the BoC reacts to one month of data"],
          evidenceIds: ["ev-boc-cpi-sep26"],
          correctionNote: "First version overstated headline-only attribution.",
          provenance: "sourced",
        },
      ],
    })

    await withClient(database.url, async (client) => {
      const before = await verifyCheckpointDigest(client, firstCheckpointId)
      expect(before).toBe("ok")
      await publishEventBundle(client, correctionBundle, { idempotencyKey: "idem-correction-1" })
      expect(await verifyCheckpointDigest(client, firstCheckpointId)).toBe("ok")
      const history = await readMoveLogHistory(client, "evt-boc-cut")
      expect(history.filter((row) => row.moveLogId === "ml-boc-cut-sep26")).toHaveLength(2)
    })

    const originalPublish = historyCheckpoint.publishHistoryCheckpoint
    let publishCalls = 0
    vi.spyOn(historyCheckpoint, "publishHistoryCheckpoint").mockImplementation(async (client, eventId) => {
      publishCalls += 1
      if (publishCalls === 1) throw new Error("simulated checkpoint publisher failure")
      return originalPublish(client, eventId)
    })

    const retryBundle = parseEventBundle({
      eventId: "evt-boc-cut",
      evidence: [
        {
          id: "ev-boc-retry-check",
          sourceName: "Retry probe",
          sourcePublishedAt: null,
          firstObservedAt: "2026-09-01T17:00:00.000Z",
          capturedAt: "2026-09-01T17:01:00.000Z",
          summary: "Row used to exercise checkpoint retry.",
          stance: "contextual",
          reliability: 0.5,
          recordedBy: "operator.test",
          provenance: "sourced",
        },
      ],
    })

    try {
      await withClient(database.url, async (client) => {
        await expect(
          publishEventBundle(client, retryBundle, { idempotencyKey: "idem-retry-1" }),
        ).rejects.toThrow(/simulated checkpoint/)
        const op = await getPublicationOperation(client, "idem-retry-1")
        expect(op?.status).toBe("checkpoint_pending")
        const { rows } = await client.query("SELECT count(*)::int AS count FROM evidence WHERE id = $1", [
          "ev-boc-retry-check",
        ])
        expect(rows[0].count).toBe(1)
        const retry = await retryPublicationOperation(client, "idem-retry-1")
        expect(retry.summary.evidence.unchanged).toBe(1)
        const opAfter = await getPublicationOperation(client, "idem-retry-1")
        expect(opAfter?.status).toBe("completed")
        const { rows: afterRows } = await client.query("SELECT count(*)::int AS count FROM evidence WHERE id = $1", [
          "ev-boc-retry-check",
        ])
        expect(afterRows[0].count).toBe(1)
      })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("stages and approves a previously absent event, then publishes and retries the checkpoint", async () => {
    const database = await migratedDatabase()
    const review = JSON.parse(
      readFileSync(path.join(ROOT, "db/operator-inputs/evt-gemini-4-public-by-2026-10-31.review.json"), "utf8"),
    )
    const bundle = parseEventBundle(review.candidate.bundle)
    const idempotencyKey = "gemini-4-public-2026-10-31-v1"

    await withClient(database.url, async (client) => {
      const events = async () =>
        (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM events")).rows[0]!.count
      expect(await events()).toBe(0)
      await expect(
        stageSourceReviewItem(client, {
          id: "src-absent-evidence-only",
          eventId: bundle.eventId,
          stagedBy: "omen.operator",
          candidate: {
            kind: "evidence",
            evidence: {
              id: "ev-absent-probe",
              sourceName: "Probe",
              sourcePublishedAt: null,
              firstObservedAt: "2026-10-07T14:53:51.789Z",
              capturedAt: "2026-10-07T14:53:51.789Z",
              summary: "This candidate must not create an event.",
              stance: "contextual",
              reliability: null,
              recordedBy: "omen.operator",
              provenance: "sourced",
            },
          },
        }),
      ).rejects.toThrow(/not stored/)
      expect(await events()).toBe(0)

      const staged = await stageSourceReviewItem(client, review)
      expect(staged.status).toBe("staged")
      expect(await events()).toBe(0)
      const approved = await approveSourceReviewItem(
        client,
        staged.id,
        "omen.operator",
        "Approved the staged bundle. No reliability score was added.",
      )
      expect(approved.status).toBe("approved")
      expect(await events()).toBe(0)
    })

    const originalPublish = historyCheckpoint.publishHistoryCheckpoint
    let publishCalls = 0
    vi.spyOn(historyCheckpoint, "publishHistoryCheckpoint").mockImplementation(async (client, eventId) => {
      publishCalls += 1
      if (publishCalls === 1) throw new Error("simulated checkpoint publisher failure")
      return originalPublish(client, eventId)
    })

    try {
      await withClient(database.url, async (client) => {
        const item = await getSourceReviewItem(client, review.id)
        expect(item?.status).toBe("approved")
        await expect(publishApprovedReviewItem(client, item!, idempotencyKey)).rejects.toThrow(
          /simulated checkpoint/,
        )
        const pending = await getPublicationOperation(client, idempotencyKey)
        expect(pending?.status).toBe("checkpoint_pending")
        expect(pending?.sourceReviewItemId).toBe(review.id)
        const present = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM events WHERE id = $1",
          [bundle.eventId],
        )
        expect(present.rows[0]!.count).toBe(1)
        const checkpointsBefore = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM history_checkpoints WHERE event_id = $1",
          [bundle.eventId],
        )
        expect(checkpointsBefore.rows[0]!.count).toBe(0)

        const retried = await retryPublicationOperation(client, idempotencyKey)
        expect(retried.operation.status).toBe("completed")
        expect(retried.summary.checkpoint.sequence).toBe(1)
        expect(retried.summary.observations).toEqual({ appended: 0, unchanged: 1 })
        expect(retried.summary.evidence).toEqual({ appended: 0, unchanged: 3 })
        expect(await verifyCheckpointDigest(client, retried.summary.checkpoint.id)).toBe("ok")

        const again = await publishApprovedReviewItem(client, item!, idempotencyKey)
        expect(again.operation.id).toBe(retried.operation.id)
        expect(again.summary.checkpoint.id).toBe(retried.summary.checkpoint.id)
        const checkpointsAfter = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM history_checkpoints WHERE event_id = $1",
          [bundle.eventId],
        )
        expect(checkpointsAfter.rows[0]!.count).toBe(1)

        const observation = await client.query<{ probability_pct: string; observed_at: Date; captured_at: Date }>(
          `SELECT probability_pct::text AS probability_pct, observed_at, captured_at
             FROM probability_observations WHERE event_id = $1`,
          [bundle.eventId],
        )
        expect(observation.rows).toEqual([
          {
            probability_pct: "94.50",
            observed_at: new Date(bundle.observations[0]!.observedAt),
            captured_at: new Date(bundle.observations[0]!.capturedAt!),
          },
        ])
        const reliability = await client.query<{ reliability: number | null; source_published_at: Date | null }>(
          "SELECT reliability::float8 AS reliability, source_published_at FROM evidence WHERE event_id = $1",
          [bundle.eventId],
        )
        expect(reliability.rows.every((row) => row.reliability === null)).toBe(true)
        const stored = await readEvents(client, [bundle.eventId])
        const event = stored.events[0]
        expect(event?.question).toBe("Gemini 4.0 released by October 31, 2026?")
        expect(event?.probability).toBe(94.5)
        expect(event?.provenance).toBe("sourced")
        expect(event?.evidence.every((item) => item.reliability === null)).toBe(true)
        expect(event?.evidence.find((item) => item.id === "ev-google-gemini-4-argon")?.publishedAt).toBe(
          "2026-09-30T20:00:00.000Z",
        )
        expect(event?.evidence.find((item) => item.id === "ev-gamma-gemini-4-2026-10-31")?.publishedAt).toBeNull()

        const different = structuredClone(bundle)
        different.evidence[0]!.summary = `${different.evidence[0]!.summary} (altered)`
        await expect(publishEventBundle(client, different, { idempotencyKey })).rejects.toThrow(
          /already bound to a different bundle/,
        )
      })
    } finally {
      vi.restoreAllMocks()
    }
  })
})
