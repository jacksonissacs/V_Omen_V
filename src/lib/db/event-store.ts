import type { ClientBase } from "pg"

import type {
  EventBundle,
  EventRecordInput,
  EvidenceInput,
  MoveLogRevisionInput,
  ObservationInput,
} from "./event-bundle"

/** A bundle tried to change a record that history already holds. */
export class HistoryConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HistoryConflictError"
  }
}

export interface AppendCounts {
  appended: number
  unchanged: number
}

export interface WriteSummary {
  eventId: string
  event: "inserted" | "updated" | "not provided"
  eventRevisions: AppendCounts
  observations: AppendCounts
  evidence: AppendCounts
  moveLogRevisions: AppendCounts
}

const sameArray = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

const iso = (value: Date | null) => (value ? value.toISOString() : null)

interface EventSemanticSnapshot {
  title: string
  question: string
  status: string
  deadline: string
  resolutionCriteria: string
  category: string
  significance: string
  region: string
  summary: string
  tags: string[]
  relatedEventIds: string[]
  provenance: string
}

function semanticFromInput(event: EventRecordInput): EventSemanticSnapshot {
  return {
    title: event.title,
    question: event.question,
    status: event.status,
    deadline: event.deadline,
    resolutionCriteria: event.resolutionCriteria,
    category: event.category,
    significance: event.significance,
    region: event.region,
    summary: event.summary,
    tags: event.tags,
    relatedEventIds: event.relatedEventIds,
    provenance: event.provenance,
  }
}

function sameSemantic(a: EventSemanticSnapshot, b: EventSemanticSnapshot): boolean {
  return (
    a.title === b.title &&
    a.question === b.question &&
    a.status === b.status &&
    a.deadline === b.deadline &&
    a.resolutionCriteria === b.resolutionCriteria &&
    a.category === b.category &&
    a.significance === b.significance &&
    a.region === b.region &&
    a.summary === b.summary &&
    sameArray(a.tags, b.tags) &&
    sameArray(a.relatedEventIds, b.relatedEventIds) &&
    a.provenance === b.provenance
  )
}

function rowToSemantic(row: {
  title: string
  question: string
  status: string
  deadline: Date
  resolution_criteria: string
  category: string
  significance: string
  region: string
  summary: string
  tags: string[]
  related_event_ids: string[]
  provenance: string
}): EventSemanticSnapshot {
  return {
    title: row.title,
    question: row.question,
    status: row.status,
    deadline: row.deadline.toISOString(),
    resolutionCriteria: row.resolution_criteria,
    category: row.category,
    significance: row.significance,
    region: row.region,
    summary: row.summary,
    tags: row.tags,
    relatedEventIds: row.related_event_ids,
    provenance: row.provenance,
  }
}

async function loadLatestSemanticSnapshot(
  client: ClientBase,
  eventId: string,
): Promise<{ snapshot: EventSemanticSnapshot; fromRevision: boolean; latestVersion: number } | undefined> {
  const { rows: revisionRows } = await client.query<{
    version: number
    title: string
    question: string
    status: string
    deadline: Date
    resolution_criteria: string
    category: string
    significance: string
    region: string
    summary: string
    tags: string[]
    related_event_ids: string[]
    provenance: string
  }>(
    `SELECT version, title, question, status, deadline, resolution_criteria, category, significance,
            region, summary, tags, related_event_ids, provenance
       FROM event_revisions
      WHERE event_id = $1
      ORDER BY version DESC
      LIMIT 1`,
    [eventId],
  )
  const revision = revisionRows[0]
  if (revision) {
    return {
      snapshot: rowToSemantic(revision),
      fromRevision: true,
      latestVersion: revision.version,
    }
  }
  const { rows: eventRows } = await client.query<{
    title: string
    question: string
    status: string
    deadline: Date
    resolution_criteria: string
    category: string
    significance: string
    region: string
    summary: string
    tags: string[]
    related_event_ids: string[]
    provenance: string
  }>(
    `SELECT title, question, status, deadline, resolution_criteria, category, significance,
            region, summary, tags, related_event_ids, provenance
       FROM events
      WHERE id = $1`,
    [eventId],
  )
  const event = eventRows[0]
  if (!event) return undefined
  return { snapshot: rowToSemantic(event), fromRevision: false, latestVersion: 0 }
}

async function insertEventRevision(
  client: ClientBase,
  eventId: string,
  event: EventRecordInput,
  version: number,
  correctionNote: string | null,
): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO event_revisions (
       event_id, version, title, question, status, deadline, resolution_criteria, category,
       significance, region, summary, tags, related_event_ids, provenance, correction_note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT ON CONSTRAINT event_revisions_unique_version DO NOTHING
     RETURNING id`,
    [
      eventId,
      version,
      event.title,
      event.question,
      event.status,
      event.deadline,
      event.resolutionCriteria,
      event.category,
      event.significance,
      event.region,
      event.summary,
      event.tags,
      event.relatedEventIds,
      event.provenance,
      correctionNote,
    ],
  )
  if (inserted.rowCount) return true

  const { rows } = await client.query<{
    title: string
    question: string
    status: string
    deadline: Date
    resolution_criteria: string
    category: string
    significance: string
    region: string
    summary: string
    tags: string[]
    related_event_ids: string[]
    provenance: string
    correction_note: string | null
  }>(
    `SELECT title, question, status, deadline, resolution_criteria, category, significance,
            region, summary, tags, related_event_ids, provenance, correction_note
       FROM event_revisions
      WHERE event_id = $1 AND version = $2`,
    [eventId, version],
  )
  const existing = rows[0]
  const incoming = semanticFromInput(event)
  const same =
    sameSemantic(rowToSemantic(existing), incoming) &&
    existing.correction_note === correctionNote
  if (!same) {
    const next = await client.query<{ next: number }>(
      "SELECT max(version) + 1 AS next FROM event_revisions WHERE event_id = $1",
      [eventId],
    )
    throw new HistoryConflictError(
      `Event ${eventId} revision ${version} is already recorded with different values. Publish the correction as version ${next.rows[0].next} with an event.correctionNote.`,
    )
  }
  return false
}

async function appendEventRevisionIfChanged(client: ClientBase, bundle: EventBundle): Promise<AppendCounts> {
  const event = bundle.event
  if (!event) return { appended: 0, unchanged: 0 }

  await client.query("SELECT 1 FROM events WHERE id = $1 FOR UPDATE", [bundle.eventId])

  const incoming = semanticFromInput(event)
  const latest = await loadLatestSemanticSnapshot(client, bundle.eventId)
  if (!latest) {
    throw new HistoryConflictError(`Event ${bundle.eventId} does not exist; include bundle.event to create it.`)
  }

  if (sameSemantic(latest.snapshot, incoming)) {
    return { appended: 0, unchanged: 1 }
  }

  const nextVersion = latest.latestVersion + 1
  const correctionNote = event.correctionNote?.trim()
  if (nextVersion > 1 && !correctionNote) {
    throw new HistoryConflictError(
      `Event ${bundle.eventId} metadata changed after revision ${latest.latestVersion}. Include event.correctionNote to publish revision ${nextVersion}.`,
    )
  }
  const appended = await insertEventRevision(
    client,
    bundle.eventId,
    event,
    nextVersion,
    nextVersion > 1 ? correctionNote! : null,
  )
  return { appended: appended ? 1 : 0, unchanged: appended ? 0 : 1 }
}

async function appendInitialEventRevision(client: ClientBase, bundle: EventBundle): Promise<AppendCounts> {
  const event = bundle.event
  if (!event) return { appended: 0, unchanged: 0 }

  await client.query("SELECT 1 FROM events WHERE id = $1 FOR UPDATE", [bundle.eventId])
  const incoming = semanticFromInput(event)
  const latest = await loadLatestSemanticSnapshot(client, bundle.eventId)
  if (!latest) {
    throw new HistoryConflictError(`Event ${bundle.eventId} does not exist; include bundle.event to create it.`)
  }
  if (latest.fromRevision && latest.latestVersion >= 1) {
    if (sameSemantic(latest.snapshot, incoming)) {
      return { appended: 0, unchanged: 1 }
    }
    throw new HistoryConflictError(
      `Event ${bundle.eventId} revision 1 is already recorded with different values. Publish corrections with event.correctionNote.`,
    )
  }

  const appended = await insertEventRevision(client, bundle.eventId, event, 1, null)
  return { appended: appended ? 1 : 0, unchanged: appended ? 0 : 1 }
}

async function upsertEvent(client: ClientBase, bundle: EventBundle): Promise<WriteSummary["event"]> {
  const event = bundle.event
  if (!event) {
    const { rowCount } = await client.query("SELECT 1 FROM events WHERE id = $1", [bundle.eventId])
    if (!rowCount) throw new HistoryConflictError(`Event ${bundle.eventId} does not exist; include bundle.event to create it.`)
    return "not provided"
  }
  const { rows } = await client.query<{ inserted: boolean }>(
    `INSERT INTO events (
       id, title, question, status, deadline, resolution_criteria, category, significance,
       region, summary, tags, related_event_ids, provenance, followed_by_default,
       catalog_position, display
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       question = EXCLUDED.question,
       status = EXCLUDED.status,
       deadline = EXCLUDED.deadline,
       resolution_criteria = EXCLUDED.resolution_criteria,
       category = EXCLUDED.category,
       significance = EXCLUDED.significance,
       region = EXCLUDED.region,
       summary = EXCLUDED.summary,
       tags = EXCLUDED.tags,
       related_event_ids = EXCLUDED.related_event_ids,
       provenance = EXCLUDED.provenance,
       followed_by_default = EXCLUDED.followed_by_default,
       catalog_position = EXCLUDED.catalog_position,
       display = EXCLUDED.display
     RETURNING (xmax = 0) AS inserted`,
    [
      event.id,
      event.title,
      event.question,
      event.status,
      event.deadline,
      event.resolutionCriteria,
      event.category,
      event.significance,
      event.region,
      event.summary,
      event.tags,
      event.relatedEventIds,
      event.provenance,
      event.followedByDefault,
      event.catalogPosition,
      JSON.stringify(event.display),
    ],
  )
  return rows[0].inserted ? "inserted" : "updated"
}

async function appendObservation(client: ClientBase, eventId: string, item: ObservationInput): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO probability_observations (
       event_id, source_kind, source_name, probability_type, probability_pct,
       observed_at, captured_at, note, provenance
     ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9)
     ON CONFLICT ON CONSTRAINT observations_unique_point DO NOTHING
     RETURNING id`,
    [
      eventId,
      item.sourceKind,
      item.sourceName,
      item.probabilityType,
      item.probabilityPct,
      item.observedAt,
      item.capturedAt ?? null,
      item.note ?? null,
      item.provenance,
    ],
  )
  if (inserted.rowCount) return true
  const { rows } = await client.query<{ probability_pct: number; note: string | null; provenance: string }>(
    `SELECT probability_pct::float8 AS probability_pct, note, provenance
       FROM probability_observations
      WHERE event_id = $1 AND source_kind = $2 AND source_name = $3
        AND probability_type = $4 AND observed_at = $5`,
    [eventId, item.sourceKind, item.sourceName, item.probabilityType, item.observedAt],
  )
  const existing = rows[0]
  if (
    existing.probability_pct !== item.probabilityPct ||
    existing.note !== (item.note ?? null) ||
    existing.provenance !== item.provenance
  ) {
    throw new HistoryConflictError(
      `Observation from ${item.sourceName} (${item.probabilityType}) at ${item.observedAt} is already recorded with different values. Observations are append-only.`,
    )
  }
  return false
}

async function appendEvidence(client: ClientBase, eventId: string, item: EvidenceInput): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO evidence (
       id, event_id, source_name, source_url, source_published_at, first_observed_at,
       captured_at, summary, stance, reliability, recorded_by, provenance
     ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      item.id,
      eventId,
      item.sourceName,
      item.sourceUrl ?? null,
      item.sourcePublishedAt,
      item.firstObservedAt,
      item.capturedAt ?? null,
      item.summary,
      item.stance,
      item.reliability,
      item.recordedBy,
      item.provenance,
    ],
  )
  if (inserted.rowCount) return true
  const { rows } = await client.query<{
    event_id: string
    source_name: string
    source_url: string | null
    source_published_at: Date | null
    first_observed_at: Date
    summary: string
    stance: string
    reliability: number
    recorded_by: string
    provenance: string
  }>(
    `SELECT event_id, source_name, source_url, source_published_at, first_observed_at,
            summary, stance, reliability::float8 AS reliability, recorded_by, provenance
       FROM evidence WHERE id = $1`,
    [item.id],
  )
  const existing = rows[0]
  const same =
    existing.event_id === eventId &&
    existing.source_name === item.sourceName &&
    existing.source_url === (item.sourceUrl ?? null) &&
    iso(existing.source_published_at) === item.sourcePublishedAt &&
    iso(existing.first_observed_at) === item.firstObservedAt &&
    existing.summary === item.summary &&
    existing.stance === item.stance &&
    existing.reliability === item.reliability &&
    existing.recorded_by === item.recordedBy &&
    existing.provenance === item.provenance
  if (!same) {
    throw new HistoryConflictError(
      `Evidence ${item.id} is already recorded with different values. Evidence is append-only; record a new evidence id instead.`,
    )
  }
  return false
}

async function appendRevision(client: ClientBase, eventId: string, item: MoveLogRevisionInput): Promise<boolean> {
  await client.query(
    "INSERT INTO move_logs (id, event_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [item.moveLogId, eventId],
  )
  const log = await client.query<{ event_id: string }>("SELECT event_id FROM move_logs WHERE id = $1", [item.moveLogId])
  if (log.rows[0].event_id !== eventId) {
    throw new HistoryConflictError(`Move log ${item.moveLogId} belongs to event ${log.rows[0].event_id}, not ${eventId}.`)
  }

  const { rows } = await client.query<{
    published_at: Date
    author: string
    what_changed: string
    likely_cause: string
    explained_pct: number
    unexplained_factors: string[]
    evidence_ids: string[]
    correction_note: string | null
    provenance: string
  }>(
    `SELECT published_at, author, what_changed, likely_cause, explained_pct::float8 AS explained_pct,
            unexplained_factors, evidence_ids, correction_note, provenance
       FROM move_log_revisions WHERE move_log_id = $1 AND version = $2`,
    [item.moveLogId, item.version],
  )
  const existing = rows[0]
  if (existing) {
    const same =
      iso(existing.published_at) === item.publishedAt &&
      existing.author === item.author &&
      existing.what_changed === item.whatChanged &&
      existing.likely_cause === item.likelyCause &&
      existing.explained_pct === item.explainedPct &&
      sameArray(existing.unexplained_factors, item.unexplainedFactors) &&
      sameArray(existing.evidence_ids, item.evidenceIds) &&
      existing.correction_note === (item.correctionNote ?? null) &&
      existing.provenance === item.provenance
    if (!same) {
      const next = await client.query<{ next: number }>(
        "SELECT max(version) + 1 AS next FROM move_log_revisions WHERE move_log_id = $1",
        [item.moveLogId],
      )
      throw new HistoryConflictError(
        `Move log ${item.moveLogId} version ${item.version} is already published and cannot be rewritten. Publish the correction as version ${next.rows[0].next} with a correctionNote.`,
      )
    }
    return false
  }

  await client.query(
    `INSERT INTO move_log_revisions (
       move_log_id, version, published_at, author, what_changed, likely_cause,
       explained_pct, unexplained_factors, evidence_ids, correction_note, provenance
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      item.moveLogId,
      item.version,
      item.publishedAt,
      item.author,
      item.whatChanged,
      item.likelyCause,
      item.explainedPct,
      item.unexplainedFactors,
      item.evidenceIds,
      item.correctionNote ?? null,
      item.provenance,
    ],
  )
  return true
}

async function count<T>(items: T[], write: (item: T) => Promise<boolean>): Promise<AppendCounts> {
  const counts: AppendCounts = { appended: 0, unchanged: 0 }
  for (const item of items) {
    if (await write(item)) counts.appended += 1
    else counts.unchanged += 1
  }
  return counts
}

/**
 * Writes one validated bundle in a single transaction: upserts the event and
 * appends observations, evidence and move log revisions. Re-running an
 * identical bundle changes nothing; changing recorded history is refused.
 * Callers must check the target with `assertWritableDatabase` first.
 */
export async function writeEventBundle(client: ClientBase, bundle: EventBundle): Promise<WriteSummary> {
  await client.query("BEGIN")
  try {
    await client.query("SET LOCAL omen.allow_event_projection = true")
    let eventRevisions: AppendCounts = { appended: 0, unchanged: 0 }
    let event: WriteSummary["event"]
    if (bundle.event) {
      const { rowCount: exists } = await client.query("SELECT 1 FROM events WHERE id = $1", [bundle.eventId])
      if (exists) {
        eventRevisions = await appendEventRevisionIfChanged(client, bundle)
        event = await upsertEvent(client, bundle)
      } else {
        event = await upsertEvent(client, bundle)
        eventRevisions = await appendInitialEventRevision(client, bundle)
      }
    } else {
      event = await upsertEvent(client, bundle)
    }
    const observations = await count(bundle.observations, (item) => appendObservation(client, bundle.eventId, item))
    const evidence = await count(bundle.evidence, (item) => appendEvidence(client, bundle.eventId, item))
    const revisions = [...bundle.moveLogRevisions].sort((a, b) => a.version - b.version)
    const moveLogRevisions = await count(revisions, (item) => appendRevision(client, bundle.eventId, item))
    await client.query("COMMIT")
    return { eventId: bundle.eventId, event, eventRevisions, observations, evidence, moveLogRevisions }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}
