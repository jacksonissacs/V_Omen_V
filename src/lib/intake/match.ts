import { readFileSync } from "node:fs"

import { CISA_KEV } from "./source"
import type { CapturedDraft, MatchRule } from "./types"

export class MatchConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MatchConfigError"
  }
}

const EVENT_ID = /^[a-z0-9][a-z0-9-]{2,79}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Exact vendor/product rules written by the operator.
 * Source text is never compiled as a pattern.
 */
export function parseMatchConfig(input: unknown): MatchRule[] {
  if (!isRecord(input) || Object.keys(input).some((key) => key !== "rules") || !Array.isArray(input.rules)) {
    throw new MatchConfigError('Match config must be an object with a "rules" array.')
  }
  return input.rules.map((rule, index): MatchRule => {
    if (!isRecord(rule)) throw new MatchConfigError(`Match rule ${index} must be an object.`)
    const keys = Object.keys(rule)
    if (keys.some((key) => !["sourceId", "vendorProject", "product", "eventId"].includes(key))) {
      throw new MatchConfigError(`Match rule ${index} has an unsupported field.`)
    }
    if (rule.sourceId !== CISA_KEV.id) throw new MatchConfigError(`Match rule ${index} must use source ${CISA_KEV.id}.`)
    if (typeof rule.vendorProject !== "string" || rule.vendorProject.trim().length === 0 || rule.vendorProject.trim().length > 120) {
      throw new MatchConfigError(`Match rule ${index} needs a vendorProject string.`)
    }
    if (rule.product !== undefined && (typeof rule.product !== "string" || rule.product.trim().length === 0 || rule.product.trim().length > 120)) {
      throw new MatchConfigError(`Match rule ${index} has an empty product.`)
    }
    if (typeof rule.eventId !== "string" || !EVENT_ID.test(rule.eventId)) {
      throw new MatchConfigError(`Match rule ${index} needs an OMEN event id.`)
    }
    return {
      sourceId: CISA_KEV.id,
      vendorProject: rule.vendorProject.trim(),
      ...(rule.product === undefined ? {} : { product: rule.product.trim() }),
      eventId: rule.eventId,
    }
  })
}

export function loadMatchConfig(file: string): MatchRule[] {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new MatchConfigError(`Could not read match config ${file}: ${(error as Error).message}`)
  }
  return parseMatchConfig(raw)
}

export type MatchResult = { status: "none" } | { status: "matched"; eventId: string } | { status: "ambiguous" }

export function matchDraft(draft: Pick<CapturedDraft, "vendorProject" | "product">, rules: readonly MatchRule[]): MatchResult {
  const hits = rules.filter((rule) => {
    if (rule.vendorProject !== draft.vendorProject) return false
    return rule.product === undefined || rule.product === draft.product
  })
  const eventIds = [...new Set(hits.map((rule) => rule.eventId))]
  if (eventIds.length === 0) return { status: "none" }
  if (eventIds.length > 1) return { status: "ambiguous" }
  return { status: "matched", eventId: eventIds[0]! }
}

export function assertEventId(eventId: string): string {
  if (!EVENT_ID.test(eventId)) throw new MatchConfigError(`Event id ${eventId} is not a valid OMEN event id.`)
  return eventId
}
