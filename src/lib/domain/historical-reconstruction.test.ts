import { describe, expect, it } from "vitest"

import {
  ARBITRARY_TIME_UNSUPPORTED,
  assembleHistoricalReconstruction,
  HistoricalReconstructionError,
  validateReconstructionRequest,
  type HistoricalEvidence,
  type HistoricalMoveLog,
  type HistoricalObservation,
  type HistoricalSemantics,
  type ReconstructionMembers,
} from "@/lib/domain/historical-reconstruction"

const coverage = {
  semanticEventFieldsFrom: "2026-09-26T00:00:00.000Z",
  recordAvailabilityRealignedAt: "2026-09-26T00:00:00.000Z",
  semanticHistory: "recorded" as const,
  preBaselineEventRevisions: "not_recorded" as const,
}

function semantics(version: number, title: string, extra: Partial<HistoricalSemantics> = {}): HistoricalSemantics {
  return {
    version,
    title,
    question: `Will version ${version} remain the recorded question?`,
    status: version === 1 ? "active" : "resolved",
    deadline: version === 1 ? "2026-10-01T00:00:00.000Z" : "2026-12-31T00:00:00.000Z",
    resolutionCriteria: `Version ${version} criteria are at least twenty characters.`,
    category: "Economics",
    significance: "high",
    region: "Canada",
    summary: `Summary for version ${version}.`,
    tags: version === 1 ? ["original-tag"] : ["leaked-tag"],
    relatedEventIds: version === 1 ? ["evt-original-link"] : ["evt-leaked-link"],
    provenance: "demo",
    correctionNote: version === 1 ? null : "Later semantic correction.",
    recordedAt: `2026-09-0${version}T00:00:00.000Z`,
    ...extra,
  }
}

function observation(id: string, probabilityPct: number): HistoricalObservation {
  return {
    id,
    sourceKind: "provider",
    sourceName: "desk",
    probabilityType: "market_implied",
    probabilityPct,
    observedAt: "2026-09-01T00:00:00.000Z",
    capturedAt: "2026-09-01T00:01:00.000Z",
    note: null,
    provenance: "demo",
  }
}

function evidence(id: string, summary: string): HistoricalEvidence {
  return {
    id,
    sourceName: "source",
    sourceUrl: null,
    sourcePublishedAt: "2020-01-01T00:00:00.000Z",
    firstObservedAt: "2026-09-01T00:00:00.000Z",
    capturedAt: "2026-09-01T00:01:00.000Z",
    summary,
    stance: "supports",
    reliability: 0.5,
    recordedBy: "tester",
    provenance: "demo",
  }
}

function moveLog(version: number, whatChanged: string, evidenceIds: string[]): HistoricalMoveLog {
  return {
    id: `rev-${version}`,
    moveLogId: "ml-replay",
    version,
    publishedAt: `2026-09-0${version}T00:00:00.000Z`,
    recordedAt: `2026-09-0${version}T00:05:00.000Z`,
    author: "tester",
    whatChanged,
    likelyCause: version === 1 ? "original cause" : "corrected cause",
    explainedPct: version === 1 ? 40 : 10,
    unexplainedFactors: [],
    evidenceIds,
    correctionNote: version === 1 ? null : "Later move-log correction.",
    provenance: "demo",
  }
}

function members(overrides: Partial<ReconstructionMembers> = {}): ReconstructionMembers {
  return {
    eventId: "evt-replay",
    checkpoint: { id: "11111111-1111-4111-8111-111111111111", sequence: 1, contentSha256: "a".repeat(64), memberCount: 3 },
    coverage,
    observations: [observation("1", 55)],
    evidence: [evidence("ev-original", "Original evidence")],
    semanticRevisions: [semantics(1, "Original recorded title")],
    moveLogRevisions: [moveLog(1, "Original move log", ["ev-original"])],
    ...overrides,
  }
}

describe("historical reconstruction assembly", () => {
  it("rejects malformed event and checkpoint ids", () => {
    expect(validateReconstructionRequest("NOPE", "11111111-1111-4111-8111-111111111111")?.message).toMatch(/Event id/)
    expect(validateReconstructionRequest("evt-replay", "not-a-uuid")?.message).toMatch(/UUID/)
    expect(validateReconstructionRequest("evt-replay", "11111111-1111-4111-8111-111111111111")).toBeUndefined()
  })

  it("keeps the eligible revision when a later revision is absent from the checkpoint", () => {
    const view = assembleHistoricalReconstruction(members())
    expect(view.semantics).toMatchObject({
      version: 1,
      title: "Original recorded title",
      status: "active",
      tags: ["original-tag"],
      relatedEventIds: ["evt-original-link"],
    })
    expect(view.moveLogs).toEqual([expect.objectContaining({ version: 1, whatChanged: "Original move log", explainedPct: 40 })])
    expect(view.evidence.map((item) => item.summary)).toEqual(["Original evidence"])
    expect(view.observations.map((item) => item.probabilityPct)).toEqual([55])
    expect(view).not.toHaveProperty("display")
    expect(JSON.stringify(view)).not.toContain("leaked-tag")
    expect(JSON.stringify(view)).not.toContain("DISPLAY_LEAK_TOKEN")
  })

  it("selects the latest member revision and still drops a newer non-member", () => {
    const view = assembleHistoricalReconstruction(
      members({
        semanticRevisions: [semantics(1, "Original recorded title"), semantics(2, "Second recorded title")],
        moveLogRevisions: [
          moveLog(1, "Original move log", ["ev-original"]),
          moveLog(2, "Second move log", ["ev-original"]),
        ],
        evidence: [evidence("ev-original", "Original evidence")],
      }),
    )
    expect(view.semantics?.version).toBe(2)
    expect(view.semantics?.title).toBe("Second recorded title")
    expect(view.moveLogs).toHaveLength(1)
    expect(view.moveLogs[0]).toMatchObject({ version: 2, whatChanged: "Second move log" })
    expect(JSON.stringify(view)).not.toContain("Original move log")
    expect(JSON.stringify(view)).not.toContain("version 3")
  })

  it("refuses an interpretation whose evidence is not a checkpoint member", () => {
    expect(() =>
      assembleHistoricalReconstruction(
        members({
          moveLogRevisions: [moveLog(2, "CORRECTED_MOVE_LEAK", ["ev-original", "ev-later"])],
        }),
      ),
    ).toThrow(HistoricalReconstructionError)
  })

  it("returns null semantics for pre-coverage checkpoints and does not invent a title", () => {
    const view = assembleHistoricalReconstruction(
      members({
        coverage: { ...coverage, semanticHistory: "unavailable" },
        semanticRevisions: [],
      }),
    )
    expect(view.semantics).toBeNull()
    expect(view.provenance).toBe("demo")
    expect(view.observations).toHaveLength(1)
    expect(JSON.stringify(view)).not.toContain("Original recorded title")
  })

  it("states that arbitrary-time replay is unsupported", () => {
    expect(ARBITRARY_TIME_UNSUPPORTED).toMatch(/not a verified visibility boundary/)
  })
})
