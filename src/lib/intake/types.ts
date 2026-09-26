/** Review-queue records. These are not published evidence and carry no probability. */

export const INTAKE_SOURCE_ID = "cisa-kev" as const

export type IntakeSourceId = typeof INTAKE_SOURCE_ID

export type IntakeAssociation = "none" | "configured" | "operator"

/** `selected` is an operator decision inside the queue. It is not publication. */
export type IntakeReviewState = "pending" | "selected" | "rejected"

export type IntakeFailureKind =
  | "malformed"
  | "unavailable"
  | "rate_limited"
  | "too_large"
  | "blocked_target"

export interface IntakeFailure {
  kind: IntakeFailureKind
  message: string
  status?: number
}

/**
 * One captured version of a source item.
 * `sourcePublishedAt` is a clock time the source stated. A date with no time
 * stays in `sourcePublishedDate`, and a missing date leaves both null.
 * `firstFetchedAt` is when OMEN stored this version.
 */
export interface IntakeVersion {
  id: string
  sourceId: IntakeSourceId
  sourceItemId: string
  version: number
  canonicalUrl: string
  title: string
  excerpt: string
  sourcePublishedAt: string | null
  sourcePublishedDate: string | null
  firstFetchedAt: string
  contentIdentity: string
  vendorProject: string
  product: string
  candidateEventId: string | null
  association: IntakeAssociation
  reviewState: IntakeReviewState
  priorVersionId: string | null
}

export interface IntakeQueue {
  schema: 1
  sourceId: IntakeSourceId
  lastRequestAt: string | null
  versions: IntakeVersion[]
}

export interface CapturedDraft {
  sourceId: IntakeSourceId
  sourceItemId: string
  canonicalUrl: string
  title: string
  /** Plain-text excerpt stored for review. */
  excerpt: string
  /** Full sanitized description, bounded, used only to detect a content change. */
  description: string
  sourcePublishedAt: null
  sourcePublishedDate: string | null
  vendorProject: string
  product: string
  contentIdentity: string
}

export interface MatchRule {
  sourceId: IntakeSourceId
  vendorProject: string
  product?: string
  eventId: string
}

export interface MalformedEntry {
  sourceItemId: string | null
  message: string
}

export interface IntakeRefreshReport {
  sourceId: IntakeSourceId
  ok: boolean
  fetchedAt: string
  failure: IntakeFailure | null
  sourceCatalogVersion: string | null
  staged: IntakeVersion[]
  duplicates: string[]
  changed: { id: string; priorVersionId: string; sourceItemId: string }[]
  undated: string[]
  malformedEntries: MalformedEntry[]
  ambiguous: string[]
  truncated: boolean
  windowSize: number
  requests: number
}
