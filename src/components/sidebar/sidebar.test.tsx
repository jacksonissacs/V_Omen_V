import { describe, expect, it } from "vitest"

import { isActive } from "@/components/sidebar/sidebar"

describe("sidebar isActive", () => {
  it("treats /pulse as the workspace home and never matches the marketing root", () => {
    expect(isActive("/pulse", "/pulse")).toBe(true)
    expect(isActive("/", "/pulse")).toBe(false)
    expect(isActive("/pulse/anything", "/pulse")).toBe(false)
  })

  it("keeps nested event routes active under Events", () => {
    expect(isActive("/events", "/events")).toBe(true)
    expect(isActive("/events/evt-boc-cut", "/events")).toBe(true)
    expect(isActive("/events", "/pulse")).toBe(false)
  })

  it("matches other workspace routes by prefix", () => {
    expect(isActive("/markets", "/markets")).toBe(true)
    expect(isActive("/markets/x", "/markets")).toBe(true)
    expect(isActive("/marketsx", "/markets")).toBe(false)
  })
})
