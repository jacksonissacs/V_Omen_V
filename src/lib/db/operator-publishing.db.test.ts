import { readFileSync } from "node:fs"
import path from "node:path"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

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

/** Fixed synthetic timeline: sourcePublishedAt <= firstObservedAt <= capturedAt throughout. */
const SYNTH = {
  cpiEvidence: {
    id: "ev-boc-cpi-sep26",
    sourceName: "Statistics Canada CPI",
    sourceUrl: "https://example.org/cpi",
    sourcePublishedAt: "2026-09-10T14:30:00.000Z",
    firstObservedAt: "2026-09-10T14:35:00.000Z",
    capturedAt: "2026-09-10T14:36:00.000Z",
    summary: "Headline CPI printed below consensus for August.",
    stance: "supports" as const,
    reliability: 0.82,
    recordedBy: "operator.test",
    provenance: "sourced" as const,
  },
  moveLogPublishedAt: "2026-09-10T15:00:00.000Z",
  correctionPublishedAt: "2026-09-10T16:00:00.000Z",
  retryEvidence: {
    id: "ev-boc-retry-check",
    sourceName: "Retry probe",
    sourcePublishedAt: null,
    firstObservedAt: "2026-09-10T17:00:00.000Z",
    capturedAt: "2026-09-10T17:01:00.000Z",
    summary: "Row used to exercise checkpoint retry.",
    stance: "contextual" as const,
    reliability: 0.5,
    recordedBy: "operator.test",
    provenance: "sourced" as const,
  },
}

const created: DisposableDatabase[] = []
async function migratedDatabase() {
  const database = await createMigratedDatabase()
  created.push(database)
  return database
}

async function seedBocEvent(database: DisposableDatabase) {
  await withClient(database.url, (client) => writeEventBundle(client, seedBundle()))
}

async function publishCpiEvidence(database: DisposableDatabase, idempotencyKey = "idem-evidence-1") {
  const evidenceStage = {
    id: "src-boc-evidence-1",
    eventId: "evt-boc-cut",
    stagedBy: "operator.test",
    intakeNote: "CPI detail from StatsCan release",
    candidate: { kind: "evidence" as const, evidence: SYNTH.cpiEvidence },
  }
  return withClient(database.url, async (client) => {
    await stageSourceReviewItem(client, evidenceStage)
    await approveSourceReviewItem(client, "src-boc-evidence-1", "reviewer.test", "Source URL verified.")
    return publishApprovedReviewItem(
      client,
      (await getSourceReviewItem(client, "src-boc-evidence-1"))!,
      idempotencyKey,
    )
  })
}

async function publishAuthoredMoveLog(database: DisposableDatabase, idempotencyKey = "idem-move-1") {
  const moveLogStage = {
    id: "src-boc-move-1",
    eventId: "evt-boc-cut",
    stagedBy: "operator.test",
    candidate: {
      kind: "move_log" as const,
      moveLog: {
        moveLogId: "ml-boc-cut-sep26",
        publishedAt: SYNTH.moveLogPublishedAt,
        author: "A. Operator",
        observedChange: "October cut implied probability rose after the CPI print.",
        citedEvidenceIds: [SYNTH.cpiEvidence.id],
        interpretation: "Softer inflation reduces the bar for an October cut.",
        remainsUnknown: ["Whether the BoC reacts to one month of data"],
        provenance: "sourced" as const,
      },
    },
  }
  return withClient(database.url, async (client) => {
    await stageSourceReviewItem(client, moveLogStage)
    await approveSourceReviewItem(client, "src-boc-move-1", "reviewer.test")
    return publishApprovedReviewItem(
      client,
      (await listSourceReviewItems(client, { status: "approved" })).find((item) => item.id === "src-boc-move-1")!,
      idempotencyKey,
    )
  })
}

afterAll(async () => {
  await Promise.all(created.map((database) => database.drop()))
})

describe("operator publishing workflow", () => {
  let database: DisposableDatabase

  beforeAll(async () => {
    database = await migratedDatabase()
    await seedBocEvent(database)
  })

  it("reviews intake and publishes approved evidence with a verified checkpoint", async () => {
    const evidenceStage = {
      id: "src-boc-evidence-focused",
      eventId: "evt-boc-cut",
      stagedBy: "operator.test",
      candidate: {
        kind: "evidence" as const,
        evidence: { ...SYNTH.cpiEvidence, id: "ev-boc-cpi-focused" },
      },
    }
    await withClient(database.url, async (client) => {
      await stageSourceReviewItem(client, evidenceStage)
      await approveSourceReviewItem(client, "src-boc-evidence-focused", "reviewer.test")
      expect(await listSourceReviewItems(client, { status: "staged" })).toHaveLength(0)
      const result = await publishApprovedReviewItem(
        client,
        (await getSourceReviewItem(client, "src-boc-evidence-focused"))!,
        "idem-evidence-focused",
      )
      expect(result.summary.evidence.appended).toBe(1)
      expect(await verifyCheckpointDigest(client, result.summary.checkpoint.id)).toBe("ok")
    })
  })

  it("publishes an authored Move Log whose explained share stays unknown (null, not zero)", async () => {
    const db = await migratedDatabase()
    await seedBocEvent(db)
    await publishCpiEvidence(db)
    await publishAuthoredMoveLog(db, "idem-move-focused")

    await withClient(db.url, async (client) => {
      const history = await readMoveLogHistory(client, "evt-boc-cut")
      const revision = history.find((row) => row.moveLogId === "ml-boc-cut-sep26")
      expect(revision?.explainedPct).toBeNull()
      expect(revision?.whatChanged).toContain("CPI print")
    })

    const pool = new Pool({ connectionString: db.url })
    try {
      const event = await new PostgresIntelligenceRepository(pool).getEvent("evt-boc-cut")
      expect(event?.explained).toBeNull()
      expect(event?.explained).not.toBe(0)
    } finally {
      await pool.end()
    }
  })

  it("publishes a Move Log correction as a new revision without invalidating earlier checkpoints", async () => {
    const db = await migratedDatabase()
    await seedBocEvent(db)
    const first = await publishCpiEvidence(db)
    await publishAuthoredMoveLog(db, "idem-move-focused")
    const firstCheckpointId = first.summary.checkpoint.id

    const correctionBundle = parseEventBundle({
      eventId: "evt-boc-cut",
      moveLogRevisions: [
        {
          moveLogId: "ml-boc-cut-sep26",
          version: 2,
          publishedAt: SYNTH.correctionPublishedAt,
          author: "A. Operator",
          whatChanged: "Clarified that the move followed the CPI detail, not the headline alone.",
          likelyCause: "Desk commentary focused on the core CPI path.",
          unexplainedFactors: ["Whether the BoC reacts to one month of data"],
          evidenceIds: [SYNTH.cpiEvidence.id],
          correctionNote: "First version overstated headline-only attribution.",
          provenance: "sourced",
        },
      ],
    })

    await withClient(db.url, async (client) => {
      expect(await verifyCheckpointDigest(client, firstCheckpointId)).toBe("ok")
      await publishEventBundle(client, correctionBundle, { idempotencyKey: "idem-correction-focused" })
      expect(await verifyCheckpointDigest(client, firstCheckpointId)).toBe("ok")
      const history = await readMoveLogHistory(client, "evt-boc-cut")
      expect(history.filter((row) => row.moveLogId === "ml-boc-cut-sep26")).toHaveLength(2)
    })
  })

  it("retries checkpoint publication after a simulated publisher failure", async () => {
    const db = await migratedDatabase()
    await seedBocEvent(db)

    const originalPublish = historyCheckpoint.publishHistoryCheckpoint
    let publishCalls = 0
    vi.spyOn(historyCheckpoint, "publishHistoryCheckpoint").mockImplementation(async (client, eventId) => {
      publishCalls += 1
      if (publishCalls === 1) throw new Error("simulated checkpoint publisher failure")
      return originalPublish(client, eventId)
    })

    const retryBundle = parseEventBundle({
      eventId: "evt-boc-cut",
      evidence: [SYNTH.retryEvidence],
    })

    try {
      await withClient(db.url, async (client) => {
        await expect(
          publishEventBundle(client, retryBundle, { idempotencyKey: "idem-retry-focused" }),
        ).rejects.toThrow(/simulated checkpoint/)
        const op = await getPublicationOperation(client, "idem-retry-focused")
        expect(op?.status).toBe("checkpoint_pending")
        const { rows } = await client.query("SELECT count(*)::int AS count FROM evidence WHERE id = $1", [
          SYNTH.retryEvidence.id,
        ])
        expect(rows[0].count).toBe(1)
        const retry = await retryPublicationOperation(client, "idem-retry-focused")
        expect(retry.summary.evidence.unchanged).toBe(1)
        expect((await getPublicationOperation(client, "idem-retry-focused"))?.status).toBe("completed")
      })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("reviews intake, publishes evidence and an authored Move Log, corrects, and retries checkpoint publication", async () => {
    const db = await migratedDatabase()
    await seedBocEvent(db)

    const evidenceStage = {
      id: "src-boc-evidence-1",
      eventId: "evt-boc-cut",
      stagedBy: "operator.test",
      intakeNote: "CPI detail from StatsCan release",
      candidate: { kind: "evidence" as const, evidence: SYNTH.cpiEvidence },
    }

    await withClient(db.url, async (client) => {
      await stageSourceReviewItem(client, evidenceStage)
      await approveSourceReviewItem(client, "src-boc-evidence-1", "reviewer.test", "Source URL verified.")
      expect(await listSourceReviewItems(client, { status: "staged" })).toHaveLength(0)
    })

    let firstCheckpointId = 0
    await withClient(db.url, async (client) => {
      const result = await publishApprovedReviewItem(
        client,
        (await getSourceReviewItem(client, "src-boc-evidence-1"))!,
        "idem-evidence-1",
      )
      expect(result.summary.evidence.appended).toBe(1)
      firstCheckpointId = result.summary.checkpoint.id
      expect(await verifyCheckpointDigest(client, firstCheckpointId)).toBe("ok")
    })

    await publishAuthoredMoveLog(db)

    const pool = new Pool({ connectionString: db.url })
    try {
      const repository = new PostgresIntelligenceRepository(pool)
      const event = await repository.getEvent("evt-boc-cut")
      expect(event?.evidence.some((item) => item.id === SYNTH.cpiEvidence.id)).toBe(true)
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
          publishedAt: SYNTH.correctionPublishedAt,
          author: "A. Operator",
          whatChanged: "Clarified that the move followed the CPI detail, not the headline alone.",
          likelyCause: "Desk commentary focused on the core CPI path.",
          unexplainedFactors: ["Whether the BoC reacts to one month of data"],
          evidenceIds: [SYNTH.cpiEvidence.id],
          correctionNote: "First version overstated headline-only attribution.",
          provenance: "sourced",
        },
      ],
    })

    await withClient(db.url, async (client) => {
      expect(await verifyCheckpointDigest(client, firstCheckpointId)).toBe("ok")
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
      evidence: [{ ...SYNTH.retryEvidence, id: "ev-boc-retry-e2e" }],
    })

    try {
      await withClient(db.url, async (client) => {
        await expect(publishEventBundle(client, retryBundle, { idempotencyKey: "idem-retry-1" })).rejects.toThrow(
          /simulated checkpoint/,
        )
        const op = await getPublicationOperation(client, "idem-retry-1")
        expect(op?.status).toBe("checkpoint_pending")
        const retry = await retryPublicationOperation(client, "idem-retry-1")
        expect(retry.summary.evidence.unchanged).toBe(1)
        expect((await getPublicationOperation(client, "idem-retry-1"))?.status).toBe("completed")
      })
    } finally {
      vi.restoreAllMocks()
    }
  })
})
