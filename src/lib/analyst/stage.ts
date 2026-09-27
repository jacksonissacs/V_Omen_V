import type { ClientBase } from "pg"

import { PublicationValidationError } from "../db/publication-bundle"
import { getSourceReviewItem, stageValidatedReviewCandidate } from "../db/source-review"
import { assertProposalInputFresh } from "./freshness"
import {
  getAnalystProposalForUpdate,
  isApprovalCurrent,
  markProposalStaged,
} from "./store"
import type { AnalystProposalBody, AnalystProposalRecord } from "./types"

export interface StageAnalystProposalArgs {
  proposalId: string
  stagedBy: string
  intakeNote?: string
  /**
   * Test-only: runs before the proposal row lock. Used to let a concurrent
   * replacement commit first without deadlocking on the staging lock.
   */
  beforeLock?: () => Promise<void>
  /**
   * Test-only: runs after FOR UPDATE + freshness, before review insert/link.
   * Must not await a mutation that needs this transaction's proposal lock.
   */
  beforeWrite?: () => Promise<void>
  /**
   * Test-only: runs after the review row is inserted/reused and before linking.
   * Throwing forces a full staging rollback (no orphan actionable review).
   */
  afterReviewInsert?: () => Promise<void>
}

/**
 * Deterministic review identity for one proposal revision.
 * Incorporates proposal_version so A→B→A content round-trips do not collide with
 * a previously rejected review id for the same content hash.
 */
export function analystProposalReviewId(proposal: Pick<
  AnalystProposalRecord,
  "id" | "proposalVersion" | "contentIdentity"
>): string {
  const suffix = proposal.id.replace(/^aprop-/, "")
  return `src-an-${suffix}-v${proposal.proposalVersion}-${proposal.contentIdentity.slice(0, 10)}`
}

function reviewMatchesRevision(
  review: Awaited<ReturnType<typeof getSourceReviewItem>>,
  proposal: AnalystProposalRecord,
): boolean {
  if (!review || review.status !== "staged") return false
  if (review.payload.kind !== "analyst_proposal") return false
  return (
    review.payload.proposalId === proposal.id &&
    review.payload.contentIdentity === proposal.contentIdentity &&
    review.payload.inputContentIdentity === proposal.inputContentIdentity &&
    (review.payload.proposalVersion === undefined ||
      review.payload.proposalVersion === proposal.proposalVersion)
  )
}

/**
 * Stage a validated proposal into the operator review queue without publishing.
 * Locks the proposal row, validates freshness, inserts/links the review item, and
 * binds the link to the locked revision inside one transaction. Retries of the
 * same unchanged revision reuse the existing review item when still staged.
 *
 * Locking the proposal does not lock the event question; freshness still re-reads
 * authoritative event/evidence context inside the staging transaction.
 */
export async function stageAnalystProposalForReview(
  client: ClientBase,
  args: StageAnalystProposalArgs,
): Promise<{ proposal: AnalystProposalRecord; reviewItemId: string; createdReviewItem: boolean }> {
  const stagedBy = args.stagedBy.trim()
  if (!stagedBy) throw new PublicationValidationError("stagedBy is required.")

  if (args.beforeLock) await args.beforeLock()

  await client.query("BEGIN")
  try {
    const proposal = await getAnalystProposalForUpdate(client, args.proposalId)
    if (!proposal) {
      throw new PublicationValidationError(`Proposal ${args.proposalId} was not found.`)
    }
    if (proposal.status === "rejected" || proposal.status === "superseded") {
      throw new PublicationValidationError(
        `Proposal ${args.proposalId} is ${proposal.status} and cannot be staged.`,
      )
    }

    // Freshness uses live event question / evidence; the proposal row lock alone
    // does not serialize event question changes.
    await assertProposalInputFresh(client, proposal)

    if (args.beforeWrite) await args.beforeWrite()

    // Idempotent staging: same revision already linked to a matching staged review.
    if (proposal.status === "staged" && proposal.sourceReviewItemId) {
      const existing = await getSourceReviewItem(client, proposal.sourceReviewItemId)
      if (reviewMatchesRevision(existing, proposal)) {
        await client.query("COMMIT")
        return { proposal, reviewItemId: existing!.id, createdReviewItem: false }
      }
    }

    const reviewId = analystProposalReviewId(proposal)
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(reviewId)) {
      throw new PublicationValidationError(`Could not derive a review id for proposal ${proposal.id}.`)
    }

    let reviewItemId = reviewId
    let createdReviewItem = false
    const existingReview = await getSourceReviewItem(client, reviewId)
    if (existingReview) {
      if (!reviewMatchesRevision(existingReview, proposal)) {
        throw new PublicationValidationError(
          existingReview.status !== "staged"
            ? `Review item ${reviewId} is already ${existingReview.status}.`
            : `Review item ${reviewId} does not match the current proposal revision.`,
        )
      }
      reviewItemId = existingReview.id
    } else {
      const item = await stageValidatedReviewCandidate(client, {
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
          proposalVersion: proposal.proposalVersion,
          reviewedEventQuestion: proposal.reviewedEventQuestion,
          reviewedPromptVersion: proposal.reviewedPromptVersion,
        },
      })
      if (!reviewMatchesRevision(item, proposal)) {
        throw new PublicationValidationError(
          `Review item ${item.id} is not an eligible staged review for proposal ${proposal.id} revision ${proposal.proposalVersion}.`,
        )
      }
      reviewItemId = item.id
      createdReviewItem = true
    }

    if (args.afterReviewInsert) await args.afterReviewInsert()

    const updated = await markProposalStaged(client, {
      id: proposal.id,
      stagedBy,
      sourceReviewItemId: reviewItemId,
      expectedProposalVersion: proposal.proposalVersion,
      expectedContentIdentity: proposal.contentIdentity,
      expectedInputContentIdentity: proposal.inputContentIdentity,
    })

    await client.query("COMMIT")
    return { proposal: updated, reviewItemId, createdReviewItem }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

export function assertProposalApprovalNotStale(
  proposal: AnalystProposalRecord,
  currentInputIdentity?: string,
): void {
  if (!isApprovalCurrent(proposal, currentInputIdentity)) {
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
  proposalVersion?: number
  reviewedEventQuestion?: string | null
  reviewedPromptVersion?: string | null
}
