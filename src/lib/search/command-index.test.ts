import { describe, expect, it } from "vitest"

import { events } from "@/lib/data/mock-catalog"
import { searchCatalog } from "@/lib/search/command-index"

describe("searchCatalog", () => {
  it("returns the consumer navigation index when the query is empty", () => {
    const hits = searchCatalog("", events)
    const commands = hits.filter((hit) => hit.kind === "command")
    expect(commands.map((hit) => hit.title)).toEqual([
      "Open Pulse",
      "Open Explore",
      "Open Following",
      "Open Archive",
    ])
    expect(commands.some((hit) => /settings/i.test(hit.title))).toBe(false)
    expect(hits.some((hit) => hit.kind === "event")).toBe(true)
  })

  it("matches multi-token queries against title and tags", () => {
    const hits = searchCatalog("gpu export", events)
    expect(hits.some((hit) => hit.id === "evt-gpu-export")).toBe(true)
    expect(
      hits.every(
        (hit) =>
          hit.kind !== "event" ||
          hit.id === "evt-gpu-export" ||
          hit.title.toLowerCase().includes("gpu") ||
          hit.subtitle.toLowerCase().includes("gpu"),
      ),
    ).toBe(true)
  })

  it("can find a market from its ticker", () => {
    const hits = searchCatalog("sofr", events)
    expect(hits.some((hit) => hit.id === "mkt-sofr")).toBe(true)
  })

  it("lists Archive under History rather than unfinished destinations", () => {
    const hits = searchCatalog("archive", events)
    expect(hits.some((hit) => hit.id === "cmd-archive" && hit.subtitle === "History")).toBe(true)
    expect(
      hits.every((hit) => hit.kind !== "command" || !/settings|agents|markets|signals/i.test(hit.title)),
    ).toBe(true)
  })
})
