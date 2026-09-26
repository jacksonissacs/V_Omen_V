import { describe, expect, it } from "vitest"

import { buildEvent, type EventDraft } from "@/data/build-event"
import { seriesId } from "@/lib/domain/probability-history"
import type { ProbabilitySeries } from "@/types/event"

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    id: "evt-sample",
    title: "Sample question",
    category: "Economics",
    probability: 10,
    previousProbability: 90,
    timestamp: "2026-09-01T00:00:00.000Z",
    displayTime: "00:00 UTC",
    summary: "Summary",
    question: "Will the sample resolve?",
    whatChanged: "It moved",
    likelyCause: "A release",
    unexplainedFactors: [],
    sigma: 4.7,
    confidence: "High",
    duration: "18 min",
    catalyst: "A release",
    catalystTime: "00:00:00",
    explained: 69,
    region: "Test",
    tags: [],
    entities: [],
    evidence: [],
    expectationHistory: [
      { at: "2026-09-01T00:00:00.000Z", probability: 40 },
      { at: "2026-09-02T00:00:00.000Z", probability: 55 },
    ],
    ...overrides,
  }
}

function series(
  sourceName: string,
  probabilityType: ProbabilitySeries["probabilityType"],
  points: Array<[string, number, string | null]>,
  provenance: ProbabilitySeries["provenance"] = "sourced",
): ProbabilitySeries {
  const identity = {
    sourceKind: probabilityType === "market_implied" ? ("provider" as const) : ("author" as const),
    sourceName,
    probabilityType,
    provenance,
  }
  return {
    id: seriesId(identity),
    ...identity,
    observations: points.map(([observedAt, probability, capturedAt]) => ({
      observedAt,
      capturedAt,
      probability,
    })),
  }
}

describe("buildEvent recorded figures", () => {
  it("compares only the two latest observations of the headline series", () => {
    const event = buildEvent(
      draft({
        provenance: "sourced",
        explained: 80,
        probabilitySeries: [
          series("Analyst", "forecaster_estimate", [["2026-09-03T00:00:00.000Z", 90, "2026-09-03T00:01:00.000Z"]]),
          series("Exchange", "market_implied", [
            ["2026-09-01T00:00:00.000Z", 40, "2026-09-01T00:02:00.000Z"],
            ["2026-09-02T00:00:00.000Z", 55, "2026-09-02T00:03:00.000Z"],
          ]),
        ],
      }),
    )

    expect(event.probabilitySeries[0]?.sourceName).toBe("Exchange")
    expect(event.probability).toBe(55)
    expect(event.previousProbability).toBe(40)
    expect(event.change).toBe(15)
    expect(event.timestamp).toBe("2026-09-02T00:00:00.000Z")
    expect(event.explained).toBeNull()
    expect(event.sigma).toBeNull()
    expect(event.confidence).toBeNull()
  })

  it("does not invent a previous observation, a sigma, or a confidence score for one point", () => {
    const event = buildEvent(
      draft({
        probability: 41,
        previousProbability: 41,
        sigma: 0,
        explained: null,
        analogues: [],
        expectationHistory: [{ at: "2026-09-04T00:00:00.000Z", probability: 41 }],
      }),
    )

    expect(event.probability).toBe(41)
    expect(event.previousProbability).toBeNull()
    expect(event.change).toBeNull()
    expect(event.analogues).toEqual([])
    expect(event.sigma).toBeNull()
    expect(event.confidence).toBeNull()
    expect(event.explained).toBeNull()
    expect(event.provenance).toBe("demo")
  })

  it("keeps an illustrative demo attribution and a stored zero, and drops a sourced number with no move log", () => {
    const illustrative = buildEvent(draft({ explained: 69 }))
    expect(illustrative.explained).toBe(69)
    expect(illustrative.provenance).toBe("demo")

    const sourced = buildEvent(draft({ provenance: "sourced", explained: 69 }))
    expect(sourced.explained).toBeNull()

    const authoredZero = buildEvent(
      draft({
        provenance: "sourced",
        explained: 0,
        moveLog: {
          id: "ml-1",
          version: 1,
          publishedAt: "2026-09-02T00:00:00.000Z",
          firstPublishedAt: "2026-09-02T00:00:00.000Z",
          author: "Desk",
          evidenceIds: [],
        },
      }),
    )
    expect(authoredZero.explained).toBe(0)
  })
})
