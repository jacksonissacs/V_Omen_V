import type { ClientBase } from "pg"

import { evidenceContentIdentity } from "./content-identity"
import { AnalystValidationError, type StoredEvidenceInput } from "./types"

interface EvidenceRow {
  id: string
  event_id: string
  source_name: string
  source_url: string | null
  source_published_at: Date | null
  first_observed_at: Date
  captured_at: Date
  summary: string
  stance: StoredEvidenceInput["stance"]
  reliability: number | null
  recorded_by: string
  provenance: StoredEvidenceInput["provenance"]
}

function rowToStored(row: EvidenceRow): StoredEvidenceInput {
  const base = {
    id: row.id,
    eventId: row.event_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
    firstObservedAt: row.first_observed_at.toISOString(),
    capturedAt: row.captured_at.toISOString(),
    summary: row.summary,
    stance: row.stance,
    reliability: row.reliability === null ? null : Number(row.reliability),
    recordedBy: row.recorded_by,
    provenance: row.provenance,
  }
  return { ...base, contentIdentity: evidenceContentIdentity(base) }
}

export async function loadEventQuestion(client: ClientBase, eventId: string): Promise<string> {
  const { rows } = await client.query<{ question: string }>("SELECT question FROM events WHERE id = $1", [eventId])
  const question = rows[0]?.question
  if (!question) throw new AnalystValidationError(`Event ${eventId} is not stored.`)
  return question
}

/**
 * Load selected stored evidence for an event. Refuses ids that are missing or on another event.
 */
export async function loadSelectedEvidence(
  client: ClientBase,
  eventId: string,
  evidenceIds: string[],
): Promise<StoredEvidenceInput[]> {
  const unique = [...new Set(evidenceIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) {
    throw new AnalystValidationError("At least one evidence id is required.")
  }
  const { rows } = await client.query<EvidenceRow>(
    `SELECT id, event_id, source_name, source_url, source_published_at, first_observed_at, captured_at,
            summary, stance, reliability::float8 AS reliability, recorded_by, provenance
       FROM evidence
      WHERE event_id = $1 AND id = ANY($2::text[])
      ORDER BY first_observed_at ASC, id`,
    [eventId, unique],
  )
  if (rows.length !== unique.length) {
    const found = new Set(rows.map((row) => row.id))
    const missing = unique.filter((id) => !found.has(id))
    throw new AnalystValidationError(
      `Evidence ${missing.join(", ")} is not stored on event ${eventId}.`,
    )
  }
  return rows.map(rowToStored)
}
