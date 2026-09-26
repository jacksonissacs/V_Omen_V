import { describe, expect, it } from "vitest"

import { assemble, type MoveLogRevisionRecord } from "@/lib/db/event-reader"

const deadline = new Date("2026-12-01T00:00:00.000Z")

function eventRow(provenance: "demo" | "sourced", display: Record<string, unknown> = {}) {
  return {
    id: "evt-stored",
    title: "Stored question",
    question: "Will it resolve on the scheduled date?",
    status: "active" as const,
    deadline,
    resolution_criteria: "Resolves YES if the scheduled decision matches the stated condition.",
    category: "Economics" as const,
    significance: "low" as const,
    region: "Test",
    summary: "A stored summary.",
    tags: [],
    related_event_ids: [],
    provenance,
    followed_by_default: false,
    display,
    updated_at: deadline,
  }
}

function observation(
  sourceName: string,
  probabilityType: "market_implied" | "forecaster_estimate",
  probability: number,
  observedAt: string,
  capturedAt: string,
  provenance: "demo" | "sourced",
) {
  return {
    event_id: "evt-stored",
    source_kind: probabilityType === "market_implied" ? ("provider" as const) : ("author" as const),
    source_name: sourceName,
    probability_type: probabilityType,
    probability_pct: probability,
    observed_at: new Date(observedAt),
    captured_at: new Date(capturedAt),
    note: null,
    provenance,
  }
}

describe("assemble", () => {
  it("leaves a one-point series without a fabricated change, sigma, tier, or attribution", () => {
    const event = assemble(
      eventRow("sourced", { sigma: 4.7, confidence: "High" }),
      [observation("Desk", "market_implied", 41, "2026-09-04T00:00:00.000Z", "2026-09-04T00:05:00.000Z", "sourced")],
      [],
      [],
    )

    expect(event?.probability).toBe(41)
    expect(event?.previousProbability).toBeNull()
    expect(event?.change).toBeNull()
    expect(event?.sigma).toBeNull()
    expect(event?.confidence).toBeNull()
    expect(event?.sourceTier).toBeNull()
    expect(event?.explained).toBeNull()
    expect(event?.analogues).toEqual([])
    expect(event?.provenance).toBe("sourced")
    expect(event?.probabilitySeries[0]?.observations[0]).toMatchObject({
      observedAt: "2026-09-04T00:00:00.000Z",
      capturedAt: "2026-09-04T00:05:00.000Z",
    })
  })

  it("takes the headline change from one series and keeps a stored zero attribution", () => {
    const revision: MoveLogRevisionRecord = {
      moveLogId: "ml-stored",
      eventId: "evt-stored",
      version: 1,
      publishedAt: "2026-09-02T01:00:00.000Z",
      recordedAt: "2026-09-02T01:00:00.000Z",
      author: "Desk",
      whatChanged: "The market moved.",
      likelyCause: "A release",
      explainedPct: 0,
      unexplainedFactors: [],
      evidenceIds: [],
      correctionNote: null,
      provenance: "demo",
    }
    const event = assemble(
      eventRow("demo"),
      [
        observation("Analyst", "forecaster_estimate", 99, "2026-09-03T00:00:00.000Z", "2026-09-03T00:01:00.000Z", "demo"),
        observation("Exchange", "market_implied", 40, "2026-09-01T00:00:00.000Z", "2026-09-01T00:02:00.000Z", "demo"),
        observation("Exchange", "market_implied", 55, "2026-09-02T00:00:00.000Z", "2026-09-02T00:03:00.000Z", "demo"),
      ],
      [],
      [revision],
    )

    expect(event?.probabilitySeries.map((series) => series.sourceName)).toEqual(["Exchange", "Analyst"])
    expect(event).toMatchObject({
      probability: 55,
      previousProbability: 40,
      change: 15,
      explained: 0,
      provenance: "demo",
      sigma: null,
    })
    expect(event?.analogues).toEqual([])
  })
})
