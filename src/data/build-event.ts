import { latestChange, orderSeries, seriesId } from "@/lib/domain/probability-history"
import type {
  AionEvent,
  EventAnomaly,
  EventCategory,
  EventSignal,
  EventSource,
  ExpectationPoint,
  HistoricalAnalogue,
  ProbabilitySeries,
  RelatedMarket,
  StoredForecast,
  TimelineItem,
} from "@/types/event"

/** Names the in-process demo book as the source of its illustrative series. */
export const DEMO_SERIES_SOURCE = "OMEN demo book"

export interface EventDraft {
  id: string
  provenance?: AionEvent["provenance"]
  title: string
  category: EventCategory
  probability: number
  /**
   * Ignored when the headline series has observations. Kept so existing drafts
   * still typecheck; the series is the only comparison.
   */
  previousProbability?: number | null
  /** Ignored. Movement size is not a data-quality measurement. */
  confidence?: AionEvent["confidence"]
  timestamp: string
  displayTime: string
  status?: AionEvent["status"]
  summary: string
  question: string
  whatChanged: string
  likelyCause: string
  unexplainedFactors: string[]
  significance?: AionEvent["significance"]
  sourceTier?: AionEvent["sourceTier"]
  /** Ignored. No stored procedure produces a sigma. */
  sigma?: number | null
  duration: string
  catalystLabel?: string
  catalyst: string
  catalystTime: string
  /** Kept for demo copy and for a published move log. Never invented when absent. */
  explained?: number | null
  region: string
  tags: string[]
  resolvesAt?: string
  deadline?: string
  resolutionCriteria?: string
  entities: string[]
  evidence: EventSource[]
  relatedMarkets?: RelatedMarket[]
  relatedEvents?: string[]
  signals?: EventSignal[]
  analogues?: HistoricalAnalogue[]
  timeline?: TimelineItem[]
  expectationHistory: ExpectationPoint[]
  /** Defaults to one illustrative series built from `expectationHistory`. */
  probabilitySeries?: ProbabilitySeries[]
  forecasts?: StoredForecast[]
  anomaly?: EventAnomaly
  moveLog?: AionEvent["moveLog"]
}

/**
 * An attribution percentage is shown only when someone stored it.
 * A sourced event without a move log does not inherit a display number.
 * Demo copy may keep an illustrative figure; callers must label it as such.
 */
export function storedExplanation(draft: Pick<EventDraft, "explained" | "provenance" | "moveLog">): number | null {
  if (draft.explained == null) return null
  const provenance = draft.provenance ?? "demo"
  if (provenance === "sourced" && !draft.moveLog) return null
  return draft.explained
}

export function buildEvent(draft: EventDraft): AionEvent {
  const probabilitySeries = orderSeries(draft.probabilitySeries ?? [demoSeries(draft)])
  const headline = probabilitySeries[0]
  const latest = headline?.observations.at(-1)
  const compared = latestChange(headline)
  const probability = latest?.probability ?? draft.probability
  const previousProbability = compared?.from.probability ?? null
  const change = compared?.deltaPp ?? null
  const evidence = draft.evidence
  const abs = change === null ? 0 : Math.abs(change)
  return {
    id: draft.id,
    provenance: draft.provenance ?? "demo",
    title: draft.title,
    category: draft.category,
    probability,
    previousProbability,
    confidence: null,
    change,
    timestamp: latest?.observedAt ?? draft.timestamp,
    displayTime: draft.displayTime,
    status: draft.status ?? "active",
    summary: draft.summary,
    evidence,
    sources: evidence,
    relatedMarkets: draft.relatedMarkets ?? [],
    relatedEvents: draft.relatedEvents ?? [],
    signals: draft.signals ?? [],
    likelyCause: draft.likelyCause,
    unexplainedFactors: draft.unexplainedFactors,
    question: draft.question,
    whatChanged: draft.whatChanged,
    significance:
      draft.significance ?? (abs >= 10 ? "critical" : abs >= 6 ? "high" : "medium"),
    sourceTier: draft.sourceTier ?? null,
    sigma: null,
    duration: draft.duration,
    catalystLabel: draft.catalystLabel ?? "Primary catalyst",
    catalyst: draft.catalyst,
    catalystTime: draft.catalystTime,
    explained: storedExplanation(draft),
    analogues: draft.analogues ?? [],
    timeline: draft.timeline ?? [],
    expectationHistory: headline
      ? headline.observations.map((point) => ({
          at: point.observedAt,
          probability: point.probability,
          ...(point.note ? { note: point.note } : {}),
        }))
      : draft.expectationHistory,
    probabilitySeries,
    forecasts: draft.forecasts ?? [],
    region: draft.region,
    tags: draft.tags,
    resolvesAt: draft.resolvesAt,
    deadline: draft.deadline,
    resolutionCriteria: draft.resolutionCriteria,
    entities: draft.entities,
    anomaly: draft.anomaly,
    moveLog: draft.moveLog,
  }
}

function demoSeries(draft: EventDraft): ProbabilitySeries {
  const identity = {
    sourceKind: "provider" as const,
    sourceName: DEMO_SERIES_SOURCE,
    probabilityType: "market_implied" as const,
    provenance: draft.provenance ?? "demo",
  }
  return orderSeries([
    {
      id: seriesId(identity),
      ...identity,
      observations: draft.expectationHistory.map((point) => ({
        observedAt: point.at,
        capturedAt: null,
        probability: point.probability,
        ...(point.note ? { note: point.note } : {}),
      })),
    },
  ])[0]
}
