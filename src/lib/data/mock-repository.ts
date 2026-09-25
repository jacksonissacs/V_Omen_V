import "server-only"

import { events, getEvent, getRelatedEvents } from "@/data/events"
import {
  defaultFollowedEventIds,
  featuredAnomalyEventId,
  feed,
  graphEdges,
  graphNodes,
} from "@/lib/data/mock-catalog"
import type { IntelligenceRepository } from "@/lib/data/repository"
import { domainCategories } from "@/lib/domain/categories"
import { probabilityDelta } from "@/lib/domain/scoring"
import type { Domain, EventFilter, RelationshipGraph, SearchHit } from "@/lib/domain/types"
import { searchCatalog } from "@/lib/search/command-index"
import type { AionEvent } from "@/types/event"

function matchesFilter(event: AionEvent, filter?: EventFilter): boolean {
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

/** In-process adapter over the seeded demo book. Development and tests only. */
export class MockIntelligenceRepository implements IntelligenceRepository {
  readonly provenance = "demo" as const

  async listEvents(filter?: EventFilter): Promise<AionEvent[]> {
    const matching = events.filter((event) => matchesFilter(event, filter))
    if (filter?.order === "catalog") return matching
    return matching.sort((a, b) => {
      const aMove = Math.abs(probabilityDelta(a.probability, a.previousProbability))
      const bMove = Math.abs(probabilityDelta(b.probability, b.previousProbability))
      return bMove - aMove || b.timestamp.localeCompare(a.timestamp)
    })
  }

  async getEvent(id: string): Promise<AionEvent | undefined> {
    return getEvent(id)
  }

  async getRelatedEvents(id: string): Promise<AionEvent[]> {
    const event = getEvent(id)
    return event ? getRelatedEvents(event) : []
  }

  async getFeaturedAnomaly(): Promise<AionEvent | undefined> {
    return getEvent(featuredAnomalyEventId)
  }

  async listFollowedEventIds(): Promise<string[]> {
    return [...defaultFollowedEventIds]
  }

  async listFeed(filter?: EventFilter) {
    const allowed = new Set((await this.listEvents(filter)).map((event) => event.id))
    return feed
      .filter((item) => allowed.has(item.eventId))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  }

  async getGraph(): Promise<RelationshipGraph> {
    const known = new Set(events.map((event) => event.id))
    return {
      nodes: graphNodes,
      edges: graphEdges.filter(
        (edge) => known.has(edge.source) && known.has(edge.target),
      ),
    }
  }

  async search(query: string): Promise<SearchHit[]> {
    return searchCatalog(query, events)
  }
}

export function isDomain(value: string | undefined | null): value is Domain {
  return (
    value === "technology" ||
    value === "finance" ||
    value === "geopolitics" ||
    value === "supply_chain"
  )
}
