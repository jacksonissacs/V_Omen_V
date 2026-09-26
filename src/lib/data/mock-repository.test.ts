import { describe, expect, it } from "vitest"

import { events as catalog } from "@/data/events"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"
import { DEMO_RECONSTRUCTION_UNSUPPORTED } from "@/lib/domain/historical-reconstruction"
import { CATEGORY_DOMAIN } from "@/lib/domain/categories"

describe("MockIntelligenceRepository", () => {
  const repository = new MockIntelligenceRepository()

  it("stores in-process demo records and labels every event as demo provenance", async () => {
    expect(repository.storage).toBe("demo")
    const events = await repository.listEvents()
    expect(events.every((event) => event.provenance === "demo")).toBe(true)
  })

  it("returns the full book sorted by absolute probability move", async () => {
    const events = await repository.listEvents()
    expect(events.length).toBeGreaterThanOrEqual(25)
    expect(events[0]?.id).toBe("evt-gpu-export")
  })

  it("returns the curated book order on request without mutating the catalog", async () => {
    const before = catalog.map((event) => event.id)
    await repository.listEvents()
    const events = await repository.listEvents({ order: "catalog" })
    expect(events.map((event) => event.id)).toEqual(before)
    expect(catalog.map((event) => event.id)).toEqual(before)
  })

  it("filters by domain", async () => {
    const finance = await repository.listEvents({ domain: "finance" })
    expect(finance.every((event) => CATEGORY_DOMAIN[event.category] === "finance")).toBe(true)
    expect(finance.some((event) => event.id === "evt-fed-cut")).toBe(true)
  })

  it("loads a complete event object", async () => {
    const event = await repository.getEvent("evt-rare-earth")
    expect(event?.evidence.length).toBeGreaterThan(0)
    expect(event?.unexplainedFactors.length).toBeGreaterThan(0)
    expect(event?.expectationHistory.length).toBeGreaterThan(2)
    expect(event?.likelyCause).toBeTruthy()
  })

  it("derives every headline probability and change from the event's own recorded series", async () => {
    for (const event of await repository.listEvents()) {
      const [headline, ...others] = event.probabilitySeries
      expect(others, event.id).toEqual([])
      expect(headline?.provenance, event.id).toBe("demo")
      const points = headline!.observations
      expect(points.at(-1)?.probability, event.id).toBe(event.probability)
      expect(points.at(-1)?.observedAt, event.id).toBe(event.timestamp)
      expect(points.at(-2)?.probability, event.id).toBe(event.previousProbability)
      expect(event.forecasts, event.id).toEqual([])
    }
  })

  it("returns undefined for an unknown event", async () => {
    expect(await repository.getEvent("evt-does-not-exist")).toBeUndefined()
  })

  it("resolves related events in the order the event lists them", async () => {
    const event = await repository.getEvent("evt-boc-cut")
    const related = await repository.getRelatedEvents("evt-boc-cut")
    expect(related.map((item) => item.id)).toEqual(event?.relatedEvents)
    expect(await repository.getRelatedEvents("evt-does-not-exist")).toEqual([])
  })

  it("exposes the featured anomaly and the default follow list", async () => {
    const anomaly = await repository.getFeaturedAnomaly()
    expect(anomaly?.id).toBe("evt-housing-ca")
    expect(anomaly?.anomaly).toBeDefined()

    const followed = await repository.listFollowedEventIds()
    expect(followed).toEqual(["evt-boc-cut", "evt-frontier-release", "evt-fed-cut", "evt-housing-ca"])
    for (const id of followed) {
      expect(await repository.getEvent(id)).toBeDefined()
    }
  })

  it("returns a feed that only references known events", async () => {
    const ids = new Set((await repository.listEvents()).map((event) => event.id))
    const items = await repository.listFeed()
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => ids.has(item.eventId))).toBe(true)
  })

  it("returns a connected graph", async () => {
    const graph = await repository.getGraph()
    const nodeIds = new Set(graph.nodes.map((node) => node.id))
    expect(graph.edges.length).toBeGreaterThan(0)
    expect(
      graph.edges.every(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
      ),
    ).toBe(true)
  })

  it("refuses stored reconstruction instead of replaying the current demo book", async () => {
    const result = await repository.reconstructEvent(
      "evt-boc-cut",
      "11111111-1111-4111-8111-111111111111",
    )
    expect(result).toEqual({ outcome: "unsupported_history", message: DEMO_RECONSTRUCTION_UNSUPPORTED })
    expect(JSON.stringify(result)).not.toContain("Bank of Canada")
    expect(await repository.reconstructEvent("evt-boc-cut", "not-a-checkpoint")).toMatchObject({
      outcome: "invalid_request",
    })
  })

  it("searches events, markets, and commands", async () => {
    const hits = await repository.search("yen")
    expect(hits.some((hit) => hit.id === "evt-yen-carry")).toBe(true)
    expect(hits.some((hit) => hit.kind === "market")).toBe(true)
  })
})
