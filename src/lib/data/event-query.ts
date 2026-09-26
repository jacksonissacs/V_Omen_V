import { CATEGORY_DOMAIN, domainCategories } from "@/lib/domain/categories"
import { probabilityDelta } from "@/lib/domain/scoring"
import type {
  EventFilter,
  GraphEdge,
  GraphNode,
  IntelligenceItem,
  RelationshipGraph,
} from "@/lib/domain/types"
import type { AionEvent } from "@/types/event"

export function matchesFilter(event: AionEvent, filter?: EventFilter): boolean {
  if (filter?.domain && filter.domain !== "all") {
    if (!domainCategories(filter.domain).includes(event.category)) {
      return false
    }
  }
  if (filter?.query) {
    const q = filter.query.trim().toLowerCase()
    if (!q) return true
    const haystack = [
      event.title,
      event.question,
      event.summary,
      event.region,
      event.category,
      ...event.tags,
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  }
  return true
}

/** Filters, then orders by largest absolute move unless `filter.order` is `catalog`. */
export function applyEventFilter(events: readonly AionEvent[], filter?: EventFilter): AionEvent[] {
  const matching = events.filter((event) => matchesFilter(event, filter))
  if (filter?.order === "catalog") return matching
  return matching.sort((a, b) => {
    const aMove = Math.abs(probabilityDelta(a.probability, a.previousProbability))
    const bMove = Math.abs(probabilityDelta(b.probability, b.previousProbability))
    return bMove - aMove || b.timestamp.localeCompare(a.timestamp)
  })
}

export function buildFeed(events: readonly AionEvent[]): IntelligenceItem[] {
  return events
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
}

export function eventGraphNodes(events: readonly AionEvent[]): GraphNode[] {
  return events.map((event) => ({
    id: event.id,
    label: event.title.slice(0, 22),
    kind: "event" as const,
    domain: CATEGORY_DOMAIN[event.category],
  }))
}

/** Edges between events in `events`; links to events outside the set are dropped. */
export function eventGraph(events: readonly AionEvent[], extraNodes: GraphNode[] = []): RelationshipGraph {
  const known = new Set(events.map((event) => event.id))
  const edges: GraphEdge[] = events.flatMap((event, index) =>
    event.relatedEvents.map((target, inner) => ({
      id: `e-${index}-${inner}`,
      source: event.id,
      target,
      relation: "related",
    })),
  )
  return {
    nodes: [...eventGraphNodes(events), ...extraNodes],
    edges: edges.filter((edge) => known.has(edge.source) && known.has(edge.target)),
  }
}
