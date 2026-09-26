import { orderSeries } from "@/lib/domain/probability-history"
import { probabilityDelta } from "@/lib/domain/scoring"
import type {
  AionEvent,
  EventSource,
  EventStatus,
  MoveLogSummary,
  ProbabilityObservation,
  ProbabilitySeries,
  StoredForecast,
} from "@/types/event"

const ms = (iso: string) => new Date(iso).getTime()

/** When a row became available for reconstruction; falls back for legacy demo rows. */
export function observationAvailableAt(point: ProbabilityObservation): string {
  return point.capturedAt ?? point.observedAt
}

export function evidenceAvailableAt(source: EventSource): string {
  return source.capturedAt ?? source.firstObservedAt ?? source.publishedAt ?? ""
}

export interface StoredMoveLogRevision {
  moveLogId: string
  version: number
  publishedAt: string
  recordAvailableAt?: string
  author: string
  whatChanged: string
  likelyCause: string
  explainedPct: number
  unexplainedFactors: string[]
  evidenceIds: string[]
  correctionNote?: string | null
}

export function moveLogRevisionAvailableAt(revision: StoredMoveLogRevision): string {
  return revision.recordAvailableAt ?? revision.publishedAt
}

export interface EventSemanticRevision {
  version: number
  title: string
  question: string
  status: EventStatus
  summary: string
  resolutionCriteria?: string
  recordAvailableAt: string
}

export interface HistoryCoverage {
  /** Semantic event metadata is trustworthy from this instant (UTC). */
  semanticEventFieldsFrom?: string
  /** Pre-migration rows were aligned to this availability instant. */
  recordAvailabilityRealignedAt?: string
  /** Demo book uses capture times as availability proxies. */
  usesDemoAvailabilityProxy?: boolean
}

export type HistoryCheckpointKind = "observation" | "evidence" | "move_log" | "event_semantics"

export interface HistoryCheckpoint {
  id: string
  kind: HistoryCheckpointKind
  /** Exact recorded instant for this checkpoint (UTC ISO). */
  availableAt: string
  label: string
}

export interface HistoryCoverageLimitation {
  id: string
  text: string
}

export interface HistoricalReconstructionInput {
  event: AionEvent
  moveLogRevisions?: StoredMoveLogRevision[]
  eventRevisions?: EventSemanticRevision[]
  coverage?: HistoryCoverage
}

export interface HistoricalEventSemantics {
  title: string
  question: string
  status: EventStatus
  summary: string
  resolutionCriteria?: string
  version?: number
  available: boolean
}

export interface HistoricalReconstruction {
  eventId: string
  cutoff: string
  checkpointId?: string
  semantics: HistoricalEventSemantics
  probabilitySeries: ProbabilitySeries[]
  evidence: EventSource[]
  forecasts: StoredForecast[]
  moveLog?: MoveLogSummary & {
    whatChanged: string
    likelyCause: string
    explainedPct: number
    unexplainedFactors: string[]
  }
  headlineProbability?: number
  previousProbability?: number
  checkpoints: HistoryCheckpoint[]
  limitations: HistoryCoverageLimitation[]
}

export function encodeCheckpointId(kind: HistoryCheckpointKind, availableAt: string): string {
  return `${kind}:${availableAt}`
}

export function decodeCheckpointId(id: string): { kind: HistoryCheckpointKind; availableAt: string } | undefined {
  const split = id.indexOf(":")
  if (split <= 0) return undefined
  const kind = id.slice(0, split) as HistoryCheckpointKind
  const availableAt = id.slice(split + 1)
  if (!availableAt || Number.isNaN(ms(availableAt))) return undefined
  if (!["observation", "evidence", "move_log", "event_semantics"].includes(kind)) return undefined
  return { kind, availableAt }
}

function semanticRevisionAt(
  revisions: EventSemanticRevision[] | undefined,
  cutoff: string,
  coverage: HistoryCoverage | undefined,
): EventSemanticRevision | undefined {
  if (!revisions?.length) return undefined
  const baseline = coverage?.semanticEventFieldsFrom
  if (baseline && ms(cutoff) < ms(baseline)) return undefined
  const eligible = revisions
    .filter((item) => ms(item.recordAvailableAt) <= ms(cutoff))
    .sort((a, b) => ms(b.recordAvailableAt) - ms(a.recordAvailableAt))
  return eligible[0]
}

function eligibleMoveLogRevision(
  revisions: StoredMoveLogRevision[] | undefined,
  cutoff: string,
): StoredMoveLogRevision | undefined {
  if (!revisions?.length) return undefined
  return revisions
    .filter((item) => ms(moveLogRevisionAvailableAt(item)) <= ms(cutoff))
    .sort(
      (a, b) =>
        ms(moveLogRevisionAvailableAt(b)) - ms(moveLogRevisionAvailableAt(a)) || b.version - a.version,
    )[0]
}

function filterSeriesAtCutoff(series: ProbabilitySeries[], cutoff: string): ProbabilitySeries[] {
  return orderSeries(
    series
      .map((item) => ({
        ...item,
        observations: item.observations.filter((point) => ms(observationAvailableAt(point)) <= ms(cutoff)),
      }))
      .filter((item) => item.observations.length > 0),
  )
}

function filterEvidenceAtCutoff(evidence: EventSource[], cutoff: string): EventSource[] {
  return evidence.filter((item) => {
    const at = evidenceAvailableAt(item)
    return at && ms(at) <= ms(cutoff)
  })
}

function filterForecastsAtCutoff(forecasts: StoredForecast[], cutoff: string): StoredForecast[] {
  return forecasts.filter(
    (item) => ms(item.issuedAt) <= ms(cutoff) && ms(item.evidenceCutoff) <= ms(cutoff),
  )
}

export function listHistoryCheckpoints(input: HistoricalReconstructionInput): HistoryCheckpoint[] {
  const { event, moveLogRevisions, eventRevisions } = input
  const checkpoints: HistoryCheckpoint[] = []

  for (const series of event.probabilitySeries) {
    for (const point of series.observations) {
      const availableAt = observationAvailableAt(point)
      checkpoints.push({
        id: encodeCheckpointId("observation", availableAt),
        kind: "observation",
        availableAt,
        label: `${series.sourceName} recorded ${point.probability.toFixed(1)}%`,
      })
    }
  }

  for (const item of event.evidence) {
    const availableAt = evidenceAvailableAt(item)
    if (!availableAt) continue
    checkpoints.push({
      id: encodeCheckpointId("evidence", availableAt),
      kind: "evidence",
      availableAt,
      label: `Evidence observed: ${item.name}`,
    })
  }

  for (const revision of moveLogRevisions ?? []) {
    const availableAt = moveLogRevisionAvailableAt(revision)
    checkpoints.push({
      id: encodeCheckpointId("move_log", availableAt),
      kind: "move_log",
      availableAt,
      label:
        revision.version > 1
          ? `Move log ${revision.moveLogId} corrected (v${revision.version})`
          : `Move log ${revision.moveLogId} published`,
    })
  }

  for (const revision of eventRevisions ?? []) {
    checkpoints.push({
      id: encodeCheckpointId("event_semantics", revision.recordAvailableAt),
      kind: "event_semantics",
      availableAt: revision.recordAvailableAt,
      label: `Event metadata v${revision.version}`,
    })
  }

  return checkpoints.sort((a, b) => a.availableAt.localeCompare(b.availableAt) || a.kind.localeCompare(b.kind))
}

export function buildCoverageLimitations(
  input: HistoricalReconstructionInput,
  cutoff: string,
  semanticsAvailable: boolean,
): HistoryCoverageLimitation[] {
  const limitations: HistoryCoverageLimitation[] = []
  const { coverage, eventRevisions } = input

  if (coverage?.usesDemoAvailabilityProxy) {
    limitations.push({
      id: "demo-proxy",
      text: "Demo book rows use observation and capture times as availability; there is no separate record_available_at column in memory.",
    })
  }

  if (coverage?.recordAvailabilityRealignedAt && ms(cutoff) < ms(coverage.recordAvailabilityRealignedAt)) {
    limitations.push({
      id: "pre-alignment",
      text: `Stored rows before ${coverage.recordAvailabilityRealignedAt} may not reflect trustworthy availability timestamps.`,
    })
  }

  if (coverage?.semanticEventFieldsFrom && ms(cutoff) < ms(coverage.semanticEventFieldsFrom)) {
    limitations.push({
      id: "semantic-baseline",
      text: `Event title, status and resolution criteria are unavailable before ${coverage.semanticEventFieldsFrom}.`,
    })
  } else if (!eventRevisions?.length) {
    limitations.push({
      id: "semantic-unversioned",
      text: "Event title and status are not versioned in this store; historical views show the question and summary only.",
    })
  } else if (!semanticsAvailable) {
    limitations.push({
      id: "semantic-missing",
      text: "No event metadata revision was available yet at this cutoff.",
    })
  }

  limitations.push({
    id: "instant-coverage",
    text: "Arbitrary-time replay includes every row whose record availability is at or before the chosen UTC instant. Checkpoints jump to exact recorded times only.",
  })

  return limitations
}

export function reconstructAt(
  input: HistoricalReconstructionInput,
  cutoff: string,
  checkpointId?: string,
): HistoricalReconstruction | undefined {
  if (!cutoff || Number.isNaN(ms(cutoff))) return undefined

  const decoded = checkpointId ? decodeCheckpointId(checkpointId) : undefined
  const effectiveCutoff = decoded?.availableAt ?? cutoff
  if (Number.isNaN(ms(effectiveCutoff))) return undefined

  const probabilitySeries = filterSeriesAtCutoff(input.event.probabilitySeries, effectiveCutoff)
  if (probabilitySeries.length === 0) return undefined

  const evidence = filterEvidenceAtCutoff(input.event.evidence, effectiveCutoff)
  const forecasts = filterForecastsAtCutoff(input.event.forecasts, effectiveCutoff)
  const revision = eligibleMoveLogRevision(input.moveLogRevisions, effectiveCutoff)
  const semantic = semanticRevisionAt(input.eventRevisions, effectiveCutoff, input.coverage)

  const semantics: HistoricalEventSemantics = semantic
    ? {
        title: semantic.title,
        question: semantic.question,
        status: semantic.status,
        summary: semantic.summary,
        resolutionCriteria: semantic.resolutionCriteria,
        version: semantic.version,
        available: true,
      }
    : {
        title: input.event.title,
        question: input.event.question,
        status: input.event.status,
        summary: input.event.summary,
        resolutionCriteria: input.event.resolutionCriteria,
        available: Boolean(input.eventRevisions?.length) || false,
      }

  const headline = probabilitySeries[0]
  const latest = headline?.observations.at(-1)
  const previous = headline?.observations.at(-2)

  const moveLog = revision
    ? {
        id: revision.moveLogId,
        version: revision.version,
        publishedAt: revision.publishedAt,
        firstPublishedAt:
          input.moveLogRevisions?.find((item) => item.moveLogId === revision.moveLogId && item.version === 1)
            ?.publishedAt ?? revision.publishedAt,
        author: revision.author,
        ...(revision.correctionNote ? { correctionNote: revision.correctionNote } : {}),
        evidenceIds: revision.evidenceIds.filter((id) => evidence.some((item) => item.id === id)),
        whatChanged: revision.whatChanged,
        likelyCause: revision.likelyCause,
        explainedPct: revision.explainedPct,
        unexplainedFactors: revision.unexplainedFactors,
      }
    : undefined

  const limitations = buildCoverageLimitations(input, effectiveCutoff, semantics.available)

  return {
    eventId: input.event.id,
    cutoff: effectiveCutoff,
    checkpointId: decoded ? checkpointId : undefined,
    semantics,
    probabilitySeries,
    evidence,
    forecasts,
    moveLog,
    headlineProbability: latest?.probability,
    previousProbability: previous?.probability,
    checkpoints: listHistoryCheckpoints(input),
    limitations,
  }
}

export function headlineChangeAt(reconstruction: HistoricalReconstruction): number | undefined {
  if (
    reconstruction.headlineProbability === undefined ||
    reconstruction.previousProbability === undefined
  ) {
    return undefined
  }
  return probabilityDelta(reconstruction.headlineProbability, reconstruction.previousProbability)
}

/** Parses a wall-clock in an IANA zone into a UTC ISO instant. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute, second = 0] = time.split(":").map(Number)
  if (
    [year, month, day, hour, minute, second].some((value) => Number.isNaN(value)) ||
    !timeZone.trim()
  ) {
    throw new Error("Invalid date, time or timezone")
  }

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second)
  const desiredMs = utcMs
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = partsInTimeZone(new Date(utcMs), timeZone)
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    utcMs += desiredMs - asUtc
  }
  return new Date(utcMs).toISOString()
}

function partsInTimeZone(instant: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  return Object.fromEntries(
    fmt.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  )
}

export const COMMON_ARCHIVE_TIME_ZONES = [
  "UTC",
  "America/Toronto",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
] as const
