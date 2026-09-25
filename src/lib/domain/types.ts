export const DOMAINS = [
  "technology",
  "finance",
  "geopolitics",
  "supply_chain",
] as const

export type Domain = (typeof DOMAINS)[number]

export function isDomain(value: string | undefined | null): value is Domain {
  return (DOMAINS as readonly string[]).includes(value ?? "")
}

export type EventStatus = "watch" | "active" | "resolved"
export type Significance = "critical" | "high" | "medium" | "low"
export type EvidenceStance = "supports" | "contradicts" | "contextual"
export type NodeKind = "event" | "market" | "entity" | "region"
export type CauseCategory =
  | "policy"
  | "market"
  | "operational"
  | "geopolitical"
  | "technical"

export type FeedKind =
  | "probability_shift"
  | "new_evidence"
  | "analogue_match"
  | "relationship"
  | "uncertainty"

export interface Cause {
  id: string
  statement: string
  confidence: number
  category: CauseCategory
}

export interface UncertaintyFactor {
  id: string
  question: string
  impact: string
  unresolved: boolean
}

export interface EvidenceItem {
  id: string
  source: string
  publishedAt: string
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

export interface Analogue {
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

export interface IntelligenceEvent {
  id: string
  title: string
  question: string
  domain: Domain
  status: EventStatus
  significance: Significance
  currentProbability: number
  previousProbability: number
  changedAt: string
  updatedAt: string
  whatChanged: string
  narrative: string
  causes: Cause[]
  uncertainty: UncertaintyFactor[]
  evidence: EvidenceItem[]
  relatedEventIds: string[]
  relatedMarkets: RelatedMarket[]
  analogues: Analogue[]
  expectationHistory: ExpectationPoint[]
  tags: string[]
  region: string
}

export interface IntelligenceItem {
  id: string
  eventId: string
  occurredAt: string
  kind: FeedKind
  headline: string
  detail: string
  deltaPp?: number
}

export interface GraphNode {
  id: string
  label: string
  kind: NodeKind
  domain?: Domain
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation: string
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface EventFilter {
  domain?: Domain | "all"
  query?: string
  /** `move` (default): largest absolute move first. `catalog`: curated book order. */
  order?: "move" | "catalog"
}

export interface SearchHit {
  id: string
  kind: "event" | "command" | "market"
  title: string
  subtitle: string
  href: string
  domain?: Domain
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  technology: "Technology",
  finance: "Finance",
  geopolitics: "Geopolitics",
  supply_chain: "Supply chain",
}

export const SIGNIFICANCE_LABEL: Record<Significance, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

export const FEED_KIND_LABEL: Record<FeedKind, string> = {
  probability_shift: "Probability",
  new_evidence: "Evidence",
  analogue_match: "Analogue",
  relationship: "Link",
  uncertainty: "Uncertainty",
}
