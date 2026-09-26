import type { HistoricalReconstructionInput, StoredMoveLogRevision } from "@/lib/domain/historical-reconstruction"
import {
  evidenceAvailableAt,
  observationAvailableAt,
} from "@/lib/domain/historical-reconstruction"
import type { AionEvent } from "@/types/event"

/** Builds reconstruction input from a present-state event (demo book and latest projection reads). */
export function deriveArchiveInputFromEvent(event: AionEvent): HistoricalReconstructionInput {
  const moveLogRevisions: StoredMoveLogRevision[] = event.moveLog
    ? [
        {
          moveLogId: event.moveLog.id,
          version: event.moveLog.version,
          publishedAt: event.moveLog.publishedAt,
          author: event.moveLog.author,
          whatChanged: event.whatChanged,
          likelyCause: event.likelyCause,
          explainedPct: event.explained,
          unexplainedFactors: event.unexplainedFactors,
          evidenceIds: event.moveLog.evidenceIds,
          ...(event.moveLog.correctionNote ? { correctionNote: event.moveLog.correctionNote } : {}),
        },
      ]
    : []

  const firstAvailability = earliestAvailability(event)

  return {
    event,
    moveLogRevisions,
    eventRevisions: firstAvailability
      ? [
          {
            version: 1,
            title: event.title,
            question: event.question,
            status: event.status,
            summary: event.summary,
            resolutionCriteria: event.resolutionCriteria,
            recordAvailableAt: firstAvailability,
          },
        ]
      : [],
    coverage: { usesDemoAvailabilityProxy: event.provenance === "demo" },
  }
}

function earliestAvailability(event: AionEvent): string | undefined {
  const times: string[] = []
  for (const series of event.probabilitySeries) {
    for (const point of series.observations) {
      times.push(observationAvailableAt(point))
    }
  }
  for (const item of event.evidence) {
    const at = evidenceAvailableAt(item)
    if (at) times.push(at)
  }
  times.sort()
  return times[0]
}
