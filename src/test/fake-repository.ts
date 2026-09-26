import { buildEvent, type EventDraft } from "@/data/build-event"
import type { IntelligenceRepository } from "@/lib/data/repository"
import type { AionEvent } from "@/types/event"

export function testEvent(overrides: Partial<EventDraft> & Pick<EventDraft, "id" | "title">): AionEvent {
  const probability = overrides.probability ?? 50
  const previousProbability = overrides.previousProbability ?? 40
  const timestamp = overrides.timestamp ?? "2026-09-01T12:00:00.000Z"
  return buildEvent({
    category: "Economics",
    probability,
    previousProbability,
    timestamp,
    displayTime: "08:00 EDT",
    summary: `${overrides.title} summary`,
    question: `Will ${overrides.title}?`,
    whatChanged: "Test move",
    likelyCause: "Test catalyst",
    unexplainedFactors: ["Test residual"],
    duration: "1 hr",
    catalyst: "Test catalyst",
    catalystTime: "08:00:00",
    explained: 50,
    region: "Testland",
    tags: [],
    entities: [],
    evidence: [],
    expectationHistory: [
      { at: "2026-08-01T12:00:00.000Z", probability: previousProbability },
      { at: timestamp, probability },
    ],
    ...overrides,
  })
}

/** A repository over caller-supplied events, so tests prove screens read the port, not fixtures. */
export function fakeRepository(
  events: AionEvent[],
  options: { followed?: string[]; anomalyId?: string; storage?: IntelligenceRepository["storage"] } = {},
): IntelligenceRepository {
  const byId = new Map(events.map((event) => [event.id, event]))
  return {
    storage: options.storage ?? "demo",
    listEvents: async () => events.slice(),
    getEvent: async (id) => byId.get(id),
    getRelatedEvents: async (id) =>
      (byId.get(id)?.relatedEvents ?? [])
        .map((relatedId) => byId.get(relatedId))
        .filter((event): event is AionEvent => event !== undefined),
    getFeaturedAnomaly: async () => (options.anomalyId ? byId.get(options.anomalyId) : undefined),
    listFollowedEventIds: async () => options.followed ?? [],
    listFeed: async () => [],
    getGraph: async () => ({ nodes: [], edges: [] }),
    search: async () => [],
  }
}

export function failingRepository(
  message = "store offline",
  storage: IntelligenceRepository["storage"] = "demo",
): IntelligenceRepository {
  const fail = async (): Promise<never> => {
    throw new Error(message)
  }
  return {
    storage,
    listEvents: fail,
    getEvent: fail,
    getRelatedEvents: fail,
    getFeaturedAnomaly: fail,
    listFollowedEventIds: fail,
    listFeed: fail,
    getGraph: fail,
    search: fail,
  }
}
