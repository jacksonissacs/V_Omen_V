import { randomBytes } from "node:crypto"

import type { ClientBase } from "pg"

import { proposalContentIdentity } from "./content-identity"
import { AnalystConflictError, AnalystStaleContextError, assertProposalInputFresh } from "./freshness"
import { loadSelectedEvidence } from "./load-evidence"
import {
  AnalystValidationError,
  ANALYST_PROMPT_VERSION,
  type AnalystProposalBody,
  type AnalystProposalRecord,
  type AnalystProposalStatus,
  type AnalystRunRecord,
  type AnalystRunStatus,
  type AnalystUsage,
  type EvidenceInputRef,
} from "./types"
import { parseAnalystProposalBody } from "./validate"

interface RunRow {
  id: string
  event_id: string
  status: AnalystRunStatus
  provider_id: string
  model_id: string
  execution_kind: AnalystRunRecord["executionKind"]
  prompt_version: string
  input_evidence: EvidenceInputRef[]
  input_content_identity: string
  started_at: Date
  finished_at: Date | null
  duration_ms: number | null
  usage: AnalystUsage | null
  error_code: string | null
  error_message: string | null
  created_at: Date
}

interface ProposalRow {
  id: string
  run_id: string
  event_id: string
  proposal_version: number
  content_identity: string
  input_content_identity: string
  reviewed_event_question: string | null
  reviewed_prompt_version: string | null
  status: AnalystProposalStatus
  proposal: AnalystProposalBody
  staged_at: Date | null
  staged_by: string | null
  source_review_item_id: string | null
  approved_at: Date | null
  approved_by: string | null
  approval_content_identity: string | null
  approval_input_identity: string | null
  rejected_at: Date | null
  rejected_by: string | null
  reject_note: string | null
  created_at: Date
}

const RUN_COLUMNS = `id, event_id, status, provider_id, model_id, execution_kind, prompt_version,
            input_evidence, input_content_identity, started_at, finished_at, duration_ms, usage,
            error_code, error_message, created_at`

const PROPOSAL_COLUMNS = `id, run_id, event_id, proposal_version, content_identity, input_content_identity,
            reviewed_event_question, reviewed_prompt_version, status, proposal, staged_at, staged_by,
            source_review_item_id, approved_at, approved_by, approval_content_identity, approval_input_identity,
            rejected_at, rejected_by, reject_note, created_at`

const SHA256 = /^[a-f0-9]{64}$/

const SUPERSEDED_REVIEW_NOTE =
  "Superseded: analyst proposal was edited. This review item is no longer an actionable current proposal."

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`
}

function rowToRun(row: RunRow): AnalystRunRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    providerId: row.provider_id,
    modelId: row.model_id,
    executionKind: row.execution_kind,
    promptVersion: row.prompt_version,
    inputEvidence: row.input_evidence,
    inputContentIdentity: row.input_content_identity,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    durationMs: row.duration_ms,
    usage: row.usage,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
  }
}

function rowToProposal(row: ProposalRow): AnalystProposalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    eventId: row.event_id,
    proposalVersion: row.proposal_version,
    contentIdentity: row.content_identity,
    inputContentIdentity: row.input_content_identity,
    reviewedEventQuestion: row.reviewed_event_question,
    reviewedPromptVersion: row.reviewed_prompt_version,
    status: row.status,
    proposal: row.proposal,
    stagedAt: row.staged_at?.toISOString() ?? null,
    stagedBy: row.staged_by,
    sourceReviewItemId: row.source_review_item_id,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedBy: row.approved_by,
    approvalContentIdentity: row.approval_content_identity,
    approvalInputIdentity: row.approval_input_identity,
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectedBy: row.rejected_by,
    rejectNote: row.reject_note,
    createdAt: row.created_at.toISOString(),
  }
}

export async function insertPendingRun(
  client: ClientBase,
  args: {
    eventId: string
    providerId: string
    modelId: string
    executionKind: AnalystRunRecord["executionKind"]
    promptVersion: string
    inputEvidence: EvidenceInputRef[]
    inputContentIdentity: string
    startedAt: Date
  },
): Promise<AnalystRunRecord> {
  const id = newId("arun")
  const { rows } = await client.query<RunRow>(
    `INSERT INTO analyst_runs (
        id, event_id, status, provider_id, model_id, execution_kind, prompt_version,
        input_evidence, input_content_identity, started_at
      ) VALUES ($1,$2,'pending',$3,$4,$5,$6,$7::jsonb,$8,$9)
      RETURNING ${RUN_COLUMNS}`,
    [
      id,
      args.eventId,
      args.providerId,
      args.modelId,
      args.executionKind,
      args.promptVersion,
      JSON.stringify(args.inputEvidence),
      args.inputContentIdentity,
      args.startedAt,
    ],
  )
  return rowToRun(rows[0]!)
}

export async function finishRun(
  client: ClientBase,
  args: {
    id: string
    status: Exclude<AnalystRunStatus, "pending">
    finishedAt: Date
    durationMs: number
    usage: AnalystUsage | null
    errorCode: string | null
    errorMessage: string | null
  },
): Promise<AnalystRunRecord> {
  const { rows } = await client.query<RunRow>(
    `UPDATE analyst_runs
        SET status = $2,
            finished_at = $3,
            duration_ms = $4,
            usage = $5::jsonb,
            error_code = $6,
            error_message = $7
      WHERE id = $1
      RETURNING ${RUN_COLUMNS}`,
    [
      args.id,
      args.status,
      args.finishedAt,
      args.durationMs,
      args.usage ? JSON.stringify(args.usage) : null,
      args.errorCode,
      args.errorMessage,
    ],
  )
  if (!rows[0]) throw new Error(`Analyst run ${args.id} was not found.`)
  return rowToRun(rows[0])
}

export async function getAnalystRun(client: ClientBase, id: string): Promise<AnalystRunRecord | undefined> {
  const { rows } = await client.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM analyst_runs WHERE id = $1`, [id])
  return rows[0] ? rowToRun(rows[0]) : undefined
}

export async function listAnalystRuns(
  client: ClientBase,
  filter: { eventId?: string } = {},
): Promise<AnalystRunRecord[]> {
  const clauses = ["TRUE"]
  const params: unknown[] = []
  if (filter.eventId) {
    params.push(filter.eventId)
    clauses.push(`event_id = $${params.length}`)
  }
  const { rows } = await client.query<RunRow>(
    `SELECT ${RUN_COLUMNS} FROM analyst_runs WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, id`,
    params,
  )
  return rows.map(rowToRun)
}

export async function findProposalByContent(
  client: ClientBase,
  eventId: string,
  inputContentIdentity: string,
  contentIdentity: string,
): Promise<AnalystProposalRecord | undefined> {
  const { rows } = await client.query<ProposalRow>(
    `SELECT ${PROPOSAL_COLUMNS}
       FROM analyst_proposals
      WHERE event_id = $1 AND input_content_identity = $2 AND content_identity = $3`,
    [eventId, inputContentIdentity, contentIdentity],
  )
  return rows[0] ? rowToProposal(rows[0]) : undefined
}

export async function insertProposal(
  client: ClientBase,
  args: {
    runId: string
    eventId: string
    contentIdentity: string
    inputContentIdentity: string
    reviewedEventQuestion: string
    reviewedPromptVersion: string
    proposal: AnalystProposalBody
  },
): Promise<AnalystProposalRecord> {
  const existing = await findProposalByContent(
    client,
    args.eventId,
    args.inputContentIdentity,
    args.contentIdentity,
  )
  if (existing) return existing

  const reviewedEventQuestion = args.reviewedEventQuestion.trim()
  const reviewedPromptVersion = args.reviewedPromptVersion.trim()
  if (!reviewedEventQuestion) throw new Error("reviewedEventQuestion is required.")
  if (!reviewedPromptVersion) throw new Error("reviewedPromptVersion is required.")

  const id = newId("aprop")
  const { rows } = await client.query<ProposalRow>(
    `INSERT INTO analyst_proposals (
        id, run_id, event_id, proposal_version, content_identity, input_content_identity,
        reviewed_event_question, reviewed_prompt_version, status, proposal
      ) VALUES ($1,$2,$3,1,$4,$5,$6,$7,'draft',$8::jsonb)
      ON CONFLICT (event_id, input_content_identity, content_identity) DO NOTHING
      RETURNING ${PROPOSAL_COLUMNS}`,
    [
      id,
      args.runId,
      args.eventId,
      args.contentIdentity,
      args.inputContentIdentity,
      reviewedEventQuestion,
      reviewedPromptVersion,
      JSON.stringify(args.proposal),
    ],
  )
  if (rows[0]) return rowToProposal(rows[0])
  const raced = await findProposalByContent(
    client,
    args.eventId,
    args.inputContentIdentity,
    args.contentIdentity,
  )
  if (!raced) throw new Error("Could not persist analyst proposal.")
  return raced
}

export async function getAnalystProposal(
  client: ClientBase,
  id: string,
): Promise<AnalystProposalRecord | undefined> {
  const { rows } = await client.query<ProposalRow>(
    `SELECT ${PROPOSAL_COLUMNS} FROM analyst_proposals WHERE id = $1`,
    [id],
  )
  return rows[0] ? rowToProposal(rows[0]) : undefined
}

export async function listAnalystProposals(
  client: ClientBase,
  filter: { eventId?: string; status?: AnalystProposalStatus } = {},
): Promise<AnalystProposalRecord[]> {
  const clauses = ["TRUE"]
  const params: unknown[] = []
  if (filter.eventId) {
    params.push(filter.eventId)
    clauses.push(`event_id = $${params.length}`)
  }
  if (filter.status) {
    params.push(filter.status)
    clauses.push(`status = $${params.length}`)
  }
  const { rows } = await client.query<ProposalRow>(
    `SELECT ${PROPOSAL_COLUMNS} FROM analyst_proposals WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, id`,
    params,
  )
  return rows.map(rowToProposal)
}

export async function markProposalStaged(
  client: ClientBase,
  args: {
    id: string
    stagedBy: string
    sourceReviewItemId: string
    stagedAt?: Date
  },
): Promise<AnalystProposalRecord> {
  const { rows } = await client.query<ProposalRow>(
    `UPDATE analyst_proposals
        SET status = 'staged',
            staged_at = $2,
            staged_by = $3,
            source_review_item_id = $4
      WHERE id = $1 AND status IN ('draft', 'staged')
      RETURNING ${PROPOSAL_COLUMNS}`,
    [args.id, args.stagedAt ?? new Date(), args.stagedBy, args.sourceReviewItemId],
  )
  if (!rows[0]) {
    const existing = await getAnalystProposal(client, args.id)
    if (!existing) throw new Error(`Proposal ${args.id} was not found.`)
    throw new Error(`Proposal ${args.id} is ${existing.status} and cannot be staged.`)
  }
  return rowToProposal(rows[0])
}

export interface ApproveAnalystProposalArgs {
  id: string
  approvedBy: string
  /**
   * Identities of the exact proposal body and inputs the operator reviewed.
   * The atomic UPDATE refuses if either identity no longer matches (concurrent edit)
   * or the row is no longer draft/staged (concurrent reject).
   */
  expectedContentIdentity: string
  expectedInputContentIdentity: string
  /**
   * Test-only synchronization hook invoked after argument validation and before the
   * guarded UPDATE. Production callers must omit this.
   */
  beforeWrite?: () => Promise<void>
}

/**
 * Record human approval of a proposal draft. Approval binds to content + input identities.
 * A changed input or edited proposal must not inherit this approval.
 * Eligibility is enforced in the UPDATE predicate — not only by a prior JavaScript read.
 * Freshness against the current event question / prompt version / evidence is checked first.
 */
export async function approveAnalystProposal(
  client: ClientBase,
  args: ApproveAnalystProposalArgs,
): Promise<AnalystProposalRecord> {
  const approvedBy = args.approvedBy.trim()
  if (!approvedBy) throw new Error("approvedBy is required.")
  const expectedContentIdentity = args.expectedContentIdentity.trim()
  const expectedInputContentIdentity = args.expectedInputContentIdentity.trim()
  if (!SHA256.test(expectedContentIdentity)) {
    throw new Error("expectedContentIdentity must be a sha256 hex digest.")
  }
  if (!SHA256.test(expectedInputContentIdentity)) {
    throw new Error("expectedInputContentIdentity must be a sha256 hex digest.")
  }

  const current = await getAnalystProposal(client, args.id)
  if (!current) throw new Error(`Proposal ${args.id} was not found.`)
  await assertProposalInputFresh(client, current)

  if (args.beforeWrite) await args.beforeWrite()

  const { rows } = await client.query<ProposalRow>(
    `UPDATE analyst_proposals
        SET approved_at = now(),
            approved_by = $2,
            approval_content_identity = content_identity,
            approval_input_identity = input_content_identity
      WHERE id = $1
        AND status IN ('draft', 'staged')
        AND content_identity = $3
        AND input_content_identity = $4
        AND reviewed_event_question IS NOT NULL
        AND reviewed_prompt_version IS NOT NULL
        AND reviewed_prompt_version = $5
        AND reviewed_event_question = (SELECT question FROM events WHERE id = analyst_proposals.event_id)
      RETURNING ${PROPOSAL_COLUMNS}`,
    [args.id, approvedBy, expectedContentIdentity, expectedInputContentIdentity, ANALYST_PROMPT_VERSION],
  )
  if (!rows[0]) {
    const existing = await getAnalystProposal(client, args.id)
    if (!existing) throw new Error(`Proposal ${args.id} was not found.`)
    if (!existing.reviewedEventQuestion || !existing.reviewedPromptVersion) {
      throw new AnalystStaleContextError(
        `Proposal ${args.id} lacks reviewed event question / prompt version context. Regenerate and review; legacy approval cannot be reused.`,
      )
    }
    if (existing.status !== "draft" && existing.status !== "staged") {
      throw new Error(`Proposal ${args.id} is ${existing.status} and cannot be approved.`)
    }
    throw new Error(
      `Proposal ${args.id} changed since review (content or input identity mismatch). Re-load and approve the current draft.`,
    )
  }
  return rowToProposal(rows[0])
}

export interface RejectAnalystProposalArgs {
  id: string
  rejectedBy: string
  /** Exact proposal_version the caller reviewed. A newer revision must not be rejected. */
  expectedProposalVersion: number
  note?: string
  /** Test-only synchronization hook before the guarded UPDATE. */
  beforeWrite?: () => Promise<void>
}

/**
 * Reject a specific proposal revision. The version comparison is enforced in the UPDATE
 * predicate so a stale rejection cannot reject a newer revision.
 */
export async function rejectAnalystProposal(
  client: ClientBase,
  args: RejectAnalystProposalArgs,
): Promise<AnalystProposalRecord> {
  const rejectedBy = args.rejectedBy.trim()
  if (!rejectedBy) throw new Error("rejectedBy is required.")
  if (!Number.isInteger(args.expectedProposalVersion) || args.expectedProposalVersion < 1) {
    throw new Error("expectedProposalVersion must be a positive integer.")
  }

  if (args.beforeWrite) await args.beforeWrite()

  const { rows } = await client.query<ProposalRow>(
    `UPDATE analyst_proposals
        SET status = 'rejected',
            rejected_at = now(),
            rejected_by = $2,
            reject_note = $3,
            approved_at = NULL,
            approved_by = NULL,
            approval_content_identity = NULL,
            approval_input_identity = NULL
      WHERE id = $1
        AND status IN ('draft', 'staged')
        AND proposal_version = $4
      RETURNING ${PROPOSAL_COLUMNS}`,
    [args.id, rejectedBy, args.note?.trim() || null, args.expectedProposalVersion],
  )
  if (!rows[0]) {
    const existing = await getAnalystProposal(client, args.id)
    if (!existing) throw new Error(`Proposal ${args.id} was not found.`)
    if (existing.status !== "draft" && existing.status !== "staged") {
      throw new Error(`Proposal ${args.id} is already ${existing.status}.`)
    }
    if (existing.proposalVersion !== args.expectedProposalVersion) {
      throw new AnalystConflictError(
        `Proposal ${args.id} rejection is stale: reviewed version ${args.expectedProposalVersion}, current version ${existing.proposalVersion}.`,
      )
    }
    throw new Error(`Proposal ${args.id} is already ${existing.status}.`)
  }
  return rowToProposal(rows[0])
}

/**
 * True only when the proposal is still reviewable, has reviewed input context, and
 * approval identities still match the proposal's current content and input identities.
 * Rejected/superseded/legacy rows never count as currently approved.
 * When `currentInputIdentity` is supplied, it must also match (authoritative freshness).
 */
export function isApprovalCurrent(
  proposal: AnalystProposalRecord,
  currentInputIdentity?: string,
): boolean {
  if (proposal.status === "rejected" || proposal.status === "superseded") return false
  if (proposal.status !== "draft" && proposal.status !== "staged") return false
  if (!proposal.reviewedEventQuestion || !proposal.reviewedPromptVersion) return false
  if (!proposal.approvedAt || !proposal.approvalContentIdentity || !proposal.approvalInputIdentity) {
    return false
  }
  if (
    proposal.approvalContentIdentity !== proposal.contentIdentity ||
    proposal.approvalInputIdentity !== proposal.inputContentIdentity
  ) {
    return false
  }
  if (currentInputIdentity !== undefined && currentInputIdentity !== proposal.inputContentIdentity) {
    return false
  }
  return true
}

export interface ReplaceProposalBodyArgs {
  id: string
  /** Replacement body; validated with schema + event-scoped evidence checks. */
  proposal: unknown
  /** Exact proposal_version the caller intends to replace. Guards concurrent newer edits. */
  expectedProposalVersion: number
  /** Test-only synchronization hook after validation and before the guarded UPDATE. */
  beforeWrite?: () => Promise<void>
}

/**
 * Validate and replace a proposal body. Computes the content hash internally.
 * Invalid replacements leave the database unchanged. Successful replacements
 * atomically clear approval/staging and invalidate any linked review item.
 */
export async function replaceProposalBody(
  client: ClientBase,
  args: ReplaceProposalBodyArgs,
): Promise<AnalystProposalRecord> {
  if (!Number.isInteger(args.expectedProposalVersion) || args.expectedProposalVersion < 1) {
    throw new Error("expectedProposalVersion must be a positive integer.")
  }

  const existing = await getAnalystProposal(client, args.id)
  if (!existing) throw new Error(`Proposal ${args.id} was not found.`)
  if (existing.status !== "draft" && existing.status !== "staged") {
    throw new Error(`Proposal ${args.id} cannot be edited in its current status.`)
  }
  if (existing.proposalVersion !== args.expectedProposalVersion) {
    throw new AnalystConflictError(
      `Proposal ${args.id} replacement is stale: expected version ${args.expectedProposalVersion}, current version ${existing.proposalVersion}.`,
    )
  }

  // Validate before any mutation. On failure the database stays unchanged.
  const allowed = new Set(existing.proposal.inputEvidence.map((ref) => ref.id))
  let body: AnalystProposalBody
  try {
    body = parseAnalystProposalBody(args.proposal, allowed)
  } catch (error) {
    if (error instanceof AnalystValidationError) throw error
    throw error
  }
  if (body.eventId !== existing.eventId) {
    throw new AnalystValidationError(
      `Replacement eventId ${body.eventId} does not match proposal event ${existing.eventId}.`,
    )
  }
  for (const ref of body.inputEvidence) {
    const prior = existing.proposal.inputEvidence.find((item) => item.id === ref.id)
    if (!prior || prior.contentIdentity !== ref.contentIdentity) {
      throw new AnalystValidationError(
        `Replacement inputEvidence content identity mismatch for ${ref.id}.`,
      )
    }
  }
  // Event-scoped evidence membership: cited ids must still exist on this event.
  await loadSelectedEvidence(
    client,
    existing.eventId,
    body.inputEvidence.map((ref) => ref.id),
  )

  const contentIdentity = proposalContentIdentity(body)

  if (args.beforeWrite) await args.beforeWrite()

  // Atomic replace + review-item invalidation. Version predicate guards concurrent newer edits.
  const { rows } = await client.query<ProposalRow>(
    `WITH target AS (
        SELECT id, source_review_item_id
          FROM analyst_proposals
         WHERE id = $1
           AND status IN ('draft', 'staged')
           AND proposal_version = $4
         FOR UPDATE
      ),
      invalidated AS (
        UPDATE source_review_items sri
           SET status = 'rejected',
               reviewed_at = COALESCE(sri.reviewed_at, now()),
               reviewed_by = COALESCE(sri.reviewed_by, 'omen-analyst-integrity'),
               review_note = $5
          FROM target
         WHERE sri.id = target.source_review_item_id
           AND sri.status IN ('staged', 'approved')
         RETURNING sri.id
      )
      UPDATE analyst_proposals ap
         SET proposal = $2::jsonb,
             content_identity = $3,
             proposal_version = proposal_version + 1,
             approved_at = NULL,
             approved_by = NULL,
             approval_content_identity = NULL,
             approval_input_identity = NULL,
             status = CASE WHEN status = 'staged' THEN 'draft' ELSE status END,
             staged_at = NULL,
             staged_by = NULL,
             source_review_item_id = NULL
        FROM target
       WHERE ap.id = target.id
       RETURNING ap.id, ap.run_id, ap.event_id, ap.proposal_version, ap.content_identity,
                 ap.input_content_identity, ap.reviewed_event_question, ap.reviewed_prompt_version,
                 ap.status, ap.proposal, ap.staged_at, ap.staged_by, ap.source_review_item_id,
                 ap.approved_at, ap.approved_by, ap.approval_content_identity, ap.approval_input_identity,
                 ap.rejected_at, ap.rejected_by, ap.reject_note, ap.created_at`,
    [args.id, JSON.stringify(body), contentIdentity, args.expectedProposalVersion, SUPERSEDED_REVIEW_NOTE],
  )

  if (!rows[0]) {
    const raced = await getAnalystProposal(client, args.id)
    if (!raced) throw new Error(`Proposal ${args.id} was not found.`)
    if (raced.proposalVersion !== args.expectedProposalVersion) {
      throw new AnalystConflictError(
        `Proposal ${args.id} replacement is stale: expected version ${args.expectedProposalVersion}, current version ${raced.proposalVersion}.`,
      )
    }
    throw new Error(`Proposal ${args.id} cannot be edited in its current status.`)
  }
  return rowToProposal(rows[0])
}
