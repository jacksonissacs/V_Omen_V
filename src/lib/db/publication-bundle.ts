import type { ClientBase } from "pg"

import {
  BundleValidationError,
  type EventBundle,
  type EvidenceInput,
  type MoveLogRevisionInput,
  type Provenance,
  parseEventBundle,
} from "./event-bundle"

export class PublicationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PublicationValidationError"
  }
}

/** Authored Move Log sections mapped onto stored revision fields. */
export interface AuthoredMoveLogDraft {
  moveLogId: string
  version?: number
  publishedAt: string
  author: string
  observedChange: string
  citedEvidenceIds: string[]
  interpretation: string
  remainsUnknown: string[]
  /** Omit or null when no defensible explained share is recorded. */
  explainedPct?: number | null
  correctionNote?: string
  provenance: Provenance
}

export type SourceReviewCandidate =
  | { kind: "evidence"; evidence: EvidenceInput }
  | { kind: "move_log"; moveLog: AuthoredMoveLogDraft }
  | { kind: "bundle"; bundle: EventBundle }

export interface StageSourceReviewInput {
  id: string
  eventId: string
  stagedBy: string
  intakeNote?: string
  candidate: SourceReviewCandidate
}

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/

function assertId(value: string, label: string): void {
  if (!ID.test(value)) {
    throw new PublicationValidationError(`${label} must be lowercase letters, digits and hyphens (3–80 chars).`)
  }
}

export function authoredMoveLogToRevision(draft: AuthoredMoveLogDraft, version: number): MoveLogRevisionInput {
  const author = draft.author?.trim()
  if (!author) throw new PublicationValidationError("Move Log author is required.")
  const evidenceIds = [...new Set(draft.citedEvidenceIds.map((id) => id.trim()).filter(Boolean))]
  if (evidenceIds.length === 0) {
    throw new PublicationValidationError("Move Log must cite at least one evidence id on the same event.")
  }
  const revision: MoveLogRevisionInput = {
    moveLogId: draft.moveLogId,
    version,
    publishedAt: draft.publishedAt,
    author,
    whatChanged: draft.observedChange.trim(),
    likelyCause: draft.interpretation.trim(),
    unexplainedFactors: draft.remainsUnknown.map((item) => item.trim()).filter(Boolean),
    evidenceIds,
    provenance: draft.provenance,
  }
  if (draft.explainedPct !== undefined && draft.explainedPct !== null) {
    revision.explainedPct = draft.explainedPct
  }
  if (version > 1) {
    const note = draft.correctionNote?.trim()
    if (!note) {
      throw new PublicationValidationError(`Move Log version ${version} requires a correctionNote.`)
    }
    revision.correctionNote = note
  } else if (draft.correctionNote?.trim()) {
    throw new PublicationValidationError("correctionNote is only allowed on Move Log corrections (version > 1).")
  }
  return revision
}

export function candidateToBundle(candidate: SourceReviewCandidate, eventId: string): EventBundle {
  if (candidate.kind === "bundle") {
    if (candidate.bundle.eventId !== eventId) {
      throw new PublicationValidationError("bundle.eventId must match the review item event.")
    }
    return candidate.bundle
  }
  if (candidate.kind === "evidence") {
    return { eventId, observations: [], evidence: [candidate.evidence], moveLogRevisions: [] }
  }
  const version = candidate.moveLog.version ?? 1
  return {
    eventId,
    observations: [],
    evidence: [],
    moveLogRevisions: [authoredMoveLogToRevision(candidate.moveLog, version)],
  }
}

export function parseStageSourceReviewInput(input: unknown): StageSourceReviewInput {
  if (typeof input !== "object" || input === null) {
    throw new PublicationValidationError("Intake payload must be a JSON object.")
  }
  const raw = input as Record<string, unknown>
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const eventId = typeof raw.eventId === "string" ? raw.eventId.trim() : ""
  const stagedBy = typeof raw.stagedBy === "string" ? raw.stagedBy.trim() : ""
  assertId(id, "id")
  assertId(eventId, "eventId")
  if (!stagedBy) throw new PublicationValidationError("stagedBy is required.")
  const intakeNote = typeof raw.intakeNote === "string" ? raw.intakeNote.trim() : undefined
  const candidateRaw = raw.candidate
  if (typeof candidateRaw !== "object" || candidateRaw === null) {
    throw new PublicationValidationError("candidate must be an object.")
  }
  const candidateObj = candidateRaw as Record<string, unknown>
  const kind = candidateObj.kind
  let candidate: SourceReviewCandidate
  if (kind === "evidence") {
    const bundle = parseEventBundle({ eventId, evidence: [candidateObj.evidence] })
    candidate = { kind: "evidence", evidence: bundle.evidence[0]! }
  } else if (kind === "move_log") {
    candidate = { kind: "move_log", moveLog: parseAuthoredMoveLogDraft(candidateObj.moveLog) }
  } else if (kind === "bundle") {
    candidate = { kind: "bundle", bundle: parseEventBundle(candidateObj.bundle) }
  } else {
    throw new PublicationValidationError('candidate.kind must be "evidence", "move_log", or "bundle".')
  }
  return { id, eventId, stagedBy, ...(intakeNote ? { intakeNote } : {}), candidate }
}

function parseAuthoredMoveLogDraft(input: unknown): AuthoredMoveLogDraft {
  if (typeof input !== "object" || input === null) {
    throw new PublicationValidationError("moveLog must be an object.")
  }
  const raw = input as Record<string, unknown>
  assertId(String(raw.moveLogId ?? "").trim(), "moveLogId")
  const author = typeof raw.author === "string" ? raw.author.trim() : ""
  if (!author) throw new PublicationValidationError("moveLog.author is required.")
  const observedChange = typeof raw.observedChange === "string" ? raw.observedChange.trim() : ""
  const interpretation = typeof raw.interpretation === "string" ? raw.interpretation.trim() : ""
  if (!observedChange) throw new PublicationValidationError("moveLog.observedChange is required.")
  if (!interpretation) throw new PublicationValidationError("moveLog.interpretation is required.")
  if (!Array.isArray(raw.citedEvidenceIds) || raw.citedEvidenceIds.some((item) => typeof item !== "string")) {
    throw new PublicationValidationError("moveLog.citedEvidenceIds must be an array of evidence ids.")
  }
  const remainsUnknown = Array.isArray(raw.remainsUnknown)
    ? raw.remainsUnknown.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : []
  const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt : ""
  if (!publishedAt) throw new PublicationValidationError("moveLog.publishedAt is required.")
  const provenance = raw.provenance
  if (provenance !== "demo" && provenance !== "sourced") {
    throw new PublicationValidationError('moveLog.provenance must be "demo" or "sourced".')
  }
  const draft: AuthoredMoveLogDraft = {
    moveLogId: String(raw.moveLogId).trim(),
    publishedAt,
    author,
    observedChange,
    citedEvidenceIds: raw.citedEvidenceIds.map((item: string) => item.trim()),
    interpretation,
    remainsUnknown,
    provenance,
  }
  if (raw.version !== undefined) {
    if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) {
      throw new PublicationValidationError("moveLog.version must be a positive integer when provided.")
    }
    draft.version = raw.version
  }
  if (raw.explainedPct === null) draft.explainedPct = null
  else if (raw.explainedPct !== undefined) {
    if (typeof raw.explainedPct !== "number" || !Number.isFinite(raw.explainedPct)) {
      throw new PublicationValidationError("moveLog.explainedPct must be a number or null.")
    }
    draft.explainedPct = raw.explainedPct
  }
  if (typeof raw.correctionNote === "string" && raw.correctionNote.trim()) {
    draft.correctionNote = raw.correctionNote.trim()
  }
  return draft
}

/** Validates bundle shape without connecting. */
export function previewPublicationBundle(input: unknown): EventBundle {
  return parseEventBundle(input)
}

export async function validatePublicationBundle(client: ClientBase, bundle: EventBundle): Promise<void> {
  for (const revision of bundle.moveLogRevisions) {
    if (!revision.author?.trim()) throw new PublicationValidationError("Every Move Log revision requires an author.")
    if (revision.evidenceIds.length === 0) {
      throw new PublicationValidationError(`Move log ${revision.moveLogId} must link at least one evidence id.`)
    }
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM evidence WHERE event_id = $1 AND id = ANY($2::text[])`,
      [bundle.eventId, revision.evidenceIds],
    )
    if (rows.length !== revision.evidenceIds.length) {
      const found = new Set(rows.map((row) => row.id))
      const missing = revision.evidenceIds.filter((id) => !found.has(id))
      throw new PublicationValidationError(
        `Evidence ${missing.join(", ")} is not recorded on event ${bundle.eventId}.`,
      )
    }
  }
  for (const item of bundle.evidence) {
    if (!item.recordedBy?.trim()) {
      throw new PublicationValidationError(`Evidence ${item.id} requires recordedBy.`)
    }
  }
}

export async function resolveMoveLogVersion(client: ClientBase, draft: AuthoredMoveLogDraft): Promise<number> {
  if (draft.version !== undefined) return draft.version
  const { rows } = await client.query<{ next: number }>(
    "SELECT coalesce(max(version), 0) + 1 AS next FROM move_log_revisions WHERE move_log_id = $1",
    [draft.moveLogId],
  )
  return rows[0]?.next ?? 1
}

export async function buildBundleFromReviewPayload(
  client: ClientBase,
  eventId: string,
  candidate: SourceReviewCandidate,
): Promise<EventBundle> {
  if (candidate.kind === "move_log" && candidate.moveLog.version === undefined) {
    const version = await resolveMoveLogVersion(client, candidate.moveLog)
    return candidateToBundle({ kind: "move_log", moveLog: { ...candidate.moveLog, version } }, eventId)
  }
  return candidateToBundle(candidate, eventId)
}

export function publicationBundleIssues(error: unknown): string {
  if (error instanceof BundleValidationError) return error.message
  if (error instanceof PublicationValidationError) return error.message
  return (error as Error).message
}
