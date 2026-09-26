import type { ClientBase, Pool } from "pg"

import { databaseBigintText } from "@/lib/db/bigint-id"

type Queryable = Pick<ClientBase | Pool, "query">

/** Whether a checkpoint's snapshot includes any post-migration event revision. */
export type SemanticHistoryLabel = "recorded" | "unavailable"

/**
 * Publication of one verified checkpoint.
 * `created` is false when the visible history already matches the latest checkpoint.
 * The checkpoint does not carry a wall-clock visibility time.
 */
export interface HistoryCheckpointPublication {
  /** Decimal text of `history_checkpoints.id`. Not a JavaScript number. */
  id: string
  sequence: number
  created: boolean
  semanticHistory: SemanticHistoryLabel
  contentMd5: string
}

function asSemanticHistory(value: string): SemanticHistoryLabel {
  if (value === "recorded" || value === "unavailable") return value
  throw new Error(`Unexpected semantic history label "${value}".`)
}

/**
 * Publishes the history of one event that this connection can already see.
 * The call is its own transaction. It refuses uncommitted history in the same
 * transaction, because that history is not visible in the publishing snapshot.
 */
export async function publishHistoryCheckpoint(
  client: Queryable,
  eventId: string,
): Promise<HistoryCheckpointPublication> {
  const { rows } = await client.query<{
    checkpoint_id: string | number
    sequence: number
    created: boolean
    semantic_history: string
    content_md5: string
  }>(
    `SELECT checkpoint_id, sequence, created, semantic_history, content_md5
       FROM omen_publish_history_checkpoint($1)`,
    [eventId],
  )
  const row = rows[0]
  if (!row) {
    throw new Error(`Publishing a history checkpoint for ${eventId} returned no row.`)
  }
  return {
    id: databaseBigintText(row.checkpoint_id),
    sequence: row.sequence,
    created: row.created,
    semanticHistory: asSemanticHistory(row.semantic_history),
    contentMd5: row.content_md5,
  }
}

/** Recomputes a checkpoint's digest and snapshot membership. `ok` is the success result. */
export async function verifyHistoryCheckpoint(client: Queryable, checkpointId: string): Promise<string> {
  const { rows } = await client.query<{ result: string }>(
    "SELECT omen_verify_history_checkpoint($1::bigint) AS result",
    [databaseBigintText(checkpointId)],
  )
  return rows[0]?.result ?? "missing"
}
