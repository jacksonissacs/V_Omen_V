import { events } from "@/data/events"
import { CATEGORY_DOMAIN } from "@/lib/domain/categories"
import type { GraphEdge, GraphNode, IntelligenceItem } from "@/lib/domain/types"

export { events }

export const defaultFollowedEventIds: readonly string[] = [
  "evt-boc-cut",
  "evt-frontier-release",
  "evt-fed-cut",
  "evt-housing-ca",
]

export const featuredAnomalyEventId = "evt-housing-ca"

export const feed: IntelligenceItem[] = events
  .slice()
  .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  .map((event, index) => ({
    id: `feed-${index + 1}`,
    eventId: event.id,
    occurredAt: event.timestamp,
    kind: event.change === 0 ? "uncertainty" : "probability_shift",
    headline: event.whatChanged,
    detail: event.summary,
    deltaPp: event.change,
  }))

export const graphNodes: GraphNode[] = [
  ...events.map((event) => ({
    id: event.id,
    label: event.title.slice(0, 22),
    kind: "event" as const,
    domain: CATEGORY_DOMAIN[event.category],
  })),
  { id: "ent-bis", label: "BIS", kind: "entity" },
  { id: "ent-fed", label: "FOMC", kind: "entity" },
  { id: "ent-boc", label: "Bank of Canada", kind: "entity" },
  { id: "mkt-nvda", label: "NVDA", kind: "market" },
  { id: "mkt-sofr", label: "SOFR", kind: "market" },
  { id: "mkt-brent", label: "Brent", kind: "market" },
]

export const graphEdges: GraphEdge[] = events.flatMap((event, index) =>
  event.relatedEvents.map((target, inner) => ({
    id: `e-${index}-${inner}`,
    source: event.id,
    target,
    relation: "related",
  })),
)
