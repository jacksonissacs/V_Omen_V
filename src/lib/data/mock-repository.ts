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
import { applyEventFilter } from "@/lib/data/event-query"
import type { EventFilter, RelationshipGraph, SearchHit } from "@/lib/domain/types"
import { searchCatalog } from "@/lib/search/command-index"
import type { AionEvent } from "@/types/event"

/** In-process adapter over the seeded demo book. Development and tests only. */
export class MockIntelligenceRepository implements IntelligenceRepository {
  readonly storage = "demo" as const

  async listEvents(filter?: EventFilter): Promise<AionEvent[]> {
    return applyEventFilter(events, filter)
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
