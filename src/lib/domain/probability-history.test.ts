import { describe, expect, it } from "vitest"

import { valueDomain } from "@/components/intelligence/probability-chart"
import {
  BASIS_LABEL,
  compareObservations,
  describeBasis,
  formatInterval,
  groupIntoSeries,
  isCompleteForecast,
  latestChange,
  latestCompleteForecast,
  observationBeforeRange,
  observationsInRange,
  probabilityBasis,
  rangeChange,
  rangeWindow,
  type SeriesIdentity,
} from "@/lib/domain/probability-history"
import type { ProbabilitySeries, StoredForecast } from "@/types/event"

const market: SeriesIdentity = {
  sourceKind: "provider",
  sourceName: "Exchange A",
  probabilityType: "market_implied",
  provenance: "sourced",
}

function series(points: Array<[string, number]>, identity: SeriesIdentity = market): ProbabilitySeries {
  return groupIntoSeries(
    points.map(([observedAt, probability]) => ({ ...identity, observedAt, capturedAt: observedAt, probability })),
  )[0]!
}

// Latest observation 2026-09-04T12:00Z; earlier points sit just inside or outside each range.
const history = series([
  ["2026-07-01T12:00:00.000Z", 20],
  ["2026-08-20T12:00:00.000Z", 30],
  ["2026-09-01T12:00:00.000Z", 45],
  ["2026-09-03T18:00:00.000Z", 50],
  ["2026-09-04T07:00:00.000Z", 55],
  ["2026-09-04T11:30:00.000Z", 52.5],
  ["2026-09-04T12:00:00.000Z", 60],
])

const values = (range: Parameters<typeof observationsInRange>[1]) =>
  observationsInRange(history, range).map((point) => point.probability)

describe("range filtering", () => {
  it("keeps only observations inside the range, ending at the latest observation", () => {
    expect(values("1H")).toEqual([52.5, 60])
    expect(values("6H")).toEqual([55, 52.5, 60])
    expect(values("1D")).toEqual([50, 55, 52.5, 60])
    expect(values("1W")).toEqual([45, 50, 55, 52.5, 60])
    expect(values("1M")).toEqual([30, 45, 50, 55, 52.5, 60])
    expect(values("ALL")).toEqual([20, 30, 45, 50, 55, 52.5, 60])
  })

  it("reports the window it filtered by and the first observation before it", () => {
    expect(rangeWindow(history, "1D")).toEqual({
      start: "2026-09-03T12:00:00.000Z",
      end: "2026-09-04T12:00:00.000Z",
    })
    expect(rangeWindow(history, "ALL")).toEqual({
      start: "2026-07-01T12:00:00.000Z",
      end: "2026-09-04T12:00:00.000Z",
    })
    expect(observationBeforeRange(history, "1D")?.probability).toBe(45)
    expect(observationBeforeRange(history, "ALL")).toBeUndefined()
  })

  it("includes an observation exactly on the window start", () => {
    const edge = series([
      ["2026-09-03T12:00:00.000Z", 40],
      ["2026-09-04T12:00:00.000Z", 41],
    ])
    expect(observationsInRange(edge, "1D")).toHaveLength(2)
  })
})

describe("signed changes", () => {
  it("compares the latest observation with the one before it in the same series", () => {
    const change = latestChange(history)!
    expect(change.from.probability).toBe(52.5)
    expect(change.to.probability).toBe(60)
    expect(change.deltaPp).toBe(7.5)
    expect(formatInterval(change.intervalMs)).toBe("30 min")
  })

  it("keeps the sign for falls and reports zero change without a sign", () => {
    const fall = compareObservations(
      { observedAt: "2026-09-01T00:00:00.000Z", capturedAt: null, probability: 57 },
      { observedAt: "2026-09-02T06:00:00.000Z", capturedAt: null, probability: 44 },
    )
    expect(fall.deltaPp).toBe(-13)
    expect(formatInterval(fall.intervalMs)).toBe("1 d 6 h")
    const flat = compareObservations(fall.to, { ...fall.to, observedAt: "2026-09-02T07:00:00.000Z" })
    expect(flat.deltaPp).toBe(0)
  })

  it("computes a range change from the first and last observation inside the range", () => {
    expect(rangeChange(history, "1D")).toMatchObject({ deltaPp: 10, from: { probability: 50 }, to: { probability: 60 } })
    expect(rangeChange(history, "ALL")?.deltaPp).toBe(40)
  })

  it("never compares observations from different series", () => {
    const grouped = groupIntoSeries([
      { ...market, observedAt: "2026-09-01T00:00:00.000Z", capturedAt: null, probability: 40 },
      {
        sourceKind: "author",
        sourceName: "Forecaster B",
        probabilityType: "forecaster_estimate",
        provenance: "sourced",
        observedAt: "2026-09-02T00:00:00.000Z",
        capturedAt: null,
        probability: 90,
      },
      { ...market, observedAt: "2026-09-03T00:00:00.000Z", capturedAt: null, probability: 42 },
    ])
    expect(grouped).toHaveLength(2)
    expect(grouped[0]!.sourceName).toBe("Exchange A")
    expect(latestChange(grouped[0])?.deltaPp).toBe(2)
    expect(latestChange(grouped[1])).toBeUndefined()
  })

  it("separates demo and sourced records even from the same source", () => {
    const grouped = groupIntoSeries([
      { ...market, provenance: "demo", observedAt: "2026-09-01T00:00:00.000Z", capturedAt: null, probability: 10 },
      { ...market, observedAt: "2026-09-02T00:00:00.000Z", capturedAt: null, probability: 80 },
    ])
    expect(grouped.map((item) => item.provenance).sort()).toEqual(["demo", "sourced"])
    expect(grouped.every((item) => latestChange(item) === undefined)).toBe(true)
  })
})

describe("empty and single-observation history", () => {
  const empty: ProbabilitySeries = { id: "empty", ...market, observations: [] }
  const single = series([["2026-09-04T12:00:00.000Z", 33]])

  it("has no window, points or change when nothing is recorded", () => {
    expect(rangeWindow(empty, "ALL")).toBeUndefined()
    expect(observationsInRange(empty, "1W")).toEqual([])
    expect(latestChange(empty)).toBeUndefined()
    expect(latestChange(undefined)).toBeUndefined()
    expect(rangeChange(empty, "ALL")).toBeUndefined()
  })

  it("shows the single observation without inventing a change", () => {
    expect(observationsInRange(single, "ALL")).toHaveLength(1)
    expect(latestChange(single)).toBeUndefined()
    expect(rangeChange(single, "1M")).toBeUndefined()
  })
})

describe("provenance labels", () => {
  it("labels demo records illustrative whatever probability type they claim", () => {
    for (const probabilityType of ["market_implied", "forecaster_estimate", "model_estimate"] as const) {
      expect(probabilityBasis({ provenance: "demo", probabilityType })).toBe("illustrative")
    }
  })

  it("labels sourced records by how the probability was produced", () => {
    expect(probabilityBasis({ provenance: "sourced", probabilityType: "market_implied" })).toBe("market_implied")
    expect(probabilityBasis({ provenance: "sourced", probabilityType: "forecaster_estimate" })).toBe("authored_forecast")
    expect(probabilityBasis({ provenance: "sourced", probabilityType: "model_estimate" })).toBe("authored_forecast")
    expect(BASIS_LABEL).toEqual({
      illustrative: "Illustrative",
      market_implied: "Market-implied",
      authored_forecast: "Authored forecast",
    })
  })

  it("never describes an illustrative series as observed from a market", () => {
    const demo = series([["2026-09-04T12:00:00.000Z", 50]], { ...market, provenance: "demo" })
    expect(describeBasis(demo)).toMatch(/^Illustrative demo series/)
    expect(describeBasis(demo)).toMatch(/Not observed from a market/)
    expect(describeBasis(history)).toBe("Implied by market prices recorded from Exchange A.")
  })
})

describe("stored forecasts", () => {
  const complete: StoredForecast = {
    id: "fc-1",
    author: "OMEN research",
    probability: 64,
    issuedAt: "2026-09-04T13:00:00.000Z",
    method: "Base rate from 12 prior decisions, adjusted for the CPI surprise.",
    evidenceCutoff: "2026-09-04T12:45:00.000Z",
    provenance: "sourced",
  }

  it("accepts a forecast with its own author, time, method and evidence cutoff", () => {
    expect(isCompleteForecast(complete)).toBe(true)
    expect(isCompleteForecast({ ...complete, author: "", model: "omen-model-v0" })).toBe(true)
  })

  it("rejects forecasts missing any of those fields", () => {
    expect(isCompleteForecast({ ...complete, author: " ", model: undefined })).toBe(false)
    expect(isCompleteForecast({ ...complete, method: "" })).toBe(false)
    expect(isCompleteForecast({ ...complete, evidenceCutoff: "" })).toBe(false)
    expect(isCompleteForecast({ ...complete, issuedAt: "not a date" })).toBe(false)
    expect(isCompleteForecast({ ...complete, evidenceCutoff: "2026-09-05T00:00:00.000Z" })).toBe(false)
    expect(isCompleteForecast({ ...complete, probability: 101 })).toBe(false)
  })

  it("returns the latest complete forecast, or none", () => {
    const later = { ...complete, id: "fc-2", issuedAt: "2026-09-05T00:00:00.000Z", probability: 70 }
    const incomplete = { ...complete, id: "fc-3", issuedAt: "2026-09-06T00:00:00.000Z", method: "" }
    expect(latestCompleteForecast([complete, later, incomplete])?.id).toBe("fc-2")
    expect(latestCompleteForecast([incomplete])).toBeUndefined()
    expect(latestCompleteForecast([])).toBeUndefined()
  })
})

describe("chart value axis", () => {
  it("always contains every plotted value within 0–100", () => {
    for (const sample of [[48, 58.4, 61.2, 73.8], [50], [0.5], [99.5, 100], [12, 88]]) {
      const { min, max, step } = valueDomain(sample)
      expect(min).toBeGreaterThanOrEqual(0)
      expect(max).toBeLessThanOrEqual(100)
      expect(Math.min(...sample)).toBeGreaterThanOrEqual(min)
      expect(Math.max(...sample)).toBeLessThanOrEqual(max)
      expect(max - min).toBeGreaterThanOrEqual(2 * step)
    }
  })
})
