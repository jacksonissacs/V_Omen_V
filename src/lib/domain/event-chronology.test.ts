import { describe, expect, it } from "vitest"

import { recordedChronology } from "@/lib/domain/event-chronology"
import { groupIntoSeries } from "@/lib/domain/probability-history"
import type { EventSource } from "@/types/event"

const series = groupIntoSeries(
  [
    ["2026-09-01T12:00:00.000Z", 61.2],
    ["2026-09-04T18:42:00.000Z", 73.8],
  ].map(([observedAt, probability]) => ({
    sourceKind: "provider" as const,
    sourceName: "Exchange A",
    probabilityType: "market_implied" as const,
    provenance: "sourced" as const,
    observedAt: observedAt as string,
    capturedAt: null,
    probability: probability as number,
  })),
)[0]

const evidence: EventSource[] = [
  {
    id: "ev-1",
    name: "CPI release",
    publishedAt: "2026-09-04T18:30:00.000Z",
    firstObservedAt: "2026-09-04T18:30:41.000Z",
    summary: "",
    stance: "supports",
    reliability: 0.9,
  },
  { id: "ev-2", name: "Undated note", publishedAt: null, firstObservedAt: "2026-09-04T18:50:00.000Z", summary: "", stance: "contextual", reliability: 0.5 },
]

describe("recordedChronology", () => {
  it("lists only recorded times, oldest first, with signed changes between observations", () => {
    const entries = recordedChronology(
      {
        evidence,
        moveLog: {
          id: "ml-1",
          version: 2,
          publishedAt: "2026-09-05T13:10:00.000Z",
          firstPublishedAt: "2026-09-04T18:45:00.000Z",
          author: "Desk",
          correctionNote: "Revised.",
          evidenceIds: [],
        },
      },
      series,
    )
    expect(entries.map((entry) => [entry.at, entry.kind])).toEqual([
      ["2026-09-01T12:00:00.000Z", "observation"],
      ["2026-09-04T18:30:00.000Z", "source_published"],
      ["2026-09-04T18:30:41.000Z", "source_observed"],
      ["2026-09-04T18:42:00.000Z", "observation"],
      ["2026-09-04T18:50:00.000Z", "source_observed"],
      ["2026-09-05T13:10:00.000Z", "move_log"],
    ])
    expect(entries[0]!.deltaPp).toBeUndefined()
    expect(entries[3]!.deltaPp).toBe(12.6)
    expect(entries[5]!.text).toBe("Move log ml-1 corrected (v2)")
  })

  it("never substitutes a first-observed time for a missing publication time", () => {
    const entries = recordedChronology({ evidence: [evidence[1]!], moveLog: undefined }, undefined)
    expect(entries).toEqual([
      { at: "2026-09-04T18:50:00.000Z", kind: "source_observed", text: "OMEN first observed: Undated note" },
    ])
  })
})
