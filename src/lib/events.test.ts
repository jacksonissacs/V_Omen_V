import { describe, expect, it } from "vitest"

import { events } from "@/data/events"
import { filterEvents, sortEvents } from "@/lib/events"
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
})
