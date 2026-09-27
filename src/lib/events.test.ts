import { describe, expect, it } from "vitest"

import { events } from "@/data/events"
import { capPulseEvents, filterEvents, orderPulseEvents, PULSE_SCAN_LIMIT, sortEvents } from "@/lib/events"
import { testEvent } from "@/test/fake-repository"

describe("event catalog helpers", () => {
  it("keeps a 25–35 event book across the required categories", () => {
    expect(events.length).toBeGreaterThanOrEqual(25)
    expect(events.length).toBeLessThanOrEqual(35)
    const categories = new Set(events.map((event) => event.category))
    for (const category of [
      "AI",
      "Technology",
      "Economics",
      "Geopolitics",
      "Companies",
      "Regulation",
      "Markets",
      "Energy",
      "Crypto",
      "Science",
    ]) {
      expect(categories.has(category as never)).toBe(true)
    }
  })

  it("filters and sorts by change, probability, and time", () => {
    const ai = filterEvents(events, { category: "AI" })
    expect(ai.every((event) => event.category === "AI")).toBe(true)

    const searched = filterEvents(events, { query: "bank of canada" })
    expect(searched.some((event) => event.id === "evt-boc-cut")).toBe(true)

    const byChange = sortEvents(events, "change")
    expect(Math.abs(byChange[0]?.change ?? 0)).toBeGreaterThanOrEqual(
      Math.abs(byChange[1]?.change ?? 0),
    )
  })

  it("ranks a one-point history after events that have a recorded move", () => {
    const moved = testEvent({ id: "evt-moved", title: "Moved", probability: 60, previousProbability: 50 })
    const lone = testEvent({
      id: "evt-lone",
      title: "Lone",
      expectationHistory: [{ at: "2026-09-01T12:00:00.000Z", probability: 80 }],
    })
    expect(lone.change).toBeNull()
    expect(sortEvents([lone, moved], "change").map((event) => event.id)).toEqual(["evt-moved", "evt-lone"])
  })

  it("orders Pulse by largest absolute recorded move and caps deterministically", () => {
    const small = testEvent({
      id: "evt-small",
      title: "Small",
      probability: 52,
      previousProbability: 50,
      timestamp: "2026-09-01T10:00:00.000Z",
    })
    const large = testEvent({
      id: "evt-large",
      title: "Large",
      probability: 70,
      previousProbability: 50,
      timestamp: "2026-09-04T10:00:00.000Z",
    })
    const down = testEvent({
      id: "evt-down",
      title: "Down",
      probability: 30,
      previousProbability: 50,
      timestamp: "2026-09-03T10:00:00.000Z",
    })
    const lone = testEvent({
      id: "evt-lone-pulse",
      title: "Lone",
      expectationHistory: [{ at: "2026-09-01T12:00:00.000Z", probability: 80 }],
      timestamp: "2026-09-02T10:00:00.000Z",
    })

    // |−20| ties |+20|; newer timestamp wins the tie-break.
    expect(orderPulseEvents([small, lone, down, large]).map((event) => event.id)).toEqual([
      "evt-large",
      "evt-down",
      "evt-small",
      "evt-lone-pulse",
    ])
    expect(orderPulseEvents([small, lone, down, large])).toEqual(orderPulseEvents([large, down, lone, small]))

    const many = Array.from({ length: PULSE_SCAN_LIMIT + 5 }, (_, index) =>
      testEvent({
        id: `evt-n-${index}`,
        title: `N${index}`,
        probability: 50 + index,
        previousProbability: 50,
        timestamp: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    )
    const capped = capPulseEvents(orderPulseEvents(many))
    expect(capped).toHaveLength(PULSE_SCAN_LIMIT)
    expect(Math.abs(capped[0]?.change ?? 0)).toBeGreaterThanOrEqual(Math.abs(capped.at(-1)?.change ?? 0))
  })
})
