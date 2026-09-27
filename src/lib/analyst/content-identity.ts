import { createHash } from "node:crypto"

import type { EvidenceInputRef, StoredEvidenceInput } from "./types"

/** Canonical JSON for hashing: sorted object keys, stable arrays. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    const out: Record<string, unknown> = {}
    for (const [key, entry] of entries) out[key] = sortValue(entry)
    return out
  }
  return value
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Content identity for one stored evidence row (exact input reference). */
export function evidenceContentIdentity(evidence: Omit<StoredEvidenceInput, "contentIdentity">): string {
  return sha256Hex(
    canonicalJson({
      id: evidence.id,
      eventId: evidence.eventId,
      sourceName: evidence.sourceName,
      sourceUrl: evidence.sourceUrl,
      sourcePublishedAt: evidence.sourcePublishedAt,
      firstObservedAt: evidence.firstObservedAt,
      capturedAt: evidence.capturedAt,
      summary: evidence.summary,
      stance: evidence.stance,
      recordedBy: evidence.recordedBy,
      provenance: evidence.provenance,
    }),
  )
}

/**
 * Canonical input identity for an analyst proposal.
 * Includes the event question, prompt version, and selected evidence identities.
 * A change to any of these invalidates prior approval/staging eligibility.
 */
export function inputContentIdentity(args: {
  eventQuestion: string
  promptVersion: string
  evidence: EvidenceInputRef[]
}): string {
  const eventQuestion = args.eventQuestion.trim()
  const promptVersion = args.promptVersion.trim()
  if (!eventQuestion) throw new Error("eventQuestion is required for input identity.")
  if (!promptVersion) throw new Error("promptVersion is required for input identity.")
  const sorted = [...args.evidence].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return sha256Hex(
    canonicalJson({
      eventQuestion,
      promptVersion,
      evidence: sorted,
    }),
  )
}

export function proposalContentIdentity(body: unknown): string {
  return sha256Hex(canonicalJson(body))
}
