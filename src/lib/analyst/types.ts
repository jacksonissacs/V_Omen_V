/**
 * Analyst proposal contract (V0).
 *
 * Separates reported facts from interpretation. Does not carry probabilities,
 * deadlines, explained percentages, source reliability scores, or proven causality.
 *
 * Citation membership validation checks that claim evidence ids were supplied as
 * inputs. It does not prove that a source supports the claim text.
 */

export const ANALYST_PROMPT_VERSION = "omen-analyst-proposal-v1"

export type AnalystClaimKind = "reported_fact" | "interpretation"

export type AnalystExecutionKind = "synthetic" | "live"

export type AnalystRunStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "unavailable"
  | "rejected_output"

export type AnalystProposalStatus = "draft" | "staged" | "rejected" | "superseded"

export interface EvidenceInputRef {
  id: string
  contentIdentity: string
}

export interface StoredEvidenceInput {
  id: string
  eventId: string
  sourceName: string
  sourceUrl: string | null
  sourcePublishedAt: string | null
  firstObservedAt: string
  capturedAt: string
  summary: string
  stance: "supports" | "contradicts" | "contextual"
  /** Stored reliability is not copied into proposal output. */
  reliability: number
  recordedBy: string
  provenance: "demo" | "sourced"
  contentIdentity: string
}

export interface AnalystClaim {
  text: string
  kind: AnalystClaimKind
  /** Must be a subset of the selected input evidence ids. Membership ≠ support. */
  evidenceIds: string[]
}

export interface AnalystAbstention {
  abstained: boolean
  reason: string | null
}

/**
 * Strictly validated proposal body accepted after schema + membership checks.
 */
export interface AnalystProposalBody {
  eventId: string
  inputEvidence: EvidenceInputRef[]
  /** Brief summary of what the selected evidence reports (facts, not interpretation). */
  evidenceSummary: string
  /** Suggested interpretation / why it may matter. Empty when abstained. */
  interpretation: string
  /** Contradictions, limitations, and unanswered questions. */
  contradictionsLimitationsQuestions: string[]
  claims: AnalystClaim[]
  abstention: AnalystAbstention
}

export interface AnalystUsage {
  inputTokens?: number
  outputTokens?: number
  /** Cost stays unknown unless the provider reports a concrete amount. */
  costUsd?: number | null
}

export interface AnalystRunRecord {
  id: string
  eventId: string
  status: AnalystRunStatus
  providerId: string
  modelId: string
  executionKind: AnalystExecutionKind
  promptVersion: string
  inputEvidence: EvidenceInputRef[]
  inputContentIdentity: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  usage: AnalystUsage | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
}

export interface AnalystProposalRecord {
  id: string
  runId: string
  eventId: string
  proposalVersion: number
  contentIdentity: string
  inputContentIdentity: string
  /**
   * Event question captured when the proposal's input identity was formed.
   * Null on pre-integrity (legacy) rows — those cannot retain effective approval.
   */
  reviewedEventQuestion: string | null
  /**
   * Prompt version captured when the proposal's input identity was formed.
   * Null on pre-integrity (legacy) rows — those cannot retain effective approval.
   */
  reviewedPromptVersion: string | null
  status: AnalystProposalStatus
  proposal: AnalystProposalBody
  stagedAt: string | null
  stagedBy: string | null
  sourceReviewItemId: string | null
  approvedAt: string | null
  approvedBy: string | null
  approvalContentIdentity: string | null
  approvalInputIdentity: string | null
  rejectedAt: string | null
  rejectedBy: string | null
  rejectNote: string | null
  createdAt: string
}

export class AnalystValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AnalystValidationError"
  }
}

export class AnalystProviderError extends Error {
  constructor(
    readonly code: "timeout" | "provider_failure" | "unavailable" | "misconfigured",
    message: string,
  ) {
    super(message)
    this.name = "AnalystProviderError"
  }
}
