export const EVENT_CATEGORIES = [
  "AI",
  "Technology",
  "Economics",
  "Geopolitics",
  "Companies",
  "Regulation",
  "Markets",
  "Energy",
  "Crypto",
  "Science",
] as const

export type EventCategory = (typeof EVENT_CATEGORIES)[number]
export type EventStatus = "watch" | "active" | "resolved"
export type ConfidenceLevel = "High" | "Medium" | "Low"
export type Significance = "critical" | "high" | "medium" | "low"
export type EvidenceStance = "supports" | "contradicts" | "contextual"
export type SourceTier = 1 | 2
export type SignalDirection = "up" | "down" | "flat"

export type Provenance = "demo" | "sourced"

export interface EventSource {
  id: string
  name: string
  /** When the source says it was published; `null` when the source carries no date. */
  publishedAt: string | null
  /** When OMEN first observed the source. Absent on legacy fixture records. */
  firstObservedAt?: string
  summary: string
  stance: EvidenceStance
  reliability: number
  url?: string
}

export interface RelatedMarket {
  id: string
  name: string
  venue: string
  last: number
  unit: string
  changePct: number
}

export interface EventSignal {
  id: string
  label: string
  value: string
  direction: SignalDirection
}

export interface TimelineItem {
  time: string
  text: string
  type?: "source" | "market" | "system"
  delta?: string
  tone?: "up" | "down"
}

export interface HistoricalAnalogue {
  id: string
  title: string
  year: number
  similarity: number
  outcome: string
  lesson: string
}

export interface ExpectationPoint {
  at: string
  probability: number
  note?: string
}

export interface EventAnomaly {
  title: string
  body: string
  interpretations: string[]
}

/** The latest published revision of the event's most recent move log. */
export interface MoveLogSummary {
  id: string
  version: number
  publishedAt: string
  firstPublishedAt: string
  author: string
  correctionNote?: string
  evidenceIds: string[]
}

export interface AionEvent {
  id: string
  /** Where the record came from. Independent of the storage mode: demo records stay demo in PostgreSQL. */
  provenance: Provenance
  title: string
  category: EventCategory
  probability: number
  previousProbability: number
  confidence: ConfidenceLevel
  change: number
  timestamp: string
  displayTime: string
  status: EventStatus
  summary: string
  evidence: EventSource[]
  sources: EventSource[]
  relatedMarkets: RelatedMarket[]
  relatedEvents: string[]
  signals: EventSignal[]
  likelyCause: string
  unexplainedFactors: string[]
  question: string
  whatChanged: string
  significance: Significance
  sourceTier: SourceTier
  sigma: number
  duration: string
  catalystLabel: string
  catalyst: string
  catalystTime: string
  explained: number
  analogues: HistoricalAnalogue[]
  timeline: TimelineItem[]
  expectationHistory: ExpectationPoint[]
  region: string
  tags: string[]
  resolvesAt?: string
  deadline?: string
  resolutionCriteria?: string
  entities: string[]
  anomaly?: EventAnomaly
  moveLog?: MoveLogSummary
}

export type EventSort = "change" | "probability" | "time" | "sigma" | "unexplained"

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  AI: "AI",
  Technology: "Technology",
  Economics: "Economics",
  Geopolitics: "Geopolitics",
  Companies: "Companies",
  Regulation: "Regulation",
  Markets: "Financial markets",
  Energy: "Energy",
  Crypto: "Crypto",
  Science: "Science",
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  watch: "Watch",
  active: "Active",
  resolved: "Resolved",
}
