import { describe, expect, it } from "vitest"

import {
  FOLLOWING_STORAGE_KEY,
  readStoredFollowing,
  writeStoredFollowing,
} from "@/lib/following-storage"

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial }
  return {
    get length() {
      return Object.keys(data).length
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key]
    },
    getItem(key) {
      return data[key] ?? null
    },
    key(index) {
      return Object.keys(data)[index] ?? null
    },
    removeItem(key) {
      delete data[key]
    },
    setItem(key, value) {
      data[key] = value
    },
  }
}

describe("following storage", () => {
  it("treats a missing or unavailable store as missing", () => {
    expect(readStoredFollowing(null)).toEqual({ status: "missing" })
    expect(readStoredFollowing(memoryStorage())).toEqual({ status: "missing" })
  })

  it("round-trips unique ids and ignores a write when storage throws", () => {
    const storage = memoryStorage()
    expect(writeStoredFollowing(["evt-a", "evt-a", "evt-b"], storage)).toBe(true)
    expect(readStoredFollowing(storage)).toEqual({ status: "ok", ids: ["evt-a", "evt-b"] })

    const blocked = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("quota")
      },
    }
    expect(readStoredFollowing(blocked)).toEqual({ status: "error", reason: "blocked" })
    expect(writeStoredFollowing(["evt-a"], blocked)).toBe(false)
  })

  it("rejects values that are not a list of ids", () => {
    const storage = memoryStorage({ [FOLLOWING_STORAGE_KEY]: "{\"no\":true}" })
    expect(readStoredFollowing(storage)).toEqual({ status: "invalid" })
  })
})
