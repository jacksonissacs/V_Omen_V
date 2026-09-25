import "server-only"

import type {
  EventFilter,
  IntelligenceItem,
  RelationshipGraph,
  SearchHit,
} from "@/lib/domain/types"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"
import type { AionEvent } from "@/types/event"

/**
 * The single read boundary for the core workspace. Every method is async so a
 * persistent adapter can replace the in-process mock without touching callers.
 * Only server components, route handlers and tests may import this module.
 */
export interface IntelligenceRepository {
  /** Where the data comes from. `demo` data must never be presented as sourced. */
  readonly provenance: "demo" | "sourced"
  listEvents(filter?: EventFilter): Promise<AionEvent[]>
  getEvent(id: string): Promise<AionEvent | undefined>
  /** Events linked from `id`, in the order the event lists them. Unknown ids yield `[]`. */
  getRelatedEvents(id: string): Promise<AionEvent[]>
  /** The unexplained-move event highlighted at the foot of Pulse, if any. */
  getFeaturedAnomaly(): Promise<AionEvent | undefined>
  /** Event ids the workspace follows when it first loads. */
  listFollowedEventIds(): Promise<string[]>
  listFeed(filter?: EventFilter): Promise<IntelligenceItem[]>
  getGraph(): Promise<RelationshipGraph>
  search(query: string): Promise<SearchHit[]>
}

let instance: IntelligenceRepository | undefined

export function getRepository(): IntelligenceRepository {
  instance ??= new MockIntelligenceRepository()
  return instance
}

export function __resetRepositoryForTests(
  next?: IntelligenceRepository,
): void {
  instance = next
}
