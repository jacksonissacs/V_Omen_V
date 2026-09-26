import "server-only"

import type { ArchiveViewProps } from "@/components/archive/archive-view"
import { getRepository, summarizeProvenance } from "@/lib/data/repository"
import type {
  HistoricalReconstruction,
  HistoryCheckpointSummary,
  ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"

export type ArchiveLoadStatus = ArchiveViewProps["initialStatus"]

export interface ArchivePageData {
  events: ArchiveViewProps["events"]
  storage: ArchiveViewProps["storage"]
  provenance: ArchiveViewProps["provenance"]
  initialEventId?: string
  initialCheckpoint?: string
  initialReconstruction: HistoricalReconstruction | null
  initialCheckpoints: HistoryCheckpointSummary[]
  initialStatus: ArchiveLoadStatus
  initialOutcome?: ReconstructionOutcome["outcome"]
}

export async function loadArchivePageData(searchParams: {
  event?: string
  checkpoint?: string
}): Promise<ArchivePageData> {
  const repository = getRepository()
  let events: ArchivePageData["events"] = []
  let provenance: ArchivePageData["provenance"] = "none"

  try {
    const listed = await repository.listEvents({ order: "catalog" })
    events = listed.map((event) => ({ id: event.id, title: event.title }))
    provenance = summarizeProvenance(listed)
  } catch {
    return {
      events: [],
      storage: repository.storage,
      provenance: "none",
      initialReconstruction: null,
      initialCheckpoints: [],
      initialStatus: "unavailable",
    }
  }

  const eventId = searchParams.event ?? events[0]?.id
  const checkpointId = searchParams.checkpoint

  if (!eventId) {
    return {
      events,
      storage: repository.storage,
      provenance,
      initialReconstruction: null,
      initialCheckpoints: [],
      initialStatus: "present",
    }
  }

  if (!checkpointId) {
    return {
      events,
      storage: repository.storage,
      provenance,
      initialEventId: eventId,
      initialReconstruction: null,
      initialCheckpoints: [],
      initialStatus: "present",
    }
  }

  try {
    const [listed, replay] = await Promise.all([
      repository.listHistoryCheckpoints(eventId, { limit: 20 }),
      repository.reconstructEvent(eventId, checkpointId),
    ])

    const checkpoints = listed.outcome === "checkpoints" ? listed.checkpoints : []
    return mapReplayOutcome({
      events,
      storage: repository.storage,
      provenance,
      eventId,
      checkpointId,
      checkpoints,
      replay,
    })
  } catch {
    return {
      events,
      storage: repository.storage,
      provenance,
      initialEventId: eventId,
      initialCheckpoint: checkpointId,
      initialReconstruction: null,
      initialCheckpoints: [],
      initialStatus: "unavailable",
    }
  }
}

function mapReplayOutcome(input: {
  events: ArchivePageData["events"]
  storage: ArchivePageData["storage"]
  provenance: ArchivePageData["provenance"]
  eventId: string
  checkpointId: string
  checkpoints: HistoryCheckpointSummary[]
  replay: ReconstructionOutcome
}): ArchivePageData {
  const base = {
    events: input.events,
    storage: input.storage,
    provenance: input.provenance,
    initialEventId: input.eventId,
    initialCheckpoint: input.checkpointId,
    initialCheckpoints: input.checkpoints,
  }

  switch (input.replay.outcome) {
    case "reconstruction":
      return {
        ...base,
        initialReconstruction: input.replay.reconstruction,
        initialStatus: "ok",
        initialOutcome: input.replay.outcome,
      }
    case "pre_coverage":
      return {
        ...base,
        initialReconstruction: input.replay.reconstruction,
        initialStatus: "pre_coverage",
        initialOutcome: input.replay.outcome,
      }
    case "unknown_event":
      return { ...base, initialReconstruction: null, initialStatus: "not_found", initialOutcome: input.replay.outcome }
    case "missing_checkpoint":
      return {
        ...base,
        initialReconstruction: null,
        initialStatus: "missing_checkpoint",
        initialOutcome: input.replay.outcome,
      }
    case "verification_failed":
      return {
        ...base,
        initialReconstruction: null,
        initialStatus: "verification_failed",
        initialOutcome: input.replay.outcome,
      }
    case "unsupported_history":
      return {
        ...base,
        initialReconstruction: null,
        initialStatus: "unsupported_history",
        initialOutcome: input.replay.outcome,
      }
    case "invalid_request":
      return {
        ...base,
        initialReconstruction: null,
        initialStatus: "invalid_request",
        initialOutcome: input.replay.outcome,
      }
  }
}
