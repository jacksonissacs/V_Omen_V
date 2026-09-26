import type {
  EventCategory,
  EventSource,
  ObservationSourceKind,
  ProbabilityType,
  Provenance,
  Significance,
} from "@/types/event"

const INT8_MAX = BigInt("9223372036854775807")

function isPositiveInt8Text(value: string): boolean {
  if (!/^[1-9]\d{0,18}$/.test(value)) return false
  return BigInt(value) <= INT8_MAX
}

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
  /** `probability_observations.id` as decimal text. Never a JSON number. */
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
  /** `move_log_revisions.id` as decimal text. Never a JSON number. */
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
  /** `history_checkpoints.id` as decimal text. Never a JSON number. */
  id: string
  sequence: number
  contentMd5: string
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

/** One published checkpoint, without its member rows. Discovery only; reading verifies. */
export interface HistoryCheckpointSummary {
  id: string
  sequence: number
  contentMd5: string
  memberCount: number
  semanticHistory: "recorded" | "unavailable"
}

export interface HistoryCheckpointPage {
  eventId: string
  limit: number
  hasMore: boolean
  checkpoints: HistoryCheckpointSummary[]
}

export type ReconstructionOutcome =
  | { outcome: "reconstruction"; reconstruction: HistoricalReconstruction }
  | { outcome: "pre_coverage"; reconstruction: HistoricalReconstruction }
  | { outcome: "invalid_request"; message: string }
  | { outcome: "unknown_event" }
  | { outcome: "missing_checkpoint"; message: string }
  | { outcome: "verification_failed"; message: string }
  | { outcome: "unsupported_history"; message: string }

export type CheckpointListOutcome =
  | ({ outcome: "checkpoints" } & HistoryCheckpointPage)
  | { outcome: "invalid_request"; message: string }
  | { outcome: "unknown_event" }
  | { outcome: "unsupported_history"; message: string }

export const DEMO_RECONSTRUCTION_UNSUPPORTED =
  "Stored reconstruction is not available from demo storage."

export const CHECKPOINT_NOT_FOUND = "No verified history checkpoint matches this event."

export const ARBITRARY_TIME_UNSUPPORTED =
  "Arbitrary-time reconstruction is not a verified visibility boundary. Replay a stored checkpoint id."

/** Default and maximum page size for checkpoint discovery. */
export const HISTORY_CHECKPOINT_LIST_DEFAULT = 20
export const HISTORY_CHECKPOINT_LIST_MAX = 50

const EVENT_ID = /^[a-z0-9][a-z0-9-]{2,79}$/
const PG_INT4_MAX = 2_147_483_647

export function invalidEventId(
  eventId: string,
): Extract<ReconstructionOutcome, { outcome: "invalid_request" }> | undefined {
  if (!EVENT_ID.test(eventId)) {
    return { outcome: "invalid_request", message: "Event id is not a valid OMEN id." }
  }
  return undefined
}

export function invalidCheckpointId(
  checkpointId: string,
): Extract<ReconstructionOutcome, { outcome: "invalid_request" }> | undefined {
  if (!isPositiveInt8Text(checkpointId)) {
    return { outcome: "invalid_request", message: "Checkpoint id must be a positive decimal bigint." }
  }
  return undefined
}

export function validateReconstructionRequest(
  eventId: string,
  checkpointId: string,
): Extract<ReconstructionOutcome, { outcome: "invalid_request" }> | undefined {
  return invalidEventId(eventId) ?? invalidCheckpointId(checkpointId)
}

export interface CheckpointListQuery {
  limit: number
  beforeSequence?: number
}

/** Enforces the discovery page bound. Over-max limits are rejected, not clamped. */
export function resolveCheckpointListQuery(
  input: { limit?: number; beforeSequence?: number } = {},
): CheckpointListQuery | Extract<CheckpointListOutcome, { outcome: "invalid_request" }> {
  const limit = input.limit ?? HISTORY_CHECKPOINT_LIST_DEFAULT
  if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_CHECKPOINT_LIST_MAX) {
    return {
      outcome: "invalid_request",
      message: `Checkpoint list limit must be an integer from 1 to ${HISTORY_CHECKPOINT_LIST_MAX}.`,
    }
  }
  if (input.beforeSequence !== undefined) {
    if (!Number.isInteger(input.beforeSequence) || input.beforeSequence < 1 || input.beforeSequence > PG_INT4_MAX) {
      return { outcome: "invalid_request", message: "beforeSequence must be a positive integer." }
    }
  }
  return {
    limit,
    ...(input.beforeSequence !== undefined ? { beforeSequence: input.beforeSequence } : {}),
  }
}

export type HistoryListRequest =
  | ({ outcome: "ready" } & CheckpointListQuery)
  | Extract<CheckpointListOutcome, { outcome: "invalid_request" | "unsupported_history" }>

/** Parses the discovery query. `at` and `cutoff` never become a storage read. */
export function parseHistoryListRequest(eventId: string, url: URL): HistoryListRequest {
  const badEvent = invalidEventId(eventId)
  if (badEvent) return badEvent
  if (url.searchParams.has("at") || url.searchParams.has("cutoff")) {
    return { outcome: "unsupported_history", message: ARBITRARY_TIME_UNSUPPORTED }
  }
  const limitRaw = url.searchParams.get("limit")
  const beforeRaw = url.searchParams.get("beforeSequence")
  let limit: number | undefined
  if (limitRaw !== null) {
    if (!/^[1-9]\d{0,8}$/.test(limitRaw)) {
      return {
        outcome: "invalid_request",
        message: `Checkpoint list limit must be an integer from 1 to ${HISTORY_CHECKPOINT_LIST_MAX}.`,
      }
    }
    limit = Number(limitRaw)
  }
  let beforeSequence: number | undefined
  if (beforeRaw !== null) {
    if (!/^[1-9]\d{0,9}$/.test(beforeRaw)) {
      return { outcome: "invalid_request", message: "beforeSequence must be a positive integer." }
    }
    beforeSequence = Number(beforeRaw)
  }
  const resolved = resolveCheckpointListQuery({ limit, beforeSequence })
  if ("outcome" in resolved) return resolved
  return { outcome: "ready", ...resolved }
}

/** Raised when checkpoint members cannot be turned into a coherent view. */
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

  const observations = members.observations
    .slice()
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
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
