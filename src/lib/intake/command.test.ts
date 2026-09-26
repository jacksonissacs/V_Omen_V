/** @vitest-environment node */

import { describe, expect, it } from "vitest"

import { IntakeUsageError, parseIntakeArgv } from "./command"
import { INTAKE_LIMITS } from "./source"

describe("parseIntakeArgv", () => {
  it("parses the operator commands and never a source URL", () => {
    expect(parseIntakeArgv(["refresh"])).toMatchObject({ command: "refresh", limit: INTAKE_LIMITS.defaultItemLimit })
    expect(parseIntakeArgv(["list", "--state", "pending"])).toMatchObject({ command: "list", state: "pending" })
    expect(parseIntakeArgv(["show", "--item", "cisa-kev-cve-2026-67279-v1"]).command).toBe("show")
    expect(parseIntakeArgv(["select", "--item", "cisa-kev-cve-2026-67279-v1", "--event", "evt-router-watch"])).toMatchObject({
      command: "select",
      eventId: "evt-router-watch",
    })
    expect(parseIntakeArgv(["reject", "--item", "cisa-kev-cve-2026-67279-v1"]).command).toBe("reject")
    expect(parseIntakeArgv(["check"])).toEqual({ command: "check" })
    expect(() => parseIntakeArgv(["refresh", "--url", "https://evil.example/feed"])).toThrow(IntakeUsageError)
    expect(() => parseIntakeArgv(["refresh", "https://evil.example/feed"])).toThrow(/does not accept a source URL/)
    expect(() => parseIntakeArgv(["check", "--queue", ".omen/intake"])).toThrow(IntakeUsageError)
    expect(() => parseIntakeArgv(["refresh", "--limit", "0"])).toThrow(/--limit/)
    expect(() => parseIntakeArgv(["refresh", "--limit", "41"])).toThrow(/--limit/)
  })
})
