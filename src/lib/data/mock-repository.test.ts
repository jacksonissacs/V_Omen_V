import { describe, expect, it } from "vitest"

import { events as catalog } from "@/data/events"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"
import { CATEGORY_DOMAIN } from "@/lib/domain/categories"

describe("MockIntelligenceRepository", () => {
  const repository = new MockIntelligenceRepository()

  it("labels itself as demo data", () => {
    expect(repository.provenance).toBe("demo")
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

  it("searches events, markets, and commands", async () => {
    const hits = await repository.search("yen")
    expect(hits.some((hit) => hit.id === "evt-yen-carry")).toBe(true)
    expect(hits.some((hit) => hit.kind === "market")).toBe(true)
  })
})
