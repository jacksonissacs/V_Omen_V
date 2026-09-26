import type { ClientBase } from "pg"

import {
  PublicationValidationError,
  type ReviewStance,
  type SourceReviewCandidate,
  parseStageSourceReviewInput,
} from "./publication-bundle"

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
  intakeSourceId: string | null
  intakeItemId: string | null
  capturedVersion: number | null
  contentIdentity: string | null
  canonicalUrl: string | null
  sourcePublishedAt: string | null
  sourcePublishedDate: string | null
  firstFetchedAt: string | null
  reviewStance: ReviewStance | null
  reviewReliability: number | null
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
  intake_source_id: string | null
  intake_item_id: string | null
  captured_version: number | null
  content_identity: string | null
  canonical_url: string | null
  source_published_at: Date | null
  source_published_date: string | null
  first_fetched_at: Date | null
  review_stance: ReviewStance | null
  review_reliability: number | null
}

const REVIEW_COLUMNS = `id, event_id, status, payload, intake_note, staged_at, staged_by, reviewed_at, reviewed_by, review_note,
            intake_source_id, intake_item_id, captured_version, content_identity, canonical_url,
            source_published_at, source_published_date::text AS source_published_date, first_fetched_at,
            review_stance, review_reliability::float8 AS review_reliability`

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
    intakeSourceId: row.intake_source_id,
    intakeItemId: row.intake_item_id,
    capturedVersion: row.captured_version,
    contentIdentity: row.content_identity,
    canonicalUrl: row.canonical_url,
    sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
    sourcePublishedDate: row.source_published_date,
    firstFetchedAt: row.first_fetched_at?.toISOString() ?? null,
    reviewStance: row.review_stance,
    reviewReliability: row.review_reliability,
  }
}

async function withReviewLock<T>(client: ClientBase, id: string, body: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [`review:${id}`])
  try {
    return await body()
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`review:${id}`])
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
     RETURNING ${REVIEW_COLUMNS}`,
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
    `SELECT ${REVIEW_COLUMNS}
       FROM source_review_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY staged_at DESC, id`,
    params,
  )
  return rows.map(rowToItem)
}

export async function getSourceReviewItem(client: ClientBase, id: string): Promise<SourceReviewItem | undefined> {
  const { rows } = await client.query<SourceReviewRow>(
    `SELECT ${REVIEW_COLUMNS}
       FROM source_review_items WHERE id = $1`,
    [id],
  )
  return rows[0] ? rowToItem(rows[0]) : undefined
}

function assertReliability(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new PublicationValidationError("reliability must be a number from 0 to 1.")
  }
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 1e-6) {
    throw new PublicationValidationError("reliability must have at most two decimal places.")
  }
}

async function setReviewOutcome(
  client: ClientBase,
  id: string,
  status: Exclude<SourceReviewStatus, "staged">,
  reviewedBy: string,
  reviewNote: string | null,
  completion?: { stance: ReviewStance; reliability: number },
): Promise<SourceReviewItem> {
  const reviewer = reviewedBy.trim()
  if (!reviewer) throw new PublicationValidationError("reviewedBy is required.")
  const { rows } = await client.query<SourceReviewRow>(
    `UPDATE source_review_items
        SET status = $2,
            reviewed_at = now(),
            reviewed_by = $3,
            review_note = $4,
            review_stance = $5,
            review_reliability = $6
      WHERE id = $1 AND status = 'staged'
      RETURNING ${REVIEW_COLUMNS}`,
    [id, status, reviewer, reviewNote, completion?.stance ?? null, completion?.reliability ?? null],
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
  completion?: { stance: ReviewStance; reliability: number },
): Promise<SourceReviewItem> {
  return withReviewLock(client, id, async () => {
    const existing = await getSourceReviewItem(client, id)
    if (!existing) throw new PublicationValidationError(`Review item ${id} was not found.`)
    if (existing.payload.kind === "source_capture") {
      if (!completion) {
        throw new PublicationValidationError(
          "Approving a source capture requires stance and reliability. They are not invented at import.",
        )
      }
      if (completion.stance !== "supports" && completion.stance !== "contradicts" && completion.stance !== "contextual") {
        throw new PublicationValidationError("stance must be supports, contradicts, or contextual.")
      }
      assertReliability(completion.reliability)
    } else if (completion) {
      throw new PublicationValidationError("stance and reliability are recorded only for source captures.")
    }
    return setReviewOutcome(client, id, "approved", reviewedBy, reviewNote?.trim() ?? null, completion)
  })
}

/** Blocks publication of a captured version after the file queue rejects it. */
export async function rejectIntakeVersionItem(
  client: ClientBase,
  id: string,
  reviewedBy: string,
): Promise<SourceReviewItem> {
  return withReviewLock(client, id, async () => {
    const reviewer = reviewedBy.trim()
    if (!reviewer) throw new PublicationValidationError("reviewedBy is required.")
    const { rows } = await client.query<SourceReviewRow>(
      `UPDATE source_review_items
          SET status = 'rejected',
              reviewed_at = COALESCE(reviewed_at, now()),
              reviewed_by = $2,
              review_note = 'Rejected in the source intake queue. This version cannot be published.'
        WHERE id = $1 AND status IN ('staged', 'approved')
        RETURNING ${REVIEW_COLUMNS}`,
      [id, reviewer],
    )
    if (rows[0]) return rowToItem(rows[0])
    const existing = await getSourceReviewItem(client, id)
    if (!existing) throw new PublicationValidationError(`Review item ${id} was not found.`)
    if (existing.status === "rejected") return existing
    throw new PublicationValidationError(`Review item ${id} is already ${existing.status}.`)
  })
}

export async function rejectSourceReviewItem(
  client: ClientBase,
  id: string,
  reviewedBy: string,
  reviewNote?: string,
): Promise<SourceReviewItem> {
  return withReviewLock(client, id, () =>
    setReviewOutcome(client, id, "rejected", reviewedBy, reviewNote?.trim() ?? null),
  )
}
