import { describe, expect, it } from "vitest"

import {
  ARCHIVE_INDEX,
  MOVE_END,
  MOVE_START,
  REWIND_DEFAULT_INDEX,
  archiveAt,
  cutoffAt,
  demoArchive,
  demoEvent,
  demoEvidence,
  demoSeries,
  deriveCard,
  evidenceAt,
  formatSigned,
  toSeconds,
} from "@/lib/marketing/demo-data"

describe("demo series", () => {
  it("has one point per minute from 14:00 to 15:00", () => {
    expect(demoSeries).toHaveLength(61)
    expect(demoSeries[0].t).toBe("14:00")
    expect(demoSeries[30].t).toBe("14:30")
    expect(demoSeries[60].t).toBe("15:00")
  })

  it("keeps the headline figures in sync with the series", () => {
    expect(demoSeries[0].p).toBeCloseTo(61.0)
    expect(demoSeries[MOVE_START].p).toBe(demoEvent.moveFrom)
    expect(demoSeries[MOVE_END].p).toBe(demoEvent.moveTo)
    expect(demoSeries[60].p).toBe(demoEvent.consensusNow)
    expect(demoSeries[60].band).toBe(demoEvent.estimateBand)
    expect(demoSeries[MOVE_END].p - demoSeries[MOVE_START].p).toBeCloseTo(demoEvent.movePts)
  })
})

describe("point-in-time cutoff", () => {
  it("displays the top of the minute and filters to the same instant", () => {
    expect(cutoffAt(demoSeries, 34)).toBe("14:34:00")
    const visible = evidenceAt(demoEvidence, demoSeries, 34).map((e) => e.t)
    // 14:34:16 is after the displayed 14:34:00 cutoff and must not leak in.
    expect(visible).toEqual(["14:30:00", "14:30:42", "14:31:08", "14:31:51", "14:32:07"])
    expect(visible).not.toContain("14:34:16")
  })

  it("includes evidence stamped exactly at the cutoff", () => {
    expect(evidenceAt(demoEvidence, demoSeries, 30).map((e) => e.t)).toEqual(["14:30:00"])
  })

  it("shows nothing before the catalyst and everything at the latest observation", () => {
    expect(evidenceAt(demoEvidence, demoSeries, 29)).toEqual([])
    expect(evidenceAt(demoEvidence, demoSeries, 60)).toHaveLength(demoEvidence.length)
  })

  it("never shows an evidence item later than the displayed cutoff at any minute", () => {
    for (let idx = 0; idx < demoSeries.length; idx++) {
      const cutoff = toSeconds(cutoffAt(demoSeries, idx))
      for (const item of evidenceAt(demoEvidence, demoSeries, idx)) {
        expect(toSeconds(item.t)).toBeLessThanOrEqual(cutoff)
      }
    }
  })

  it("selects headlines by minute", () => {
    expect(archiveAt(demoArchive, 0)).toBe(demoArchive[0].items)
    expect(archiveAt(demoArchive, 29)).toBe(demoArchive[0].items)
    expect(archiveAt(demoArchive, 30)).toBe(demoArchive[1].items)
    expect(archiveAt(demoArchive, ARCHIVE_INDEX)).toBe(demoArchive[1].items)
    expect(archiveAt(demoArchive, 60)).toBe(demoArchive[2].items)
  })
})

describe("deriveCard", () => {
  it("derives movement, move state and cutoff from the index", () => {
    const before = deriveCard(demoSeries, 10)
    expect(before.moved).toBe(false)
    expect(before.inMove).toBe(false)
    expect(before.latest).toBe(false)

    const mid = deriveCard(demoSeries, REWIND_DEFAULT_INDEX)
    expect(mid.inMove).toBe(true)
    expect(mid.moved).toBe(false)
    expect(mid.cutoff).toBe("14:34:00")
    expect(mid.delta).toBeCloseTo(demoSeries[34].p - demoSeries[0].p)

    const latest = deriveCard(demoSeries, 60)
    expect(latest.moved).toBe(true)
    expect(latest.latest).toBe(true)
    expect(formatSigned(latest.delta)).toBe("+12.8")
  })

  it("formats signed values with a true minus sign", () => {
    expect(formatSigned(-0.4)).toBe("−0.4")
    expect(formatSigned(0)).toBe("+0.0")
  })
})
