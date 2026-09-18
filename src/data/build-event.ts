import { probabilityDelta } from "@/lib/domain/scoring"
import type {
  AionEvent,
  EventAnomaly,
  EventCategory,
  EventSignal,
  EventSource,
  ExpectationPoint,
  HistoricalAnalogue,
  RelatedMarket,
  TimelineItem,
} from "@/types/event"

export interface EventDraft {
  id: string
  title: string
  category: EventCategory
  probability: number
  previousProbability: number
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
  sigma: number
  duration: string
  catalystLabel?: string
  catalyst: string
  catalystTime: string
  explained: number
  region: string
  tags: string[]
  resolvesAt?: string
  entities: string[]
  evidence: EventSource[]
  relatedMarkets?: RelatedMarket[]
  relatedEvents?: string[]
  signals?: EventSignal[]
  analogues?: HistoricalAnalogue[]
  timeline?: TimelineItem[]
  expectationHistory: ExpectationPoint[]
  anomaly?: EventAnomaly
}

export function buildEvent(draft: EventDraft): AionEvent {
  const change = probabilityDelta(draft.probability, draft.previousProbability)
  const evidence = draft.evidence
  return {
    id: draft.id,
    title: draft.title,
    category: draft.category,
    probability: draft.probability,
    previousProbability: draft.previousProbability,
    confidence: draft.confidence ?? (Math.abs(change) >= 8 ? "High" : "Medium"),
    change,
    timestamp: draft.timestamp,
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
    significance: draft.significance ?? (Math.abs(change) >= 10 ? "critical" : Math.abs(change) >= 6 ? "high" : "medium"),
    sourceTier: draft.sourceTier ?? 1,
    sigma: draft.sigma,
    duration: draft.duration,
    catalystLabel: draft.catalystLabel ?? "Primary catalyst",
    catalyst: draft.catalyst,
    catalystTime: draft.catalystTime,
    explained: draft.explained,
    analogues: draft.analogues ?? [],
    timeline: draft.timeline ?? defaultTimeline(draft),
    expectationHistory: draft.expectationHistory,
    region: draft.region,
    tags: draft.tags,
    resolvesAt: draft.resolvesAt,
    entities: draft.entities,
    anomaly: draft.anomaly,
  }
}

function defaultTimeline(draft: EventDraft): TimelineItem[] {
  return [
    {
      time: draft.catalystTime,
      text: draft.catalyst,
      type: "source",
    },
    {
      time: incrementTime(draft.catalystTime, 42),
      text: "Related markets begin repricing",
    },
    {
      time: incrementTime(draft.catalystTime, 71),
      text: "OMEN detects abnormal movement",
    },
    {
      time: incrementTime(draft.catalystTime, 127),
      text: "Probability revises",
      delta: `${draft.probability - draft.previousProbability >= 0 ? "+" : ""}${probabilityDelta(draft.probability, draft.previousProbability).toFixed(1)} pts`,
      tone: draft.probability >= draft.previousProbability ? "up" : "down",
    },
  ]
}

function incrementTime(time: string, seconds: number): string {
  const [h, m, s] = time.split(":").map(Number)
  const total = (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0) + seconds
  const hh = String(Math.floor((total / 3600) % 24)).padStart(2, "0")
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const ss = String(total % 60).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}
