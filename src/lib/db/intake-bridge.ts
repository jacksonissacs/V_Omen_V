import type { ClientBase } from "pg"

import type { IntakeVersion } from "@/lib/intake/types"

import {
  PublicationValidationError,
  type SourceCaptureRecord,
  assertSourceClock,
} from "./publication-bundle"
import {
  getSourceReviewItem,
  rejectIntakeVersionItem,
  type SourceReviewItem,
} from "./source-review"

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DIGEST = /^[0-9a-f]{64}$/

export type IntakeImportResult =
  | { action: "staged"; item: SourceReviewItem }
  | { action: "unchanged"; item: SourceReviewItem }
  | { action: "rejected"; item: SourceReviewItem }

function captureFromVersion(version: IntakeVersion): SourceCaptureRecord {
  if (!ID.test(version.id)) {
    throw new PublicationValidationError(`Intake version ${version.id} is not a stable review-item id.`)
  }
  if (!DIGEST.test(version.contentIdentity)) {
    throw new PublicationValidationError(`Intake version ${version.id} has no content identity.`)
  }
  if (!version.canonicalUrl.startsWith("https://")) {
    throw new PublicationValidationError(`Intake version ${version.id} has no canonical https URL.`)
  }
  if (version.sourcePublishedDate !== null && !DATE.test(version.sourcePublishedDate)) {
    throw new PublicationValidationError(`Intake version ${version.id} has a source date that is not a calendar date.`)
  }
  const firstFetchedAt = assertSourceClock(version.firstFetchedAt, "firstFetchedAt")
  if (!firstFetchedAt) throw new PublicationValidationError(`Intake version ${version.id} has no fetch time.`)
  return {
    sourceId: version.sourceId,
    sourceItemId: version.sourceItemId,
    version: version.version,
    intakeVersionId: version.id,
    canonicalUrl: version.canonicalUrl,
    title: version.title,
    excerpt: version.excerpt,
    sourcePublishedAt: assertSourceClock(version.sourcePublishedAt, "sourcePublishedAt"),
    sourcePublishedDate: version.sourcePublishedDate,
    firstFetchedAt,
    contentIdentity: version.contentIdentity,
    provenance: "sourced",
  }
}

async function existingIntakeId(client: ClientBase, capture: SourceCaptureRecord): Promise<string | undefined> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM source_review_items
      WHERE intake_source_id = $1 AND intake_item_id = $2 AND captured_version = $3`,
    [capture.sourceId, capture.sourceItemId, capture.version],
  )
  return rows[0]?.id
}

function sameCapture(existing: SourceReviewItem, capture: SourceCaptureRecord): boolean {
  if (existing.payload.kind !== "source_capture") return false
  const stored = existing.payload.capture
  return (
    existing.intakeSourceId === capture.sourceId &&
    existing.intakeItemId === capture.sourceItemId &&
    existing.capturedVersion === capture.version &&
    stored.intakeVersionId === capture.intakeVersionId &&
    stored.contentIdentity === capture.contentIdentity &&
    stored.canonicalUrl === capture.canonicalUrl &&
    stored.sourcePublishedAt === capture.sourcePublishedAt &&
    stored.sourcePublishedDate === capture.sourcePublishedDate &&
    stored.firstFetchedAt === capture.firstFetchedAt
  )
}

/**
 * Stages one selected file-queue version into source_review_items.
 * Does not approve, publish, create an event, or record a probability.
 * The same source id and captured version always map to one review item.
 */
export async function importIntakeVersion(
  client: ClientBase,
  version: IntakeVersion,
  stagedBy: string,
): Promise<IntakeImportResult> {
  const operator = stagedBy.trim()
  if (!operator) throw new PublicationValidationError("stagedBy is required.")
  const capture = captureFromVersion(version)
  const existing = await getSourceReviewItem(client, version.id)

  if (version.reviewState === "pending") {
    throw new PublicationValidationError(
      `Intake version ${version.id} is still pending. Import does not publish incomplete candidates.`,
    )
  }

  if (version.reviewState === "rejected") {
    if (!existing) {
      throw new PublicationValidationError(
        `Rejected intake version ${version.id} was not staged. Nothing was published.`,
      )
    }
    if (!sameCapture(existing, capture)) {
      throw new PublicationValidationError(
        `Intake version ${version.id} does not match the stored capture. The stored row was left unchanged.`,
      )
    }
    const item = await rejectIntakeVersionItem(client, existing.id, operator)
    return { action: "rejected", item }
  }

  const eventId = version.candidateEventId
  if (!eventId || !ID.test(eventId)) {
    throw new PublicationValidationError(
      `Intake version ${version.id} has no operator-selected event. Import will not create one.`,
    )
  }
  const { rowCount: eventExists } = await client.query("SELECT 1 FROM events WHERE id = $1", [eventId])
  if (!eventExists) {
    throw new PublicationValidationError(
      `Event ${eventId} is not stored. Import does not create events or probabilities.`,
    )
  }

  if (existing) {
    if (!sameCapture(existing, capture) || existing.eventId !== eventId) {
      throw new PublicationValidationError(
        `Intake version ${version.id} is already mapped and does not match this capture. Approval was not copied.`,
      )
    }
    return { action: "unchanged", item: existing }
  }

  const payload = { kind: "source_capture" as const, capture }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO source_review_items (
       id, event_id, status, payload, intake_note, staged_by,
       intake_source_id, intake_item_id, captured_version, content_identity, canonical_url,
       source_published_at, source_published_date, first_fetched_at
     ) VALUES (
       $1, $2, 'staged', $3::jsonb, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13
     )
     ON CONFLICT (intake_source_id, intake_item_id, captured_version) DO NOTHING
     RETURNING id`,
    [
      version.id,
      eventId,
      JSON.stringify(payload),
      `Imported ${capture.sourceId} version ${capture.version}. Staged only.`,
      operator,
      capture.sourceId,
      capture.sourceItemId,
      capture.version,
      capture.contentIdentity,
      capture.canonicalUrl,
      capture.sourcePublishedAt,
      capture.sourcePublishedDate,
      capture.firstFetchedAt,
    ],
  )
  const storedId = rows[0]?.id ?? (await existingIntakeId(client, capture)) ?? version.id
  const stored = await getSourceReviewItem(client, storedId)
  if (!stored) throw new PublicationValidationError(`Could not stage intake version ${version.id}.`)
  if (!sameCapture(stored, capture)) {
    throw new PublicationValidationError(
      `Intake version ${version.id} collided with a different capture. The stored row was left unchanged.`,
    )
  }
  return { action: rows[0] ? "staged" : "unchanged", item: stored }
}
