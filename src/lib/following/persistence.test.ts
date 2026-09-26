import { afterEach, describe, expect, it, vi } from "vitest"

import {
  followingStorageKey,
  parseFollowingPayload,
  readBrowserFollowing,
  writeBrowserFollowing,
} from "@/lib/following/persistence"

describe("browser following persistence", () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it("uses versioned keys per storage scope", () => {
    expect(followingStorageKey("demo")).toBe("omen-v0-following/v1/demo")
    expect(followingStorageKey("database")).toBe("omen-v0-following/v1/database")
  })

  it("parses version 1 payloads and deduplicates ids", () => {
    const result = parseFollowingPayload(
      JSON.stringify({
        version: 1,
        eventIds: ["evt-a", "evt-a", "evt-b", 3],
        userSaved: true,
      }),
    )
    expect(result).toEqual({
      kind: "ok",
      payload: { version: 1, eventIds: ["evt-a", "evt-b"], userSaved: true },
    })
  })

  it("accepts legacy array payloads as user-saved lists", () => {
    const result = parseFollowingPayload(JSON.stringify(["evt-one", "evt-two"]))
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.payload.userSaved).toBe(true)
      expect(result.payload.eventIds).toEqual(["evt-one", "evt-two"])
    }
  })

  it("rejects corrupt payloads without throwing", () => {
    expect(parseFollowingPayload("{").kind).toBe("invalid")
    expect(parseFollowingPayload(JSON.stringify({ version: 9, eventIds: [] })).kind).toBe("invalid")
  })

  it("reads and writes following for this browser", () => {
    const write = writeBrowserFollowing("demo", {
      version: 1,
      eventIds: ["evt-alpha"],
      userSaved: true,
    })
    expect(write).toEqual({ ok: true })

    const read = readBrowserFollowing("demo")
    expect(read).toEqual({
      kind: "ok",
      payload: { version: 1, eventIds: ["evt-alpha"], userSaved: true },
    })
  })

  it("reports write failures instead of claiming success", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    })
    const write = writeBrowserFollowing("demo", {
      version: 1,
      eventIds: ["evt-alpha"],
      userSaved: true,
    })
    expect(write.ok).toBe(false)
    if (!write.ok) {
      expect(write.message).toMatch(/Could not save following/)
    }
  })
})
