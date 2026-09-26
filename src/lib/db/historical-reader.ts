import type { ClientBase } from "pg"

import { databaseBigintText } from "@/lib/db/bigint-id"
import { verifyHistoryCheckpoint } from "@/lib/db/history-checkpoint"
import {
  assembleHistoricalReconstruction,
  CHECKPOINT_NOT_FOUND,
  HistoricalReconstructionError,
  invalidCheckpointId,
  invalidEventId,
  type CheckpointListOutcome,
  type CheckpointListQuery,
  type HistoricalEvidence,
  type HistoricalMoveLog,
  type HistoricalObservation,
  type HistoricalSemantics,
  type ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"
import type {
  EventCategory,
  EventSource,
  ObservationSourceKind,
  ProbabilityType,
  Provenance,
  Significance,
} from "@/types/event"

type Queryable = Pick<ClientBase, "query">

interface CheckpointRow {
  id: string
  sequence: number
  content_md5: string
  member_count: number
  semantic_history: string
  semantic_event_fields_from: Date
  record_availability_realigned_at: Date
  pre_baseline_event_revisions: string
}

interface MemberRow {
  relation_name: "probability_observations" | "evidence" | "move_log_revisions" | "event_revisions"
  row_key: string
}

interface ObservationRow {
  id: string
  event_id: string
  source_kind: ObservationSourceKind
  source_name: string
  probability_type: ProbabilityType
  probability_pct: number
  observed_at: Date
  captured_at: Date
  note: string | null
  provenance: Provenance
}

interface EvidenceRow {
  id: string
  event_id: string
  source_name: string
  source_url: string | null
  source_published_at: Date | null
  first_observed_at: Date
  captured_at: Date
  summary: string
  stance: EventSource["stance"]
  reliability: number
  recorded_by: string
  provenance: Provenance
}

interface MoveLogRow {
  id: string
  event_id: string
  move_log_id: string
  version: number
  published_at: Date
  recorded_at: Date
  author: string
  what_changed: string
  likely_cause: string
  explained_pct: number
  unexplained_factors: string[]
  evidence_ids: string[]
  correction_note: string | null
  provenance: Provenance
}

interface SemanticRow {
  id: string
  event_id: string
  version: number
  title: string
  question: string
  status: HistoricalSemantics["status"]
  deadline: Date
  resolution_criteria: string
  category: EventCategory
  significance: Significance
  region: string
  summary: string
  tags: string[]
  related_event_ids: string[]
  provenance: Provenance
  correction_note: string | null
  recorded_at: Date
}

interface SummaryRow {
  id: string
  sequence: number
  content_md5: string
  member_count: number
  semantic_history: string
}

function iso(value: Date): string {
  return value.toISOString()
}

function verificationFailure(checkpointId: string, detail: string): ReconstructionOutcome {
  return {
    outcome: "verification_failed",
    message: `Checkpoint ${checkpointId} failed verification (${detail}).`,
  }
}

async function eventExists(client: Queryable, eventId: string): Promise<boolean> {
  const event = await client.query<{ present: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM events WHERE id = $1) AS present",
    [eventId],
  )
  return event.rows[0]?.present === true
}

async function rowsByKey<T extends { id: string; event_id: string }>(
  client: Queryable,
  sql: string,
  ids: string[],
  eventId: string,
  relation: string,
): Promise<T[]> {
  if (ids.length === 0) return []
  const { rows } = await client.query<T>(sql, [ids])
  if (rows.length !== ids.length) {
    throw new HistoricalReconstructionError(`member-row-missing:${relation}`)
  }
  for (const row of rows) {
    if (row.event_id !== eventId) {
      throw new HistoricalReconstructionError(`member-event-mismatch:${relation}`)
    }
  }
  return rows
}

/**
 * Loads one stored checkpoint inside the caller's repeatable-read snapshot.
 * Member rows are fetched by primary key. The live `events` row is not copied,
 * and `record_available_at`, capture time and source time are not filters.
 */
export async function readStoredReconstruction(
  client: Queryable,
  eventId: string,
  checkpointId: string,
): Promise<ReconstructionOutcome> {
  const invalid = invalidEventId(eventId) ?? invalidCheckpointId(checkpointId)
  if (invalid) return invalid
  if (!(await eventExists(client, eventId))) return { outcome: "unknown_event" }

  const checkpoint = await client.query<CheckpointRow>(
    `SELECT id::text AS id, sequence, content_md5, member_count, semantic_history,
            semantic_event_fields_from, record_availability_realigned_at,
            pre_baseline_event_revisions
       FROM history_checkpoints
      WHERE id = $1::bigint AND event_id = $2`,
    [checkpointId, eventId],
  )
  const stored = checkpoint.rows[0]
  if (!stored) return { outcome: "missing_checkpoint", message: CHECKPOINT_NOT_FOUND }

  const id = databaseBigintText(stored.id)
  if (stored.pre_baseline_event_revisions !== "not_recorded") {
    return verificationFailure(id, "pre-baseline")
  }
  if (stored.semantic_history !== "recorded" && stored.semantic_history !== "unavailable") {
    return verificationFailure(id, "semantic-history-label")
  }

  const status = await verifyHistoryCheckpoint(client, id)
  if (status !== "ok") return verificationFailure(id, status)

  const members = await client.query<MemberRow>(
    `SELECT relation_name, row_key
       FROM history_checkpoint_members
      WHERE checkpoint_id = $1::bigint
      ORDER BY relation_name, row_key`,
    [id],
  )
  if (members.rows.length !== stored.member_count) {
    return verificationFailure(id, "member-count-mismatch")
  }

  const keys = (relation: MemberRow["relation_name"]) =>
    members.rows.filter((member) => member.relation_name === relation).map((member) => member.row_key)

  let observationRows: ObservationRow[]
  let evidenceRows: EvidenceRow[]
  let moveLogRows: MoveLogRow[]
  let semanticRows: SemanticRow[]
  try {
    for (const key of [...keys("probability_observations"), ...keys("move_log_revisions"), ...keys("event_revisions")]) {
      databaseBigintText(key)
    }
  } catch {
    return verificationFailure(id, "member-row-key")
  }
  try {
    observationRows = await rowsByKey<ObservationRow>(
      client,
      `SELECT id::text AS id, event_id, source_kind, source_name, probability_type,
              probability_pct::float8 AS probability_pct, observed_at, captured_at, note, provenance
         FROM probability_observations
        WHERE id = ANY ($1::bigint[])`,
      keys("probability_observations"),
      eventId,
      "probability_observations",
    )
    evidenceRows = await rowsByKey<EvidenceRow>(
      client,
      `SELECT id, event_id, source_name, source_url, source_published_at, first_observed_at, captured_at,
              summary, stance, reliability::float8 AS reliability, recorded_by, provenance
         FROM evidence
        WHERE id = ANY ($1::text[])`,
      keys("evidence"),
      eventId,
      "evidence",
    )
    moveLogRows = await rowsByKey<MoveLogRow>(
      client,
      `SELECT revision.id::text AS id, log.event_id, revision.move_log_id, revision.version,
              revision.published_at, revision.recorded_at, revision.author, revision.what_changed,
              revision.likely_cause, revision.explained_pct::float8 AS explained_pct,
              revision.unexplained_factors, revision.evidence_ids, revision.correction_note, revision.provenance
         FROM move_log_revisions AS revision
         JOIN move_logs AS log ON log.id = revision.move_log_id
        WHERE revision.id = ANY ($1::bigint[])`,
      keys("move_log_revisions"),
      eventId,
      "move_log_revisions",
    )
    semanticRows = await rowsByKey<SemanticRow>(
      client,
      `SELECT id::text AS id, event_id, version, title, question, status, deadline, resolution_criteria,
              category, significance, region, summary, tags, related_event_ids, provenance,
              correction_note, recorded_at
         FROM event_revisions
        WHERE id = ANY ($1::bigint[])`,
      keys("event_revisions"),
      eventId,
      "event_revisions",
    )
  } catch (error) {
    if (error instanceof HistoricalReconstructionError) return verificationFailure(id, error.message)
    throw error
  }

  const observations: HistoricalObservation[] = observationRows.map((row) => ({
    id: databaseBigintText(row.id),
    sourceKind: row.source_kind,
    sourceName: row.source_name,
    probabilityType: row.probability_type,
    probabilityPct: row.probability_pct,
    observedAt: iso(row.observed_at),
    capturedAt: iso(row.captured_at),
    note: row.note,
    provenance: row.provenance,
  }))
  const evidence: HistoricalEvidence[] = evidenceRows.map((row) => ({
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourcePublishedAt: row.source_published_at ? iso(row.source_published_at) : null,
    firstObservedAt: iso(row.first_observed_at),
    capturedAt: iso(row.captured_at),
    summary: row.summary,
    stance: row.stance,
    reliability: row.reliability,
    recordedBy: row.recorded_by,
    provenance: row.provenance,
  }))
  const moveLogRevisions: HistoricalMoveLog[] = moveLogRows.map((row) => ({
    id: databaseBigintText(row.id),
    moveLogId: row.move_log_id,
    version: row.version,
    publishedAt: iso(row.published_at),
    recordedAt: iso(row.recorded_at),
    author: row.author,
    whatChanged: row.what_changed,
    likelyCause: row.likely_cause,
    explainedPct: row.explained_pct,
    unexplainedFactors: row.unexplained_factors,
    evidenceIds: row.evidence_ids,
    correctionNote: row.correction_note,
    provenance: row.provenance,
  }))
  const semanticRevisions: HistoricalSemantics[] = semanticRows.map((row) => ({
    version: row.version,
    title: row.title,
    question: row.question,
    status: row.status,
    deadline: iso(row.deadline),
    resolutionCriteria: row.resolution_criteria,
    category: row.category,
    significance: row.significance,
    region: row.region,
    summary: row.summary,
    tags: row.tags,
    relatedEventIds: row.related_event_ids,
    provenance: row.provenance,
    correctionNote: row.correction_note,
    recordedAt: iso(row.recorded_at),
  }))

  try {
    const reconstruction = assembleHistoricalReconstruction({
      eventId,
      checkpoint: {
        id,
        sequence: stored.sequence,
        contentMd5: stored.content_md5,
        memberCount: stored.member_count,
      },
      coverage: {
        semanticEventFieldsFrom: iso(stored.semantic_event_fields_from),
        recordAvailabilityRealignedAt: iso(stored.record_availability_realigned_at),
        semanticHistory: stored.semantic_history,
        preBaselineEventRevisions: "not_recorded",
      },
      observations,
      evidence,
      semanticRevisions,
      moveLogRevisions,
    })
    if (stored.semantic_history === "unavailable") {
      return { outcome: "pre_coverage", reconstruction }
    }
    return { outcome: "reconstruction", reconstruction }
  } catch (error) {
    if (error instanceof HistoricalReconstructionError) return verificationFailure(id, error.message)
    throw error
  }
}

/**
 * Newest-first page of published checkpoints for one event.
 * The page is bounded and does not include member rows or today's projection.
 * A listed checkpoint is not verified until it is read.
 */
export async function readHistoryCheckpointPage(
  client: Queryable,
  eventId: string,
  query: CheckpointListQuery,
): Promise<CheckpointListOutcome> {
  const invalid = invalidEventId(eventId)
  if (invalid) return invalid
  if (!(await eventExists(client, eventId))) return { outcome: "unknown_event" }

  const params: unknown[] = [eventId]
  let where = "event_id = $1"
  if (query.beforeSequence !== undefined) {
    params.push(query.beforeSequence)
    where += ` AND sequence < $${params.length}`
  }
  params.push(query.limit + 1)
  const { rows } = await client.query<SummaryRow>(
    `SELECT id::text AS id, sequence, content_md5, member_count, semantic_history
       FROM history_checkpoints
      WHERE ${where}
      ORDER BY sequence DESC
      LIMIT $${params.length}`,
    params,
  )
  const hasMore = rows.length > query.limit
  const page = rows.slice(0, query.limit)
  return {
    outcome: "checkpoints",
    eventId,
    limit: query.limit,
    hasMore,
    checkpoints: page.map((row) => {
      if (row.semantic_history !== "recorded" && row.semantic_history !== "unavailable") {
        throw new Error(`Unexpected semantic history label "${row.semantic_history}".`)
      }
      return {
        id: databaseBigintText(row.id),
        sequence: row.sequence,
        contentMd5: row.content_md5,
        memberCount: row.member_count,
        semanticHistory: row.semantic_history,
      }
    }),
  }
}
