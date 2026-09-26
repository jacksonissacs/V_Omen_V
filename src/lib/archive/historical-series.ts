import { groupIntoSeries } from "@/lib/domain/probability-history"
import type { HistoricalObservation } from "@/lib/domain/historical-reconstruction"
import type { ProbabilitySeries } from "@/types/event"

/** Groups checkpoint member observations into headline-ordered probability series. */
export function seriesFromHistoricalObservations(
  observations: readonly HistoricalObservation[],
): ProbabilitySeries[] {
  return groupIntoSeries(
    observations.map((item) => ({
      sourceKind: item.sourceKind,
      sourceName: item.sourceName,
      probabilityType: item.probabilityType,
      provenance: item.provenance,
      observedAt: item.observedAt,
      capturedAt: item.capturedAt,
      probability: item.probabilityPct,
      ...(item.note ? { note: item.note } : {}),
    })),
  )
}
