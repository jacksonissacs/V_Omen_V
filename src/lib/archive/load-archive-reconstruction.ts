import "server-only"

import { deriveArchiveInputFromEvent } from "@/lib/archive/derive-archive-input"
import { getRepository } from "@/lib/data/repository"
import { reconstructAt, type HistoricalReconstruction } from "@/lib/domain/historical-reconstruction"

export type ArchiveLoadResult =
  | { status: "ok"; reconstruction: HistoricalReconstruction; provenance: "demo" | "sourced" }
  | { status: "not_found" }
  | { status: "no_history"; eventId: string }
  | { status: "unavailable" }

export async function loadArchiveReconstruction(
  eventId: string,
  cutoff: string,
  checkpointId?: string,
): Promise<ArchiveLoadResult> {
  const repository = getRepository()
  try {
    const [event, moveLogRevisions] = await Promise.all([
      repository.getEvent(eventId),
      repository.listMoveLogRevisions(eventId),
    ])
    if (!event) return { status: "not_found" }

    const input = {
      ...deriveArchiveInputFromEvent(event),
      moveLogRevisions: moveLogRevisions.length ? moveLogRevisions : deriveArchiveInputFromEvent(event).moveLogRevisions,
      coverage: {
        usesDemoAvailabilityProxy: repository.storage === "demo",
      },
    }

    const reconstruction = reconstructAt(input, cutoff, checkpointId)
    if (!reconstruction) return { status: "no_history", eventId }
    return { status: "ok", reconstruction, provenance: event.provenance }
  } catch {
    return { status: "unavailable" }
  }
}
