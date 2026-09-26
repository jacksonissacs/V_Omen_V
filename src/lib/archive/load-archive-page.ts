import "server-only"

import type { ArchiveViewProps } from "@/components/archive/archive-view"
import { getRepository, summarizeProvenance } from "@/lib/data/repository"
import {
  checkpointSummaryFromReconstruction,
  mergeCheckpointSummaries,
  missingNeighborCursors,
  nextDiscoveryHasMore,
  type HistoricalReconstruction,
  type HistoryCheckpointSummary,
  type ReconstructionOutcome,
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
  initialHasMore: boolean
  initialStatus: ArchiveLoadStatus
  initialOutcome?: ReconstructionOutcome["outcome"]
}

function activeSummary(replay: ReconstructionOutcome): HistoryCheckpointSummary | null {
  if (replay.outcome !== "reconstruction" && replay.outcome !== "pre_coverage") return null
  return checkpointSummaryFromReconstruction(replay.reconstruction)
}

/** Loads the pages that contain the checkpoints beside `active`, and keeps the first page. */
async function withNeighborCheckpoints(
  listed: HistoryCheckpointSummary[],
  listedHasMore: boolean,
  active: HistoryCheckpointSummary | null,
  listPage: (
    beforeSequence?: number,
  ) => Promise<{ checkpoints: HistoryCheckpointSummary[]; hasMore: boolean } | null>,
): Promise<{ checkpoints: HistoryCheckpointSummary[]; hasMore: boolean }> {
  if (!active) {
    return { checkpoints: listed, hasMore: nextDiscoveryHasMore(listed, listedHasMore) }
  }
  let checkpoints = mergeCheckpointSummaries(listed, [active])
  let hasMore = nextDiscoveryHasMore(checkpoints, listedHasMore)
  const newerBefore = missingNeighborCursors(checkpoints, active).newerBeforeSequence
  if (newerBefore !== undefined) {
    const newer = await listPage(newerBefore)
    if (newer) {
      checkpoints = mergeCheckpointSummaries(checkpoints, newer.checkpoints)
      hasMore = nextDiscoveryHasMore(checkpoints, hasMore)
    }
  }
  const olderBefore = missingNeighborCursors(checkpoints, active).olderBeforeSequence
  if (olderBefore !== undefined) {
    const older = await listPage(olderBefore)
    if (older) {
      checkpoints = mergeCheckpointSummaries(checkpoints, older.checkpoints)
      hasMore = nextDiscoveryHasMore(checkpoints, older.hasMore, older)
    }
  }
  return { checkpoints, hasMore: nextDiscoveryHasMore(checkpoints, hasMore) }
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
      initialHasMore: false,
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
      initialHasMore: false,
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
      initialHasMore: false,
      initialStatus: "present",
    }
  }

  let listedCheckpoints: HistoryCheckpointSummary[] = []
  let listedHasMore = false
  let listFailed = false
  try {
    const listed = await repository.listHistoryCheckpoints(eventId, { limit: 20 })
    if (listed.outcome === "checkpoints") {
      listedCheckpoints = listed.checkpoints
      listedHasMore = listed.hasMore
    }
  } catch {
    listFailed = true
  }

  let replay: ReconstructionOutcome
  try {
    replay = await repository.reconstructEvent(eventId, checkpointId)
  } catch {
    return {
      events,
      storage: repository.storage,
      provenance,
      initialEventId: eventId,
      initialCheckpoint: checkpointId,
      initialReconstruction: null,
      initialCheckpoints: listFailed ? [] : listedCheckpoints,
      initialHasMore: listFailed ? false : nextDiscoveryHasMore(listedCheckpoints, listedHasMore),
      initialStatus: "unavailable",
    }
  }

  const discovered = await withNeighborCheckpoints(
    listedCheckpoints,
    listedHasMore,
    activeSummary(replay),
    async (beforeSequence) => {
      try {
        const page = await repository.listHistoryCheckpoints(eventId, { limit: 20, beforeSequence })
        if (page.outcome !== "checkpoints") return null
        return { checkpoints: page.checkpoints, hasMore: page.hasMore }
      } catch {
        return null
      }
    },
  )
  return mapReplayOutcome({
    events,
    storage: repository.storage,
    provenance,
    eventId,
    checkpointId,
    checkpoints: discovered.checkpoints,
    hasMore: discovered.hasMore,
    replay,
  })
}

function mapReplayOutcome(input: {
  events: ArchivePageData["events"]
  storage: ArchivePageData["storage"]
  provenance: ArchivePageData["provenance"]
  eventId: string
  checkpointId: string
  checkpoints: HistoryCheckpointSummary[]
  hasMore: boolean
  replay: ReconstructionOutcome
}): ArchivePageData {
  const base = {
    events: input.events,
    storage: input.storage,
    provenance: input.provenance,
    initialEventId: input.eventId,
    initialCheckpoint: input.checkpointId,
    initialCheckpoints: input.checkpoints,
    initialHasMore: input.hasMore,
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
