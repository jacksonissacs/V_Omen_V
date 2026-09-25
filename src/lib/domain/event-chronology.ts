import { probabilityDelta } from "@/lib/domain/scoring"
import type { AionEvent, ProbabilitySeries } from "@/types/event"

export type ChronologyKind = "observation" | "source_published" | "source_observed" | "move_log"

export interface ChronologyEntry {
  at: string
  kind: ChronologyKind
  text: string
  /** Percentage points against the previous observation in the same series. */
  deltaPp?: number
}

const KIND_ORDER: Record<ChronologyKind, number> = {
  source_published: 0,
  source_observed: 1,
  observation: 2,
  move_log: 3,
}

/**
 * Every timestamped record on the event, oldest first: the headline series'
 * observations, evidence publication and first-observation times, and the
 * latest move log revision. Nothing is interpolated.
 */
export function recordedChronology(
  event: Pick<AionEvent, "evidence" | "moveLog">,
  series: ProbabilitySeries | undefined,
): ChronologyEntry[] {
  const entries: ChronologyEntry[] = []
  series?.observations.forEach((point, index, all) => {
    const prior = all[index - 1]
    entries.push({
      at: point.observedAt,
      kind: "observation",
      text: `Probability recorded at ${point.probability.toFixed(1)}%${point.note ? ` · ${point.note}` : ""}`,
      ...(prior ? { deltaPp: probabilityDelta(point.probability, prior.probability) } : {}),
    })
  })
  for (const source of event.evidence) {
    if (source.publishedAt) {
      entries.push({ at: source.publishedAt, kind: "source_published", text: `Source published: ${source.name}` })
    }
    if (source.firstObservedAt) {
      entries.push({ at: source.firstObservedAt, kind: "source_observed", text: `OMEN first observed: ${source.name}` })
    }
  }
  if (event.moveLog) {
    entries.push({
      at: event.moveLog.publishedAt,
      kind: "move_log",
      text:
        event.moveLog.version > 1
          ? `Move log ${event.moveLog.id} corrected (v${event.moveLog.version})`
          : `Move log ${event.moveLog.id} published`,
    })
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}
