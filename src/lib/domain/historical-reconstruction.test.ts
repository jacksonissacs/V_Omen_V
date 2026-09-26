import { describe, expect, it } from "vitest"

import { buildEvent } from "@/data/build-event"
import { deriveArchiveInputFromEvent } from "@/lib/archive/derive-archive-input"
import {
  reconstructAt,
  zonedDateTimeToUtc,
} from "@/lib/domain/historical-reconstruction"

describe("historical reconstruction", () => {
  const event = buildEvent({
    id: "evt-test",
    title: "Test event today",
    category: "Economics",
    probability: 70,
    previousProbability: 60,
    timestamp: "2026-09-04T18:42:00.000Z",
    displayTime: "14:42 EDT",
    summary: "Latest summary",
    question: "Will test happen?",
    whatChanged: "Moved",
    likelyCause: "Catalyst",
    unexplainedFactors: [],
    sigma: 1,
    duration: "1 h",
    catalyst: "Catalyst",
    catalystTime: "14:00:00",
    explained: 50,
    region: "Test",
    tags: [],
    entities: [],
    evidence: [
      {
        id: "ev-1",
        name: "Early source",
        publishedAt: "2026-08-01T12:00:00.000Z",
        firstObservedAt: "2026-08-01T12:01:00.000Z",
        capturedAt: "2026-08-01T12:01:00.000Z",
        summary: "Early",
        stance: "supports",
        reliability: 0.9,
      },
      {
        id: "ev-2",
        name: "Late source",
        publishedAt: "2026-09-04T18:30:00.000Z",
        firstObservedAt: "2026-09-04T18:31:00.000Z",
        capturedAt: "2026-09-04T18:31:00.000Z",
        summary: "Late",
        stance: "supports",
        reliability: 0.9,
      },
    ],
    expectationHistory: [
      { at: "2026-08-01T12:00:00.000Z", probability: 48 },
      { at: "2026-08-17T14:35:00.000Z", probability: 58.4 },
      { at: "2026-09-04T18:42:00.000Z", probability: 70 },
    ],
    moveLog: {
      id: "ml-test",
      version: 1,
      publishedAt: "2026-09-04T18:45:00.000Z",
      firstPublishedAt: "2026-09-04T18:45:00.000Z",
      author: "desk",
      evidenceIds: ["ev-2"],
    },
  })

  it("filters observations, evidence and move logs to the cutoff", () => {
    const input = deriveArchiveInputFromEvent(event)
    const view = reconstructAt(input, "2026-08-17T14:35:00.000Z")!
    expect(view.headlineProbability).toBe(58.4)
    expect(view.evidence.map((item) => item.id)).toEqual(["ev-1"])
    expect(view.moveLog).toBeUndefined()
    expect(view.probabilitySeries[0]?.observations).toHaveLength(2)
  })

  it("uses checkpoint availability exactly", () => {
    const input = deriveArchiveInputFromEvent(event)
    const checkpoint = input.moveLogRevisions?.[0]
    const availableAt = checkpoint!.publishedAt
    const view = reconstructAt(input, "2026-09-04T18:50:00.000Z", `move_log:${availableAt}`)!
    expect(view.moveLog?.version).toBe(1)
    expect(view.evidence.map((item) => item.id)).toEqual(["ev-1", "ev-2"])
  })

  it("converts IANA local time to UTC", () => {
    expect(zonedDateTimeToUtc("2026-08-17", "10:35:00", "America/Toronto")).toBe("2026-08-17T14:35:00.000Z")
  })
})
