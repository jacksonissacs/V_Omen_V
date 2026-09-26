import { readFileSync } from "node:fs"
import path from "node:path"

import { Pool, type ClientBase } from "pg"
import { afterAll, describe, expect, it, vi } from "vitest"

import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { isPositiveInt8Text } from "@/lib/db/bigint-id"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { readMoveLogHistory } from "@/lib/db/event-reader"
import { writeEventBundle } from "@/lib/db/event-store"
import * as historyCheckpoint from "@/lib/db/history-checkpoint"
import { importIntakeVersion } from "@/lib/db/intake-bridge"
import {
  getPublicationOperation,
  publishApprovedReviewItem,
  publishEventBundle,
  retryPublicationOperation,
  verifyCheckpointDigest,
} from "@/lib/db/publication"
import { approveSourceReviewItem, getSourceReviewItem, stageSourceReviewItem } from "@/lib/db/source-review"
import type { IntakeVersion } from "@/lib/intake/types"
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

function capture(overrides: Partial<IntakeVersion> = {}): IntakeVersion {
  return {
    id: "cisa-kev-cve-2026-0001-v1",
    sourceId: "cisa-kev",
    sourceItemId: "CVE-2026-0001",
    version: 1,
    canonicalUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json#CVE-2026-0001",
    title: "Example product vulnerability",
    excerpt: "A captured catalog excerpt with no probability.",
    sourcePublishedAt: null,
    sourcePublishedDate: "2026-09-01",
    firstFetchedAt: "2026-09-02T12:00:00.000Z",
    contentIdentity: "a".repeat(64),
    vendorProject: "Example",
    product: "Widget",
    candidateEventId: "evt-boc-cut",
    association: "operator",
    reviewState: "selected",
    priorVersionId: null,
    ...overrides,
  }
}

async function observationCount(url: string) {
  return withClient(url, async (client) => {
    const { rows } = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM probability_observations WHERE event_id = 'evt-boc-cut'",
    )
    return rows[0]!.count
  })
}

async function evidenceCount(url: string, id: string) {
  return withClient(url, async (client) => {
    const { rows } = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM evidence WHERE id = $1",
      [id],
    )
    return rows[0]!.count
  })
}

describe("intake publication bridge", () => {
  it("imports, reviews, publishes, corrects, and retries without inventing a probability or a publication time", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
    })
    const beforeObservations = await observationCount(database.url)

    await withClient(database.url, async (client) => {
      const staged = await importIntakeVersion(client, capture(), "operator.test")
      expect(staged.action).toBe("staged")
      expect(staged.item.status).toBe("staged")
      expect(staged.item.sourcePublishedDate).toBe("2026-09-01")
      expect(staged.item.sourcePublishedAt).toBeNull()
      const again = await importIntakeVersion(client, capture(), "operator.test")
      expect(again.action).toBe("unchanged")
      expect(again.item.id).toBe(staged.item.id)
      const { rows } = await client.query("SELECT count(*)::int AS count FROM source_review_items")
      expect(rows[0].count).toBe(1)
      await expect(approveSourceReviewItem(client, staged.item.id, "reviewer.test")).rejects.toThrow(/stance and reliability/)
    })
    expect(await evidenceCount(database.url, "ev-cisa-kev-cve-2026-0001-v1")).toBe(0)
    expect(await observationCount(database.url)).toBe(beforeObservations)

    let evidenceCheckpoint = ""
    await withClient(database.url, async (client) => {
      await approveSourceReviewItem(client, capture().id, "reviewer.test", "Catalog entry checked.", {
        stance: "contextual",
        reliability: 0.4,
      })
      const approved = (await getSourceReviewItem(client, capture().id))!
      const result = await publishApprovedReviewItem(client, approved, "idem-intake-evidence")
      expect(result.summary.evidence.appended).toBe(1)
      expect(result.summary.observations.appended).toBe(0)
      evidenceCheckpoint = result.summary.checkpoint.id
      expect(isPositiveInt8Text(evidenceCheckpoint)).toBe(true)
      expect(result.operation.checkpointId).toBe(evidenceCheckpoint)
      expect(await verifyCheckpointDigest(client, evidenceCheckpoint)).toBe("ok")
      const { rows } = await client.query<{ source_published_at: Date | null }>(
        "SELECT source_published_at FROM evidence WHERE id = $1",
        ["ev-cisa-kev-cve-2026-0001-v1"],
      )
      expect(rows[0]!.source_published_at).toBeNull()
    })

    await withClient(database.url, async (client) => {
      await stageAndApproveMove(client, "src-intake-move-1", 1)
      const item = (await getSourceReviewItem(client, "src-intake-move-1"))!
      await publishApprovedReviewItem(client, item, "idem-intake-move")
      const history = await readMoveLogHistory(client, "evt-boc-cut")
      const revision = history.find((row) => row.moveLogId === "ml-intake-sep")
      expect(revision?.explainedPct).toBeNull()
      expect(revision?.version).toBe(1)
    })

    const pool = new Pool({ connectionString: database.url })
    try {
      const repository = new PostgresIntelligenceRepository(pool)
      const event = await repository.getEvent("evt-boc-cut")
      expect(event?.explained).toBeNull()
      expect(event?.explained).not.toBe(0)
    } finally {
      await pool.end()
    }

    await withClient(database.url, async (client) => {
      const correction = parseEventBundle({
        eventId: "evt-boc-cut",
        moveLogRevisions: [
          {
            moveLogId: "ml-intake-sep",
            version: 2,
            publishedAt: "2026-09-21T16:00:00.000Z",
            author: "A. Operator",
            whatChanged: "Corrected the cited catalog wording.",
            likelyCause: "The first note quoted the excerpt too narrowly.",
            unexplainedFactors: ["Whether the vendor ships a fix"],
            evidenceIds: ["ev-cisa-kev-cve-2026-0001-v1"],
            correctionNote: "Version 1 omitted the vendor qualifier.",
            provenance: "sourced",
          },
        ],
      })
      await publishEventBundle(client, correction, { idempotencyKey: "idem-intake-correction" })
      expect(await verifyCheckpointDigest(client, evidenceCheckpoint)).toBe("ok")
      const history = await readMoveLogHistory(client, "evt-boc-cut")
      expect(history.filter((row) => row.moveLogId === "ml-intake-sep")).toHaveLength(2)
    })

    const replayPool = new Pool({ connectionString: database.url })
    try {
      const repository = new PostgresIntelligenceRepository(replayPool)
      const replay = await repository.reconstructEvent("evt-boc-cut", evidenceCheckpoint)
      expect(replay.outcome).toBe("reconstruction")
      if (replay.outcome !== "reconstruction") return
      expect(replay.reconstruction.evidence.map((item) => item.id)).toContain("ev-cisa-kev-cve-2026-0001-v1")
      expect(replay.reconstruction.moveLogs.some((row) => row.correctionNote)).toBe(false)
      expect(replay.reconstruction.checkpoint.id).toBe(evidenceCheckpoint)
      const evidence = replay.reconstruction.evidence.find((item) => item.id === "ev-cisa-kev-cve-2026-0001-v1")
      expect(evidence?.sourcePublishedAt).toBeNull()
    } finally {
      await replayPool.end()
    }

    const originalPublish = historyCheckpoint.publishHistoryCheckpoint
    let publishCalls = 0
    vi.spyOn(historyCheckpoint, "publishHistoryCheckpoint").mockImplementation(async (client, eventId) => {
      publishCalls += 1
      if (publishCalls === 1) throw new Error("simulated checkpoint publisher failure")
      return originalPublish(client, eventId)
    })
    try {
      const retryBundle = parseEventBundle({
        eventId: "evt-boc-cut",
        evidence: [
          {
            id: "ev-intake-retry",
            sourceName: "Retry probe",
            sourcePublishedAt: null,
            firstObservedAt: "2026-09-05T17:00:00.000Z",
            capturedAt: "2026-09-05T17:01:00.000Z",
            summary: "Row used to exercise checkpoint retry.",
            stance: "contextual",
            reliability: 0.5,
            recordedBy: "operator.test",
            provenance: "sourced",
          },
        ],
      })
      await withClient(database.url, async (client) => {
        const before = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM history_checkpoints WHERE event_id = 'evt-boc-cut'",
        )
        await expect(publishEventBundle(client, retryBundle, { idempotencyKey: "idem-intake-retry" })).rejects.toThrow(
          /simulated checkpoint/,
        )
        expect((await getPublicationOperation(client, "idem-intake-retry"))?.status).toBe("checkpoint_pending")
        const retry = await retryPublicationOperation(client, "idem-intake-retry")
        expect(retry.summary.evidence.unchanged).toBe(1)
        expect((await getPublicationOperation(client, "idem-intake-retry"))?.status).toBe("completed")
        expect(await evidenceCount(database.url, "ev-intake-retry")).toBe(1)
        const after = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM history_checkpoints WHERE event_id = 'evt-boc-cut'",
        )
        expect(after.rows[0]!.count).toBe(before.rows[0]!.count + 1)
        const logs = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM move_log_revisions WHERE move_log_id = 'ml-intake-sep'",
        )
        expect(logs.rows[0]!.count).toBe(2)
      })
    } finally {
      vi.restoreAllMocks()
    }

    expect(await observationCount(database.url)).toBe(beforeObservations)
  })

  it("does not let a changed source version inherit approval", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
      const first = await importIntakeVersion(client, capture(), "operator.test")
      await approveSourceReviewItem(client, first.item.id, "reviewer.test", undefined, {
        stance: "contextual",
        reliability: 0.4,
      })
      const second = await importIntakeVersion(
        client,
        capture({
          id: "cisa-kev-cve-2026-0001-v2",
          version: 2,
          excerpt: "The catalog text changed.",
          contentIdentity: "b".repeat(64),
          priorVersionId: first.item.id,
          firstFetchedAt: "2026-09-03T12:00:00.000Z",
        }),
        "operator.test",
      )
      expect(second.action).toBe("staged")
      expect(second.item.status).toBe("staged")
      expect((await getSourceReviewItem(client, first.item.id))?.status).toBe("approved")
      const stale = { ...second.item, status: "approved" as const }
      await expect(publishApprovedReviewItem(client, stale, "idem-v2")).rejects.toThrow(/must be approved/)
      expect(await evidenceCount(database.url, "ev-cisa-kev-cve-2026-0001-v2")).toBe(0)
    })
  })

  it("does not publish a rejected capture through a stale approved object", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
      const staged = await importIntakeVersion(client, capture(), "operator.test")
      const approved = await approveSourceReviewItem(client, staged.item.id, "reviewer.test", undefined, {
        stance: "contextual",
        reliability: 0.4,
      })
      const rejected = await importIntakeVersion(client, capture({ reviewState: "rejected" }), "operator.test")
      expect(rejected.action).toBe("rejected")
      expect(rejected.item.status).toBe("rejected")
      await expect(publishApprovedReviewItem(client, approved, "idem-rejected")).rejects.toThrow(/must be approved/)
      const again = await importIntakeVersion(client, capture({ reviewState: "rejected" }), "operator.test")
      expect(again.item.id).toBe(staged.item.id)
      const { rows } = await client.query("SELECT count(*)::int AS count FROM source_review_items")
      expect(rows[0].count).toBe(1)
    })
    expect(await evidenceCount(database.url, "ev-cisa-kev-cve-2026-0001-v1")).toBe(0)
  })

  it("refuses a missing event, a pending item, and a rejected item that was never staged", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
      await expect(
        importIntakeVersion(client, capture({ candidateEventId: "evt-not-stored" }), "operator.test"),
      ).rejects.toThrow(/not stored/)
      await expect(importIntakeVersion(client, capture({ reviewState: "pending" }), "operator.test")).rejects.toThrow(
        /pending/,
      )
      await expect(importIntakeVersion(client, capture({ reviewState: "rejected" }), "operator.test")).rejects.toThrow(
        /not staged/,
      )
      const { rows } = await client.query("SELECT count(*)::int AS count FROM source_review_items")
      expect(rows[0].count).toBe(0)
    })
  })

  it("serializes concurrent checkpoint retries without a second evidence row or checkpoint", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
    })
    const originalPublish = historyCheckpoint.publishHistoryCheckpoint
    let publishCalls = 0
    vi.spyOn(historyCheckpoint, "publishHistoryCheckpoint").mockImplementation(async (client, eventId) => {
      publishCalls += 1
      if (publishCalls === 1) throw new Error("simulated checkpoint publisher failure")
      return originalPublish(client, eventId)
    })
    const bundle = parseEventBundle({
      eventId: "evt-boc-cut",
      evidence: [
        {
          id: "ev-concurrent-retry",
          sourceName: "Concurrent retry",
          sourcePublishedAt: null,
          firstObservedAt: "2026-09-06T10:00:00.000Z",
          capturedAt: "2026-09-06T10:01:00.000Z",
          summary: "Concurrent retry probe.",
          stance: "contextual",
          reliability: 0.5,
          recordedBy: "operator.test",
          provenance: "sourced",
        },
      ],
    })
    try {
      await withClient(database.url, async (client) => {
        await expect(publishEventBundle(client, bundle, { idempotencyKey: "idem-concurrent" })).rejects.toThrow(
          /simulated checkpoint/,
        )
      })
      const [left, right] = await Promise.all([
        withClient(database.url, (client) => retryPublicationOperation(client, "idem-concurrent")),
        withClient(database.url, (client) => retryPublicationOperation(client, "idem-concurrent")),
      ])
      expect(left.operation.status).toBe("completed")
      expect(right.operation.status).toBe("completed")
      expect(left.operation.checkpointId).toBe(right.operation.checkpointId)
      expect(await evidenceCount(database.url, "ev-concurrent-retry")).toBe(1)
      await withClient(database.url, async (client) => {
        const checkpoints = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM history_checkpoints
            WHERE event_id = 'evt-boc-cut'
              AND id > (SELECT min(id) FROM history_checkpoints WHERE event_id = 'evt-boc-cut')`,
        )
        expect(checkpoints.rows[0]!.count).toBe(1)
        const operations = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM publication_operations WHERE idempotency_key = 'idem-concurrent'",
        )
        expect(operations.rows[0]!.count).toBe(1)
      })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("keeps a checkpoint id that is not a safe JavaScript number", async () => {
    const database = await migratedDatabase()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, seedBundle())
      await client.query(
        `INSERT INTO publication_operations (
           id, idempotency_key, event_id, status, bundle, checkpoint_id, checkpoint_sequence
         ) VALUES (
           'pub-bigint-probe', 'idem-bigint', 'evt-boc-cut', 'completed',
           '{"eventId":"evt-boc-cut","observations":[],"evidence":[],"moveLogRevisions":[]}'::jsonb,
           9007199254740993, 1
         )`,
      )
      const operation = await getPublicationOperation(client, "idem-bigint")
      expect(operation?.checkpointId).toBe("9007199254740993")
    })
  })
})

async function stageAndApproveMove(client: ClientBase, id: string, version: number) {
  await stageSourceReviewItem(client, {
    id,
    eventId: "evt-boc-cut",
    stagedBy: "operator.test",
    candidate: {
      kind: "move_log",
      moveLog: {
        moveLogId: "ml-intake-sep",
        version,
        publishedAt: "2026-09-20T15:00:00.000Z",
        author: "A. Operator",
        observedChange: "The catalog entry was attached to the tracked question.",
        citedEvidenceIds: ["ev-cisa-kev-cve-2026-0001-v1"],
        interpretation: "The entry is context for the question, not a probability.",
        remainsUnknown: ["Whether the vendor ships a fix"],
        provenance: "sourced",
      },
    },
  })
  await approveSourceReviewItem(client, id, "reviewer.test")
}
