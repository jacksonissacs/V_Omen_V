import { beforeEach, describe, expect, it } from "vitest"

import { readPersistedWatchlist, writePersistedWatchlist } from "@/lib/watchlist-storage"

describe("watchlist storage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("persists followed event ids for the workspace shell", () => {
    writePersistedWatchlist(["evt-alpha", "evt-beta"])
    expect(readPersistedWatchlist()).toEqual(["evt-alpha", "evt-beta"])
  })
})
