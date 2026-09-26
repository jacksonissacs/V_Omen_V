import type {
  EventCategory,
  EventSource,
  ObservationSourceKind,
  ProbabilityType,
  Provenance,
  Significance,
} from "@/types/event"

/**
 * Point-in-time replay is a stored checkpoint, not an `AionEvent` filled from
 * today's projection. Semantic fields exist only when an eligible
 * `event_revisions` row is a member of that checkpoint.
 */
export interface HistoricalSemantics {
  version: number
  title: string
  question: string
  status: "watch" | "active" | "resolved"
  deadline: string
  resolutionCriteria: string
  category: EventCategory
  significance: Significance
  region: string
  summary: string
  tags: string[]
  relatedEventIds: string[]
  provenance: Provenance
  correctionNote: string | null
  recordedAt: string
}

export interface HistoricalObservation {
  id: string
  sourceKind: ObservationSourceKind
  sourceName: string
  probabilityType: ProbabilityType
  probabilityPct: number
  observedAt: string
  capturedAt: string
  note: string | null
  provenance: Provenance
}

export interface HistoricalEvidence {
  id: string
  sourceName: string
  sourceUrl: string | null
  sourcePublishedAt: string | null
  firstObservedAt: string
  capturedAt: string
  summary: string
  stance: EventSource["stance"]
  reliability: number
  recordedBy: string
  provenance: Provenance
}

export interface HistoricalMoveLog {
  id: string
  moveLogId: string
  version: number
  publishedAt: string
  recordedAt: string
  author: string
  whatChanged: string
  likelyCause: string
  explainedPct: number
  unexplainedFactors: string[]
  evidenceIds: string[]
  correctionNote: string | null
  provenance: Provenance
}

export interface HistoryCoverageReport {
  semanticEventFieldsFrom: string
  recordAvailabilityRealignedAt: string
  semanticHistory: "recorded" | "unavailable"
  preBaselineEventRevisions: "not_recorded"
}

export interface ReconstructionCheckpointRef {
  id: string
  sequence: number
  contentSha256: string
  memberCount: number
}

export interface HistoricalReconstruction {
  eventId: string
  checkpoint: ReconstructionCheckpointRef
  coverage: HistoryCoverageReport
  provenance: Provenance | "mixed"
  semantics: HistoricalSemantics | null
  observations: HistoricalObservation[]
  evidence: HistoricalEvidence[]
  moveLogs: HistoricalMoveLog[]
}

export type ReconstructionOutcome =
  | { outcome: "reconstruction"; reconstruction: HistoricalReconstruction }
  | { outcome: "pre_coverage"; reconstruction: HistoricalReconstruction }
  | { outcome: "invalid_request"; message: string }
  | { outcome: "unknown_event" }
  | { outcome: "unsupported_history"; message: string }

export const DEMO_RECONSTRUCTION_UNSUPPORTED =
  "Stored reconstruction is not available from demo storage."

export const CHECKPOINT_NOT_FOUND = "No verified history checkpoint matches this event."

export const ARBITRARY_TIME_UNSUPPORTED =
  "Arbitrary-time reconstruction is not a verified visibility boundary. Replay a stored checkpoint id."

const EVENT_ID = /^[a-z0-9][a-z0-9-]{2,79}$/
const CHECKPOINT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateReconstructionRequest(
  eventId: string,
  checkpointId: string,
): Extract<ReconstructionOutcome, { outcome: "invalid_request" }> | undefined {
  if (!EVENT_ID.test(eventId)) {
    return { outcome: "invalid_request", message: "Event id is not a valid OMEN id." }
  }
  if (!CHECKPOINT_ID.test(checkpointId)) {
    return { outcome: "invalid_request", message: "Checkpoint id must be a UUID." }
  }
  return undefined
}

/** Raised when a checkpoint's stored members cannot be turned into a coherent view. */
export class HistoricalReconstructionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HistoricalReconstructionError"
  }
}

export interface ReconstructionMembers {
  eventId: string
  checkpoint: ReconstructionCheckpointRef
  coverage: HistoryCoverageReport
  observations: HistoricalObservation[]
  evidence: HistoricalEvidence[]
  semanticRevisions: HistoricalSemantics[]
  moveLogRevisions: HistoricalMoveLog[]
}

function latestByVersion<T extends { version: number }>(items: readonly T[]): T | null {
  return items.reduce<T | null>((best, item) => (!best || item.version > best.version ? item : best), null)
}

function summarizeProvenance(values: readonly Provenance[]): Provenance | "mixed" {
  const kinds = new Set(values)
  if (kinds.size === 0) {
    throw new HistoricalReconstructionError("checkpoint members have no provenance")
  }
  if (kinds.size > 1) return "mixed"
  return [...kinds][0]!
}

/**
 * Builds a historical view from checkpoint members only.
 * The highest member version wins. A newer revision that was not passed in
 * cannot affect the result, because this function never sees it.
 */
export function assembleHistoricalReconstruction(members: ReconstructionMembers): HistoricalReconstruction {
  const semantics = latestByVersion(members.semanticRevisions)
  if (members.coverage.semanticHistory === "recorded" && !semantics) {
    throw new HistoricalReconstructionError("semantic-history-mismatch")
  }
  if (members.coverage.semanticHistory === "unavailable" && semantics) {
    throw new HistoricalReconstructionError("semantic-history-mismatch")
  }

  const chosenLogs = new Map<string, HistoricalMoveLog>()
  for (const revision of members.moveLogRevisions) {
    const current = chosenLogs.get(revision.moveLogId)
    if (!current || revision.version > current.version) chosenLogs.set(revision.moveLogId, revision)
  }
  const moveLogs = [...chosenLogs.values()].sort((a, b) => a.moveLogId.localeCompare(b.moveLogId))

  const evidenceIds = new Set(members.evidence.map((item) => item.id))
  for (const revision of moveLogs) {
    for (const evidenceId of revision.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new HistoricalReconstructionError(
          `Move log ${revision.moveLogId} version ${revision.version} cites evidence ${evidenceId} that is outside the checkpoint.`,
        )
      }
    }
  }

  const observations = members.observations.slice().sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
  const evidence = members.evidence.slice().sort((a, b) => a.id.localeCompare(b.id))
  const provenance = semantics
    ? semantics.provenance
    : summarizeProvenance([
        ...observations.map((item) => item.provenance),
        ...evidence.map((item) => item.provenance),
        ...moveLogs.map((item) => item.provenance),
      ])

  return {
    eventId: members.eventId,
    checkpoint: members.checkpoint,
    coverage: members.coverage,
    provenance,
    semantics,
    observations,
    evidence,
    moveLogs,
  }
}
