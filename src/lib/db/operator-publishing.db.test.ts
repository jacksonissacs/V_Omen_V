import { readFileSync } from "node:fs"
import path from "node:path"

import { Pool } from "pg"
import { afterAll, describe, expect, it, vi } from "vitest"

import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { readMoveLogHistory } from "@/lib/db/event-reader"
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
})
