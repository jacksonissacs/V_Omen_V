import type { ClientBase } from "pg"

import { inputContentIdentity } from "./content-identity"
import { loadEventQuestion, loadSelectedEvidence } from "./load-evidence"
import {
  AnalystValidationError,
  ANALYST_PROMPT_VERSION,
  type AnalystProposalRecord,
  type EvidenceInputRef,
} from "./types"

export class AnalystStaleContextError extends Error {
  readonly code = "stale_context" as const

  constructor(message: string) {
    super(message)
    this.name = "AnalystStaleContextError"
  }
}

export class AnalystConflictError extends Error {
  readonly code = "conflict" as const

  constructor(message: string) {
    super(message)
    this.name = "AnalystConflictError"
  }
}

export interface CurrentAnalystInputContext {
  eventQuestion: string
  promptVersion: string
  evidence: EvidenceInputRef[]
  inputContentIdentity: string
}

/** True when the proposal persisted the reviewed question + prompt version pair. */
export function hasReviewedInputContext(proposal: AnalystProposalRecord): boolean {
  return Boolean(proposal.reviewedEventQuestion?.trim() && proposal.reviewedPromptVersion?.trim())
}

/**
 * Load the authoritative current input context for an event + evidence selection.
 * Uses the live event question, the build's prompt version, and current evidence identities.
 */
export async function resolveCurrentInputContext(
  client: ClientBase,
  eventId: string,
  evidenceIds: string[],
): Promise<CurrentAnalystInputContext> {
  const eventQuestion = await loadEventQuestion(client, eventId)
  const evidence = await loadSelectedEvidence(client, eventId, evidenceIds)
  const refs: EvidenceInputRef[] = evidence.map((item) => ({
    id: item.id,
    contentIdentity: item.contentIdentity,
  }))
  const promptVersion = ANALYST_PROMPT_VERSION
  return {
    eventQuestion,
    promptVersion,
    evidence: refs,
    inputContentIdentity: inputContentIdentity({ eventQuestion, promptVersion, evidence: refs }),
  }
}

/**
 * Compare a stored proposal's input identity against current authoritative context.
 * Legacy rows without reviewed context are always stale (must regenerate/review).
 */
export async function assertProposalInputFresh(
  client: ClientBase,
  proposal: AnalystProposalRecord,
): Promise<CurrentAnalystInputContext> {
  if (!hasReviewedInputContext(proposal)) {
    throw new AnalystStaleContextError(
      `Proposal ${proposal.id} lacks reviewed event question / prompt version context. Regenerate and review; legacy approval cannot be reused.`,
    )
  }

  const evidenceIds = proposal.proposal.inputEvidence.map((ref) => ref.id)
  const current = await resolveCurrentInputContext(client, proposal.eventId, evidenceIds)

  if (current.inputContentIdentity !== proposal.inputContentIdentity) {
    throw new AnalystStaleContextError(
      `Proposal ${proposal.id} input context is stale (event question, prompt version, or evidence changed). Regenerate and review.`,
    )
  }

  // Bound the persisted reviewed fields to the identity they claim.
  const recomputedFromStored = inputContentIdentity({
    eventQuestion: proposal.reviewedEventQuestion!,
    promptVersion: proposal.reviewedPromptVersion!,
    evidence: proposal.proposal.inputEvidence,
  })
  if (recomputedFromStored !== proposal.inputContentIdentity) {
    throw new AnalystStaleContextError(
      `Proposal ${proposal.id} stored reviewed context does not match its input identity. Regenerate and review.`,
    )
  }

  if (
    proposal.reviewedEventQuestion !== current.eventQuestion ||
    proposal.reviewedPromptVersion !== current.promptVersion
  ) {
    throw new AnalystStaleContextError(
      `Proposal ${proposal.id} input context is stale (event question, prompt version, or evidence changed). Regenerate and review.`,
    )
  }

  return current
}

export function requireEvidenceIdsOnEvent(
  proposalEventId: string,
  bodyEventId: string,
): void {
  if (bodyEventId !== proposalEventId) {
    throw new AnalystValidationError(
      `Replacement eventId ${bodyEventId} does not match proposal event ${proposalEventId}.`,
    )
  }
}
