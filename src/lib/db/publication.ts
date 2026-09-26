import { createHash, randomBytes } from "node:crypto"

import type { ClientBase } from "pg"

import { BundleValidationError, type EventBundle } from "./event-bundle"
import { HistoryConflictError, type WriteSummary, writeEventBundle } from "./event-store"
import { verifyHistoryCheckpoint } from "./history-checkpoint"
import {
  PublicationValidationError,
  buildBundleFromReviewPayload,
  validatePublicationBundle,
} from "./publication-bundle"
import type { SourceReviewItem } from "./source-review"

export type PublicationOperationStatus = "pending" | "checkpoint_pending" | "completed" | "failed"

export interface PublicationOperationRecord {
  id: string
  idempotencyKey: string
  eventId: string
  status: PublicationOperationStatus
  bundle: EventBundle
  writeSummary: WriteSummary | null
  checkpointId: number | null
  checkpointSequence: number | null
  sourceReviewItemId: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface PublicationResult {
  operation: PublicationOperationRecord
  summary: WriteSummary
}

interface OperationRow {
  id: string
  idempotency_key: string
  event_id: string
  status: PublicationOperationStatus
  bundle: EventBundle
  write_summary: WriteSummary | null
  checkpoint_id: string | null
  checkpoint_sequence: number | null
  source_review_item_id: string | null
  last_error: string | null
  created_at: Date
  updated_at: Date
}

function rowToOperation(row: OperationRow): PublicationOperationRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    eventId: row.event_id,
    status: row.status,
    bundle: row.bundle,
    writeSummary: row.write_summary,
    checkpointId: row.checkpoint_id === null ? null : Number(row.checkpoint_id),
    checkpointSequence: row.checkpoint_sequence,
    sourceReviewItemId: row.source_review_item_id,
    lastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function newOperationId(): string {
  return `pub-${randomBytes(8).toString("hex")}`
}

function bundleFingerprint(bundle: EventBundle): string {
  return createHash("sha256").update(JSON.stringify(bundle)).digest("hex")
}

async function loadOperationByKey(client: ClientBase, idempotencyKey: string): Promise<OperationRow | undefined> {
  const { rows } = await client.query<OperationRow>(
    `SELECT id, idempotency_key, event_id, status, bundle, write_summary, checkpoint_id, checkpoint_sequence,
            source_review_item_id, last_error, created_at, updated_at
       FROM publication_operations
      WHERE idempotency_key = $1
      FOR UPDATE`,
    [idempotencyKey],
  )
  return rows[0]
}

export async function getPublicationOperation(
  client: ClientBase,
  idempotencyKey: string,
): Promise<PublicationOperationRecord | undefined> {
  const { rows } = await client.query<OperationRow>(
    `SELECT id, idempotency_key, event_id, status, bundle, write_summary, checkpoint_id, checkpoint_sequence,
            source_review_item_id, last_error, created_at, updated_at
       FROM publication_operations WHERE idempotency_key = $1`,
    [idempotencyKey],
  )
  return rows[0] ? rowToOperation(rows[0]) : undefined
}

function isDataCommitFailure(error: unknown): boolean {
  return !(
    error instanceof HistoryConflictError ||
    error instanceof BundleValidationError ||
    error instanceof PublicationValidationError
  )
}

async function reservePublicationOperation(
  client: ClientBase,
  bundle: EventBundle,
  idempotencyKey: string,
  sourceReviewItemId?: string,
): Promise<OperationRow> {
  await client.query("BEGIN")
  try {
    const existing = await loadOperationByKey(client, idempotencyKey)
    if (existing) {
      const sameBundle = bundleFingerprint(existing.bundle as EventBundle) === bundleFingerprint(bundle)
      if (!sameBundle) {
        throw new Error(`Idempotency key ${idempotencyKey} is already bound to a different bundle.`)
      }
      await client.query("COMMIT")
      return existing
    }
    const id = newOperationId()
    const { rows } = await client.query<OperationRow>(
      `INSERT INTO publication_operations (
         id, idempotency_key, event_id, status, bundle, source_review_item_id
       ) VALUES ($1, $2, $3, 'pending', $4::jsonb, $5)
       RETURNING id, idempotency_key, event_id, status, bundle, write_summary, checkpoint_id, checkpoint_sequence,
                 source_review_item_id, last_error, created_at, updated_at`,
      [id, idempotencyKey, bundle.eventId, JSON.stringify(bundle), sourceReviewItemId ?? null],
    )
    await client.query("COMMIT")
    return rows[0]!
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

async function markOperationCompleted(client: ClientBase, operationId: string, summary: WriteSummary): Promise<OperationRow> {
  await client.query("BEGIN")
  try {
    const { rows } = await client.query<OperationRow>(
      `UPDATE publication_operations
          SET status = 'completed',
              write_summary = $2::jsonb,
              checkpoint_id = $3,
              checkpoint_sequence = $4,
              last_error = NULL
        WHERE id = $1
        RETURNING id, idempotency_key, event_id, status, bundle, write_summary, checkpoint_id, checkpoint_sequence,
                  source_review_item_id, last_error, created_at, updated_at`,
      [operationId, JSON.stringify(summary), summary.checkpoint.id, summary.checkpoint.sequence],
    )
    await client.query("COMMIT")
    return rows[0]!
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

async function markOperationCheckpointPending(
  client: ClientBase,
  operationId: string,
  message: string,
): Promise<void> {
  await client.query("BEGIN")
  try {
    await client.query(
      `UPDATE publication_operations SET status = 'checkpoint_pending', last_error = $2 WHERE id = $1`,
      [operationId, message],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

async function markOperationFailed(client: ClientBase, operationId: string, message: string): Promise<void> {
  await client.query("BEGIN")
  try {
    await client.query(`UPDATE publication_operations SET status = 'failed', last_error = $2 WHERE id = $1`, [
      operationId,
      message,
    ])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

/**
 * Validates and publishes one bundle through the canonical writeEventBundle path.
 * Idempotent on idempotencyKey; safe to retry after checkpoint_pending.
 */
export async function publishEventBundle(
  client: ClientBase,
  bundle: EventBundle,
  options: { idempotencyKey: string; sourceReviewItemId?: string },
): Promise<PublicationResult> {
  await validatePublicationBundle(client, bundle)
  const reserved = await reservePublicationOperation(client, bundle, options.idempotencyKey, options.sourceReviewItemId)
  if (reserved.status === "completed" && reserved.write_summary) {
    return { operation: rowToOperation(reserved), summary: reserved.write_summary }
  }

  try {
    const summary = await writeEventBundle(client, bundle)
    const updated = await markOperationCompleted(client, reserved.id, summary)
    return { operation: rowToOperation(updated), summary }
  } catch (error) {
    const message = (error as Error).message
    if (isDataCommitFailure(error)) await markOperationCheckpointPending(client, reserved.id, message)
    else await markOperationFailed(client, reserved.id, message)
    throw error
  }
}

export async function retryPublicationOperation(
  client: ClientBase,
  idempotencyKey: string,
): Promise<PublicationResult> {
  await client.query("BEGIN")
  let operation: OperationRow | undefined
  try {
    operation = await loadOperationByKey(client, idempotencyKey)
    if (!operation) throw new Error(`No publication operation for idempotency key ${idempotencyKey}.`)
    if (operation.status === "completed" && operation.write_summary) {
      await client.query("COMMIT")
      return { operation: rowToOperation(operation), summary: operation.write_summary }
    }
    if (operation.status !== "checkpoint_pending" && operation.status !== "failed") {
      throw new Error(`Operation ${operation.id} is ${operation.status}; only checkpoint_pending or failed can retry.`)
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }

  const bundle = operation!.bundle as EventBundle
  await validatePublicationBundle(client, bundle)
  try {
    const summary = await writeEventBundle(client, bundle)
    const updated = await markOperationCompleted(client, operation!.id, summary)
    return { operation: rowToOperation(updated), summary }
  } catch (error) {
    const message = (error as Error).message
    if (isDataCommitFailure(error)) await markOperationCheckpointPending(client, operation!.id, message)
    else await markOperationFailed(client, operation!.id, message)
    throw error
  }
}

export async function publishApprovedReviewItem(
  client: ClientBase,
  item: SourceReviewItem,
  idempotencyKey: string,
): Promise<PublicationResult> {
  if (item.status !== "approved") {
    throw new Error(`Review item ${item.id} must be approved before publication (currently ${item.status}).`)
  }
  const bundle = await buildBundleFromReviewPayload(client, item.eventId, item.payload)
  return publishEventBundle(client, bundle, { idempotencyKey, sourceReviewItemId: item.id })
}

export async function verifyCheckpointDigest(client: ClientBase, checkpointId: number): Promise<string> {
  return verifyHistoryCheckpoint(client, checkpointId)
}
