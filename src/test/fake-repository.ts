import { buildEvent, type EventDraft } from "@/data/build-event"
import type { IntelligenceRepository } from "@/lib/data/repository"
import {
  DEMO_RECONSTRUCTION_UNSUPPORTED,
  validateReconstructionRequest,
  type ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"
import type { AionEvent } from "@/types/event"

export function testEvent(overrides: Partial<EventDraft> & Pick<EventDraft, "id" | "title">): AionEvent {
  return buildEvent({
    category: "Economics",
    probability: 50,
    previousProbability: 40,
    timestamp: "2026-09-01T12:00:00.000Z",
    displayTime: "08:00 EDT",
    summary: `${overrides.title} summary`,
    question: `Will ${overrides.title}?`,
    whatChanged: "Test move",
    likelyCause: "Test catalyst",
    unexplainedFactors: ["Test residual"],
    sigma: 1,
    duration: "1 hr",
    catalyst: "Test catalyst",
    catalystTime: "08:00:00",
    explained: 50,
    region: "Testland",
    tags: [],
    entities: [],
    evidence: [],
    expectationHistory: [{ at: "2026-09-01T12:00:00.000Z", probability: 50 }],
    ...overrides,
  })
}

/** A repository over caller-supplied events, so tests prove screens read the port, not fixtures. */
export function fakeRepository(
  events: AionEvent[],
  options: {
    followed?: string[]
    anomalyId?: string
    storage?: IntelligenceRepository["storage"]
    reconstructEvent?: (eventId: string, checkpointId: string) => Promise<ReconstructionOutcome>
  } = {},
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
    reconstructEvent:
      options.reconstructEvent ??
      (async (eventId, checkpointId) => {
        const invalid = validateReconstructionRequest(eventId, checkpointId)
        if (invalid) return invalid
        if (!byId.has(eventId)) return { outcome: "unknown_event" }
        return { outcome: "unsupported_history", message: DEMO_RECONSTRUCTION_UNSUPPORTED }
      }),
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
    reconstructEvent: fail,
  }
}
