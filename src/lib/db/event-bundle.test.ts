import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { BundleValidationError, parseEventBundle } from "@/lib/db/event-bundle"

const FIXTURES = path.resolve(__dirname, "../../../db/fixtures")
const fixture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"))

function issuesFor(input: unknown): string[] {
  try {
    parseEventBundle(input)
  } catch (error) {
    if (error instanceof BundleValidationError) return error.issues
    throw error
  }
  return []
}

describe("parseEventBundle", () => {
  it("accepts the committed demo fixtures", () => {
    const seed = parseEventBundle(fixture("demo-evt-boc-cut.json"))
    expect(seed.eventId).toBe("evt-boc-cut")
    expect(seed.event?.provenance).toBe("demo")
    expect(seed.observations).toHaveLength(4)
    expect(seed.moveLogRevisions.map((revision) => revision.version)).toEqual([1])

    const correction = parseEventBundle(fixture("demo-evt-boc-cut.correction.json"))
    expect(correction.event).toBeUndefined()
    expect(correction.moveLogRevisions[0]?.version).toBe(2)
    expect(correction.evidence[0]?.sourcePublishedAt).toBeNull()
  })

  it("marks every fixture record as demo provenance", () => {
    for (const name of ["demo-evt-boc-cut.json", "demo-evt-boc-cut.correction.json"]) {
      const bundle = parseEventBundle(fixture(name))
      const records = [
        ...(bundle.event ? [bundle.event] : []),
        ...bundle.observations,
        ...bundle.evidence,
        ...bundle.moveLogRevisions,
      ]
      expect(records.every((record) => record.provenance === "demo")).toBe(true)
    }
  })

  it("requires a precise question, deadline and resolution criteria", () => {
    const bundle = fixture("demo-evt-boc-cut.json")
    bundle.event.question = "BoC cut in October"
    bundle.event.resolutionCriteria = "Cut."
    delete bundle.event.deadline
    const issues = issuesFor(bundle)
    expect(issues).toContain("bundle.event.question must be phrased as a question ending in ?")
    expect(issues).toContain("bundle.event.resolutionCriteria must have at least 20 characters")
    expect(issues).toContain("bundle.event.deadline must be an ISO-8601 timestamp with a timezone")
  })

  it("enforces the 0–100 percentage-point scale with two decimals", () => {
    const bundle = fixture("demo-evt-boc-cut.json")
    bundle.observations[0].probabilityPct = 100.5
    bundle.observations[1].probabilityPct = 0.735
    bundle.observations[2].probabilityPct = "61"
    const issues = issuesFor(bundle)
    expect(issues).toContain("bundle.observations[0].probabilityPct must be between 0 and 100")
    expect(issues).toContain("bundle.observations[1].probabilityPct must have at most 2 decimal places")
    expect(issues).toContain("bundle.observations[2].probabilityPct must be a finite number")
  })

  it("rejects timestamps without a timezone", () => {
    const bundle = fixture("demo-evt-boc-cut.json")
    bundle.observations[0].observedAt = "2026-08-01 12:00"
    expect(issuesFor(bundle)).toContain(
      "bundle.observations[0].observedAt must be an ISO-8601 timestamp with a timezone",
    )
  })

  it("requires an explicit publication time or null, and never after first observation", () => {
    const bundle = fixture("demo-evt-boc-cut.json")
    delete bundle.evidence[0].sourcePublishedAt
    bundle.evidence[1].sourcePublishedAt = "2026-09-05T00:00:00.000Z"
    const issues = issuesFor(bundle)
    expect(issues).toContain("bundle.evidence[0].sourcePublishedAt is required (use null when unknown)")
    expect(issues).toContain("bundle.evidence[1].sourcePublishedAt must not be after firstObservedAt")
  })

  it("requires a correction note on corrections and forbids one on the first version", () => {
    const correction = fixture("demo-evt-boc-cut.correction.json")
    delete correction.moveLogRevisions[0].correctionNote
    expect(issuesFor(correction)).toContain("bundle.moveLogRevisions[0].correctionNote is required for version 2")

    const seed = fixture("demo-evt-boc-cut.json")
    seed.moveLogRevisions[0].correctionNote = "Not a correction"
    expect(issuesFor(seed)).toContain(
      "bundle.moveLogRevisions[0].correctionNote is only allowed on corrections (version > 1)",
    )
  })

  it("requires an observation when creating or updating an event", () => {
    const bundle = fixture("demo-evt-boc-cut.json")
    bundle.observations = []
    expect(issuesFor(bundle)).toContain(
      "bundle.observations must include at least one observation when bundle.event is present",
    )
  })

  it("rejects unknown provenance and non-object input", () => {
    const bundle = fixture("demo-evt-boc-cut.json")
    bundle.event.provenance = "live"
    expect(issuesFor(bundle)).toContain("bundle.event.provenance must be one of demo, sourced")
    expect(issuesFor([])).toEqual(["bundle must be a JSON object"])
    expect(issuesFor({ eventId: "evt-boc-cut" })).toContain("bundle has nothing to write")
  })
})
