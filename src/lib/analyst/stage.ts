import type { ClientBase } from "pg"

import { PublicationValidationError } from "../db/publication-bundle"
import { getSourceReviewItem, stageSourceReviewItem } from "../db/source-review"
import { markProposalStaged, getAnalystProposal, isApprovalCurrent } from "./store"
import type { AnalystProposalBody, AnalystProposalRecord } from "./types"

/**
 * Stage a validated proposal into the operator review queue without publishing.
 * Retries of the same proposal content reuse the existing review item when still staged.
 */
export async function stageAnalystProposalForReview(
  client: ClientBase,
  args: {
    proposalId: string
    stagedBy: string
    intakeNote?: string
  },
): Promise<{ proposal: AnalystProposalRecord; reviewItemId: string; createdReviewItem: boolean }> {
  const proposal = await getAnalystProposal(client, args.proposalId)
  if (!proposal) throw new PublicationValidationError(`Proposal ${args.proposalId} was not found.`)
  if (proposal.status === "rejected" || proposal.status === "superseded") {
    throw new PublicationValidationError(`Proposal ${args.proposalId} is ${proposal.status} and cannot be staged.`)
  }

  const stagedBy = args.stagedBy.trim()
  if (!stagedBy) throw new PublicationValidationError("stagedBy is required.")

  // Idempotent staging: same proposal already linked to a staged review item.
  if (proposal.status === "staged" && proposal.sourceReviewItemId) {
    const existing = await getSourceReviewItem(client, proposal.sourceReviewItemId)
    if (existing && existing.status === "staged") {
      return { proposal, reviewItemId: existing.id, createdReviewItem: false }
    }
  }

  const reviewId = `src-an-${proposal.id.replace(/^aprop-/, "")}-${proposal.contentIdentity.slice(0, 10)}`
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(reviewId)) {
    throw new PublicationValidationError(`Could not derive a review id for proposal ${proposal.id}.`)
  }
  const existingReview = await getSourceReviewItem(client, reviewId)
  if (existingReview) {
    if (existingReview.status !== "staged") {
      throw new PublicationValidationError(
        `Review item ${reviewId} is already ${existingReview.status}. A changed proposal needs a new proposal id; approvals do not carry over.`,
      )
    }
    const updated = await markProposalStaged(client, {
      id: proposal.id,
      stagedBy,
      sourceReviewItemId: existingReview.id,
    })
    return { proposal: updated, reviewItemId: existingReview.id, createdReviewItem: false }
  }

  const item = await stageSourceReviewItem(client, {
    id: reviewId,
    eventId: proposal.eventId,
    stagedBy,
    intakeNote:
      args.intakeNote ??
      `Analyst proposal ${proposal.id} (run ${proposal.runId}). Human review required. Not published.`,
    candidate: {
      kind: "analyst_proposal",
      proposalId: proposal.id,
      contentIdentity: proposal.contentIdentity,
      inputContentIdentity: proposal.inputContentIdentity,
      proposal: proposal.proposal,
    },
  })

  const updated = await markProposalStaged(client, {
    id: proposal.id,
    stagedBy,
    sourceReviewItemId: item.id,
  })
  return { proposal: updated, reviewItemId: item.id, createdReviewItem: true }
}

export function assertProposalApprovalNotStale(proposal: AnalystProposalRecord): void {
  if (!isApprovalCurrent(proposal)) {
    throw new PublicationValidationError(
      `Proposal ${proposal.id} has no current approval. Changed inputs or edited proposal text do not inherit an older approval.`,
    )
  }
}

/** Helper for tests and docs: a Move Log draft is a separate operator step. */
export function proposalIsNotPublishableBundle(candidateKind: string): boolean {
  return candidateKind === "analyst_proposal"
}

export type AnalystProposalCandidate = {
  kind: "analyst_proposal"
  proposalId: string
  contentIdentity: string
  inputContentIdentity: string
  proposal: AnalystProposalBody
}
