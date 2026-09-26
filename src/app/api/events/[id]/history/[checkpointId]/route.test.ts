// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/events/[id]/history/[checkpointId]/route"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import {
  ARBITRARY_TIME_UNSUPPORTED,
  DEMO_RECONSTRUCTION_UNSUPPORTED,
  type HistoricalReconstruction,
  type ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"
import { failingRepository, fakeRepository, testEvent } from "@/test/fake-repository"

const CHECKPOINT = "1"
const params = (id: string, checkpointId: string) => ({ params: Promise.resolve({ id, checkpointId }) })

const reconstruction: HistoricalReconstruction = {
  eventId: "evt-replay",
  checkpoint: { id: CHECKPOINT, sequence: 1, contentMd5: "ab".repeat(16), memberCount: 1 },
  coverage: {
    semanticEventFieldsFrom: "2026-09-26T00:00:00.000Z",
    recordAvailabilityRealignedAt: "2026-09-26T00:00:00.000Z",
    semanticHistory: "recorded",
    preBaselineEventRevisions: "not_recorded",
  },
  provenance: "sourced",
  semantics: {
    version: 1,
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
    provenance: "sourced",
    correctionNote: null,
    recordedAt: "2026-09-01T00:00:00.000Z",
  },
  observations: [],
  evidence: [],
  moveLogs: [],
}

function keys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keys(item, into)
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.add(key)
      keys(child, into)
    }
  }
  return into
}

afterEach(() => {
  __resetRepositoryForTests()
  vi.restoreAllMocks()
})

describe("GET /api/events/:id/history/:checkpointId", () => {
  it("returns the historical view and not an AionEvent projection", async () => {
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: "CURRENT_TITLE_LEAK" })], {
        storage: "database",
        reconstructEvent: async () => ({ outcome: "reconstruction", reconstruction }),
      }),
    )
    const response = await GET(
      new Request(`http://omen.test/api/events/evt-replay/history/${CHECKPOINT}`),
      params("evt-replay", CHECKPOINT),
    )
    expect(response.status).toBe(200)
    const text = await response.text()
    const body = JSON.parse(text) as { checkpoint: { id: string; contentMd5: string } }
    expect(body).toMatchObject({
      storage: "database",
      outcome: "reconstruction",
      provenance: "sourced",
      checkpoint: { id: CHECKPOINT, contentMd5: "ab".repeat(16) },
      semantics: { title: "Original recorded title", tags: ["original-tag"], relatedEventIds: ["evt-original-link"] },
    })
    expect(body.checkpoint).not.toHaveProperty("contentSha256")
    expect(text).toContain(`"id":"${CHECKPOINT}"`)
    const present = keys(body)
    for (const forbidden of [
      "display",
      "signals",
      "analogues",
      "timeline",
      "anomaly",
      "catalogPosition",
      "followedByDefault",
      "expectationHistory",
      "previousProbability",
      "probability",
      "probabilitySeries",
      "relatedMarkets",
      "relatedEvents",
      "sigma",
      "contentSha256",
    ]) {
      expect(present.has(forbidden), forbidden).toBe(false)
    }
    expect(text).not.toContain("CURRENT_TITLE_LEAK")
  })

  it("distinguishes invalid input, unknown events, missing checkpoints, pre-coverage, verification failure and storage failure", async () => {
    const outcomes = new Map<string, ReconstructionOutcome>([
      ["evt-missing", { outcome: "unknown_event" }],
      ["evt-none", { outcome: "missing_checkpoint", message: "No verified history checkpoint matches this event." }],
      ["evt-bad", { outcome: "verification_failed", message: "Checkpoint 1 failed verification (digest-mismatch)." }],
      [
        "evt-legacy",
        {
          outcome: "pre_coverage",
          reconstruction: {
            ...reconstruction,
            eventId: "evt-legacy",
            semantics: null,
            provenance: "demo",
            coverage: { ...reconstruction.coverage, semanticHistory: "unavailable" },
          },
        },
      ],
    ])
    __resetRepositoryForTests(
      fakeRepository([], {
        storage: "database",
        reconstructEvent: async (eventId) => outcomes.get(eventId) ?? { outcome: "unknown_event" },
      }),
    )

    const invalid = await GET(new Request("http://omen.test/api/events/NOPE/history/nope"), params("NOPE", "nope"))
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ outcome: "invalid_request" })

    const unknown = await GET(
      new Request(`http://omen.test/api/events/evt-missing/history/${CHECKPOINT}`),
      params("evt-missing", CHECKPOINT),
    )
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({ outcome: "unknown_event" })

    const missing = await GET(
      new Request(`http://omen.test/api/events/evt-none/history/${CHECKPOINT}`),
      params("evt-none", CHECKPOINT),
    )
    expect(missing.status).toBe(422)
    expect(await missing.json()).toMatchObject({ outcome: "missing_checkpoint" })

    const failed = await GET(
      new Request(`http://omen.test/api/events/evt-bad/history/${CHECKPOINT}`),
      params("evt-bad", CHECKPOINT),
    )
    expect(failed.status).toBe(422)
    expect(await failed.json()).toMatchObject({ outcome: "verification_failed" })

    const preCoverage = await GET(
      new Request(`http://omen.test/api/events/evt-legacy/history/${CHECKPOINT}`),
      params("evt-legacy", CHECKPOINT),
    )
    expect(preCoverage.status).toBe(409)
    const preBody = await preCoverage.json()
    expect(preBody.outcome).toBe("pre_coverage")
    expect(preBody.semantics).toBeNull()
    expect(preBody.coverage.semanticHistory).toBe("unavailable")
    expect(preBody.coverage.preBaselineEventRevisions).toBe("not_recorded")

    vi.spyOn(console, "error").mockImplementation(() => undefined)
    __resetRepositoryForTests(failingRepository("connection refused", "database"))
    const unavailable = await GET(
      new Request(`http://omen.test/api/events/evt-replay/history/${CHECKPOINT}`),
      params("evt-replay", CHECKPOINT),
    )
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toEqual({
      storage: "database",
      outcome: "unavailable",
      error: "Event storage is unavailable",
    })
  })

  it("refuses a UTC cutoff without reading storage", async () => {
    const reconstructEvent = vi.fn(async (): Promise<ReconstructionOutcome> => {
      throw new Error("storage should not be read")
    })
    __resetRepositoryForTests(fakeRepository([testEvent({ id: "evt-replay", title: "Demo decision" })], { reconstructEvent }))
    const response = await GET(
      new Request(`http://omen.test/api/events/evt-replay/history/${CHECKPOINT}?at=2026-09-01T00:00:00Z`),
      params("evt-replay", CHECKPOINT),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      storage: "demo",
      outcome: "unsupported_history",
      error: ARBITRARY_TIME_UNSUPPORTED,
    })
    expect(reconstructEvent).not.toHaveBeenCalled()
  })

  it("does not turn demo storage into a historical view of the current book", async () => {
    __resetRepositoryForTests(fakeRepository([testEvent({ id: "evt-boc-cut", title: "Bank of Canada cuts rates in October" })]))
    const response = await GET(
      new Request(`http://omen.test/api/events/evt-boc-cut/history/${CHECKPOINT}`),
      params("evt-boc-cut", CHECKPOINT),
    )
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body).toEqual({
      storage: "demo",
      outcome: "unsupported_history",
      error: DEMO_RECONSTRUCTION_UNSUPPORTED,
    })
    expect(JSON.stringify(body)).not.toContain("Bank of Canada")
  })
})
