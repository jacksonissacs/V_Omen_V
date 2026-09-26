import { describe, expect, it } from "vitest"

import {
  arbitraryTimeQuery,
  historicalViewUnavailableMessage,
  requestedHistoricalView,
} from "@/lib/history/historical-request"

describe("requestedHistoricalView", () => {
  it("returns nothing for the current record", () => {
    expect(requestedHistoricalView(undefined)).toBeUndefined()
    expect(requestedHistoricalView({})).toBeUndefined()
    expect(requestedHistoricalView(new URLSearchParams("tab=evidence"))).toBeUndefined()
    expect(requestedHistoricalView({ checkpoint: "  " })).toBeUndefined()
  })

  it("lets Archive replay a checkpoint query and still refuse arbitrary time", () => {
    expect(
      requestedHistoricalView(new URLSearchParams("event=evt-1&checkpoint=12"), { route: "archive" }),
    ).toBeUndefined()
    expect(
      requestedHistoricalView(new URLSearchParams("checkpoint=12&at=2026-09-01T00:00:00.000Z"), {
        route: "archive",
      }),
    ).toEqual({ kind: "at", value: "2026-09-01T00:00:00.000Z" })
  })

  it("detects checkpoint, at, and cutoff without treating later keys as current-state filters", () => {
    expect(requestedHistoricalView({ checkpoint: "ck-1", title: "ignore" })).toEqual({
      kind: "checkpoint",
      value: "ck-1",
    })
    expect(requestedHistoricalView(new URLSearchParams("at=2026-09-10T12:00:00.000Z"))).toEqual({
      kind: "at",
      value: "2026-09-10T12:00:00.000Z",
    })
    expect(requestedHistoricalView({ cutoff: ["2026-09-01T00:00:00.000Z", "later"] })).toEqual({
      kind: "cutoff",
      value: "2026-09-01T00:00:00.000Z",
    })
    expect(requestedHistoricalView(new URLSearchParams("at="))).toEqual({ kind: "at", value: "" })
    expect(arbitraryTimeQuery({ checkpoint: "12", at: "2026-09-01T00:00:00.000Z" })).toEqual({
      kind: "at",
      value: "2026-09-01T00:00:00.000Z",
    })
    expect(arbitraryTimeQuery({ checkpoint: "12" })).toBeUndefined()
  })

  it("names the missing reconstruction instead of describing current text", () => {
    expect(historicalViewUnavailableMessage({ kind: "checkpoint", value: "ck-missing" })).toMatch(
      /cannot be reconstructed from this URL/,
    )
    expect(historicalViewUnavailableMessage({ kind: "at", value: "2026-01-01T00:00:00.000Z" })).toMatch(
      /stored checkpoint id instead of an arbitrary time/,
    )
  })
})
