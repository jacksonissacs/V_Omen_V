import type { ClientBase, Pool } from "pg"

import { buildEvent } from "../../data/build-event"
import type {
  AionEvent,
  EventCategory,
  EventSource,
  MoveLogSummary,
  Provenance,
  Significance,
  TimelineItem,
} from "../../types/event"
import type { EventDisplayInput } from "./event-bundle"

type Queryable = Pick<ClientBase | Pool, "query">

interface EventRow {
  id: string
  title: string
  question: string
  status: AionEvent["status"]
  deadline: Date
  resolution_criteria: string
  category: EventCategory
  significance: Significance
  region: string
  summary: string
  tags: string[]
  related_event_ids: string[]
  provenance: Provenance
  followed_by_default: boolean
  display: EventDisplayInput
  updated_at: Date
}

interface ObservationRow {
  event_id: string
  source_kind: string
  source_name: string
  probability_type: string
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
  summary: string
  stance: EventSource["stance"]
  reliability: number
  provenance: Provenance
}

export interface MoveLogRevisionRecord {
  moveLogId: string
  eventId: string
  version: number
  publishedAt: string
  recordedAt: string
  author: string
  whatChanged: string
  likelyCause: string
  explainedPct: number
  unexplainedFactors: string[]
  evidenceIds: string[]
  correctionNote: string | null
  provenance: Provenance
}

interface RevisionRow {
  move_log_id: string
  event_id: string
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

const DEADLINE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

function formatDeadline(date: Date): string {
  return DEADLINE_FORMAT.format(date).replace(",", "")
}

function utcClock(date: Date, withSeconds: boolean): string {
  return date.toISOString().slice(11, withSeconds ? 19 : 16)
}

function toRevision(row: RevisionRow): MoveLogRevisionRecord {
  return {
    moveLogId: row.move_log_id,
    eventId: row.event_id,
    version: row.version,
    publishedAt: row.published_at.toISOString(),
    recordedAt: row.recorded_at.toISOString(),
    author: row.author,
    whatChanged: row.what_changed,
    likelyCause: row.likely_cause,
    explainedPct: row.explained_pct,
    unexplainedFactors: row.unexplained_factors,
    evidenceIds: row.evidence_ids,
    correctionNote: row.correction_note,
    provenance: row.provenance,
  }
}

/** Picks the move log whose first revision is newest, and returns its latest revision. */
function latestMoveLog(revisions: MoveLogRevisionRecord[]): { latest: MoveLogRevisionRecord; firstPublishedAt: string } | undefined {
  const byLog = new Map<string, MoveLogRevisionRecord[]>()
  for (const revision of revisions) {
    const list = byLog.get(revision.moveLogId) ?? []
    list.push(revision)
    byLog.set(revision.moveLogId, list)
  }
  let chosen: { latest: MoveLogRevisionRecord; firstPublishedAt: string } | undefined
  for (const list of byLog.values()) {
    list.sort((a, b) => a.version - b.version)
    const candidate = { latest: list[list.length - 1], firstPublishedAt: list[0].publishedAt }
    if (!chosen || candidate.firstPublishedAt > chosen.firstPublishedAt) chosen = candidate
  }
  return chosen
}

/** Timeline built only from stored records, used when no presentation timeline is stored. */
function recordedTimeline(evidence: EvidenceRow[], revisions: MoveLogRevisionRecord[]): TimelineItem[] {
  const items: Array<TimelineItem & { at: string }> = [
    ...evidence.map((item) => ({
      at: item.first_observed_at.toISOString(),
      time: utcClock(item.first_observed_at, true),
      text: `OMEN first observed: ${item.source_name}`,
      type: "source" as const,
    })),
    ...revisions.map((revision) => ({
      at: revision.publishedAt,
      time: utcClock(new Date(revision.publishedAt), true),
      text:
        revision.version === 1
          ? `Move log ${revision.moveLogId} published`
          : `Move log ${revision.moveLogId} corrected (v${revision.version})`,
      type: "system" as const,
    })),
  ]
  return items
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((item) => ({ time: item.time, text: item.text, type: item.type }))
}

function assemble(
  row: EventRow,
  observations: ObservationRow[],
  evidence: EvidenceRow[],
  revisions: MoveLogRevisionRecord[],
): AionEvent | undefined {
  if (observations.length === 0) return undefined
  const display = row.display ?? {}
  const current = observations[observations.length - 1]
  const previous = observations[observations.length - 2] ?? current
  const moveLog = latestMoveLog(revisions)
  const latest = moveLog?.latest
  const observedAt = current.observed_at

  const summary: MoveLogSummary | undefined =
    latest && moveLog
      ? {
          id: latest.moveLogId,
          version: latest.version,
          publishedAt: latest.publishedAt,
          firstPublishedAt: moveLog.firstPublishedAt,
          author: latest.author,
          ...(latest.correctionNote ? { correctionNote: latest.correctionNote } : {}),
          evidenceIds: latest.evidenceIds,
        }
      : undefined

  const sources: EventSource[] = evidence.map((item) => ({
    id: item.id,
    name: item.source_name,
    publishedAt: item.source_published_at ? item.source_published_at.toISOString() : null,
    firstObservedAt: item.first_observed_at.toISOString(),
    summary: item.summary,
    stance: item.stance,
    reliability: item.reliability,
    ...(item.source_url ? { url: item.source_url } : {}),
  }))

  return buildEvent({
    id: row.id,
    provenance: row.provenance,
    title: row.title,
    category: row.category,
    probability: current.probability_pct,
    previousProbability: previous.probability_pct,
    confidence: display.confidence,
    timestamp: observedAt.toISOString(),
    displayTime: display.displayTime ?? `${utcClock(observedAt, false)} UTC`,
    status: row.status,
    summary: row.summary,
    question: row.question,
    whatChanged: latest?.whatChanged ?? "No move log has been published for this event yet.",
    likelyCause: latest?.likelyCause ?? "Not yet attributed",
    unexplainedFactors: latest?.unexplainedFactors ?? [],
    significance: row.significance,
    sourceTier: display.sourceTier ?? 2,
    sigma: display.sigma ?? 0,
    duration: display.duration ?? "—",
    catalystLabel: display.catalystLabel,
    catalyst: display.catalyst ?? latest?.likelyCause ?? "Not yet attributed",
    catalystTime: display.catalystTime ?? utcClock(observedAt, true),
    explained: latest?.explainedPct ?? 0,
    region: row.region,
    tags: row.tags,
    resolvesAt: formatDeadline(row.deadline),
    deadline: row.deadline.toISOString(),
    resolutionCriteria: row.resolution_criteria,
    entities: display.entities ?? [],
    evidence: sources,
    relatedMarkets: (display.relatedMarkets ?? []) as AionEvent["relatedMarkets"],
    relatedEvents: row.related_event_ids,
    signals: (display.signals ?? []) as AionEvent["signals"],
    analogues: (display.analogues ?? []) as AionEvent["analogues"],
    timeline: (display.timeline as AionEvent["timeline"] | undefined) ?? recordedTimeline(evidence, revisions),
    expectationHistory: observations.map((item) => ({
      at: item.observed_at.toISOString(),
      probability: item.probability_pct,
      ...(item.note ? { note: item.note } : {}),
    })),
    anomaly: display.anomaly,
    moveLog: summary,
  })
}

function groupBy<T extends { event_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.event_id) ?? []
    list.push(row)
    map.set(row.event_id, list)
  }
  return map
}

export interface StoredEvents {
  events: AionEvent[]
  followedEventIds: string[]
}

/**
 * Reads events (all, or the given ids) with their observations, evidence and
 * move log revisions, in catalog order. Events without observations are skipped.
 */
export async function readEvents(db: Queryable, ids?: string[]): Promise<StoredEvents> {
  const filter = ids ?? null
  // Sequential: a single pg client cannot run queries concurrently.
  const eventRows = await db.query<EventRow>(
    `SELECT id, title, question, status, deadline, resolution_criteria, category, significance,
            region, summary, tags, related_event_ids, provenance, followed_by_default, display, updated_at
       FROM events
      WHERE $1::text[] IS NULL OR id = ANY ($1::text[])
      ORDER BY catalog_position, id`,
    [filter],
  )
  const observationRows = await db.query<ObservationRow>(
    `SELECT event_id, source_kind, source_name, probability_type,
            probability_pct::float8 AS probability_pct, observed_at, captured_at, note, provenance
       FROM probability_observations
      WHERE $1::text[] IS NULL OR event_id = ANY ($1::text[])
      ORDER BY event_id, observed_at, id`,
    [filter],
  )
  const evidenceRows = await db.query<EvidenceRow>(
    `SELECT id, event_id, source_name, source_url, source_published_at, first_observed_at,
            summary, stance, reliability::float8 AS reliability, provenance
       FROM evidence
      WHERE $1::text[] IS NULL OR event_id = ANY ($1::text[])
      ORDER BY event_id, first_observed_at, id`,
    [filter],
  )
  const revisionRows = await db.query<RevisionRow>(
    `SELECT r.move_log_id, m.event_id, r.version, r.published_at, r.recorded_at, r.author,
            r.what_changed, r.likely_cause, r.explained_pct::float8 AS explained_pct,
            r.unexplained_factors, r.evidence_ids, r.correction_note, r.provenance
       FROM move_log_revisions r
       JOIN move_logs m ON m.id = r.move_log_id
      WHERE $1::text[] IS NULL OR m.event_id = ANY ($1::text[])
      ORDER BY m.event_id, r.move_log_id, r.version`,
    [filter],
  )

  const observations = groupBy(observationRows.rows)
  const evidence = groupBy(evidenceRows.rows)
  const revisions = groupBy(revisionRows.rows)
  const events: AionEvent[] = []
  for (const row of eventRows.rows) {
    const event = assemble(
      row,
      observations.get(row.id) ?? [],
      evidence.get(row.id) ?? [],
      (revisions.get(row.id) ?? []).map(toRevision),
    )
    if (event) events.push(event)
  }
  const shown = new Set(events.map((event) => event.id))
  return {
    events,
    followedEventIds: eventRows.rows
      .filter((row) => row.followed_by_default && shown.has(row.id))
      .map((row) => row.id),
  }
}

/** Every published revision of every move log on an event, oldest first. */
export async function readMoveLogHistory(db: Queryable, eventId: string): Promise<MoveLogRevisionRecord[]> {
  const { rows } = await db.query<RevisionRow>(
    `SELECT r.move_log_id, m.event_id, r.version, r.published_at, r.recorded_at, r.author,
            r.what_changed, r.likely_cause, r.explained_pct::float8 AS explained_pct,
            r.unexplained_factors, r.evidence_ids, r.correction_note, r.provenance
       FROM move_log_revisions r
       JOIN move_logs m ON m.id = r.move_log_id
      WHERE m.event_id = $1
      ORDER BY r.move_log_id, r.version`,
    [eventId],
  )
  return rows.map(toRevision)
}
