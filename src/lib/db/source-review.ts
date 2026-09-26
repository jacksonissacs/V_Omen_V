import type { ClientBase } from "pg"

import { PublicationValidationError, type SourceReviewCandidate, parseStageSourceReviewInput } from "./publication-bundle"

export type SourceReviewStatus = "staged" | "approved" | "rejected"

export interface SourceReviewItem {
  id: string
  eventId: string
  status: SourceReviewStatus
  payload: SourceReviewCandidate
  intakeNote: string | null
  stagedAt: string
  stagedBy: string
  reviewedAt: string | null
  reviewedBy: string | null
  reviewNote: string | null
}

interface SourceReviewRow {
  id: string
  event_id: string
  status: SourceReviewStatus
  payload: SourceReviewCandidate
  intake_note: string | null
  staged_at: Date
  staged_by: string
  reviewed_at: Date | null
  reviewed_by: string | null
  review_note: string | null
}

function rowToItem(row: SourceReviewRow): SourceReviewItem {
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    payload: row.payload,
    intakeNote: row.intake_note,
    stagedAt: row.staged_at.toISOString(),
    stagedBy: row.staged_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
  }
}

export async function stageSourceReviewItem(client: ClientBase, input: unknown): Promise<SourceReviewItem> {
  const parsed = parseStageSourceReviewInput(input)
  const { rowCount: eventExists } = await client.query("SELECT 1 FROM events WHERE id = $1", [parsed.eventId])
  const createsEvent =
    parsed.candidate.kind === "bundle" && parsed.candidate.bundle.event !== undefined
  if (!eventExists && !createsEvent) {
    throw new PublicationValidationError(
      `Event ${parsed.eventId} is not stored. Stage a bundle candidate that includes bundle.event to create it.`,
    )
  }
  if (parsed.candidate.kind === "bundle" && parsed.candidate.bundle.event) {
    if (parsed.candidate.bundle.event.id !== parsed.eventId) {
      throw new PublicationValidationError("candidate.bundle.event.id must match eventId.")
    }
  }
  const { rows } = await client.query<SourceReviewRow>(
    `INSERT INTO source_review_items (id, event_id, status, payload, intake_note, staged_by)
     VALUES ($1, $2, 'staged', $3::jsonb, $4, $5)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, event_id, status, payload, intake_note, staged_at, staged_by, reviewed_at, reviewed_by, review_note`,
    [parsed.id, parsed.eventId, JSON.stringify(parsed.candidate), parsed.intakeNote ?? null, parsed.stagedBy],
  )
  if (rows[0]) return rowToItem(rows[0])
  const existing = await getSourceReviewItem(client, parsed.id)
  if (!existing) throw new PublicationValidationError(`Could not stage review item ${parsed.id}.`)
  if (existing.status !== "staged") {
    throw new PublicationValidationError(`Review item ${parsed.id} is already ${existing.status}.`)
  }
  return existing
}

export async function listSourceReviewItems(
  client: ClientBase,
  filter: { status?: SourceReviewStatus; eventId?: string } = {},
): Promise<SourceReviewItem[]> {
  const clauses = ["TRUE"]
  const params: unknown[] = []
  if (filter.status) {
    params.push(filter.status)
    clauses.push(`status = $${params.length}`)
  }
  if (filter.eventId) {
    params.push(filter.eventId)
    clauses.push(`event_id = $${params.length}`)
  }
  const { rows } = await client.query<SourceReviewRow>(
    `SELECT id, event_id, status, payload, intake_note, staged_at, staged_by, reviewed_at, reviewed_by, review_note
       FROM source_review_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY staged_at DESC, id`,
    params,
  )
  return rows.map(rowToItem)
}

export async function getSourceReviewItem(client: ClientBase, id: string): Promise<SourceReviewItem | undefined> {
  const { rows } = await client.query<SourceReviewRow>(
    `SELECT id, event_id, status, payload, intake_note, staged_at, staged_by, reviewed_at, reviewed_by, review_note
       FROM source_review_items WHERE id = $1`,
    [id],
  )
  return rows[0] ? rowToItem(rows[0]) : undefined
}

async function setReviewOutcome(
  client: ClientBase,
  id: string,
  status: Exclude<SourceReviewStatus, "staged">,
  reviewedBy: string,
  reviewNote: string | null,
): Promise<SourceReviewItem> {
  const reviewer = reviewedBy.trim()
  if (!reviewer) throw new PublicationValidationError("reviewedBy is required.")
  const { rows } = await client.query<SourceReviewRow>(
    `UPDATE source_review_items
        SET status = $2, reviewed_at = now(), reviewed_by = $3, review_note = $4
      WHERE id = $1 AND status = 'staged'
      RETURNING id, event_id, status, payload, intake_note, staged_at, staged_by, reviewed_at, reviewed_by, review_note`,
    [id, status, reviewer, reviewNote],
  )
  const row = rows[0]
  if (!row) {
    const existing = await getSourceReviewItem(client, id)
    if (!existing) throw new PublicationValidationError(`Review item ${id} was not found.`)
    throw new PublicationValidationError(`Review item ${id} is already ${existing.status}.`)
  }
  return rowToItem(row)
}

export async function approveSourceReviewItem(
  client: ClientBase,
  id: string,
  reviewedBy: string,
  reviewNote?: string,
): Promise<SourceReviewItem> {
  return setReviewOutcome(client, id, "approved", reviewedBy, reviewNote?.trim() ?? null)
}

export async function rejectSourceReviewItem(
  client: ClientBase,
  id: string,
  reviewedBy: string,
  reviewNote?: string,
): Promise<SourceReviewItem> {
  return setReviewOutcome(client, id, "rejected", reviewedBy, reviewNote?.trim() ?? null)
}
