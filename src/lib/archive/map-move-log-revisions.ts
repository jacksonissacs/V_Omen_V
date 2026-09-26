import type { StoredMoveLogRevision } from "@/lib/domain/historical-reconstruction"
import type { MoveLogRevisionRecord } from "@/lib/db/event-reader"
import type { AionEvent } from "@/types/event"

export function moveLogRevisionsFromEvent(event: AionEvent | undefined): StoredMoveLogRevision[] {
  if (!event?.moveLog) return []
  return [
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
}

export function mapPgMoveLogRevision(record: MoveLogRevisionRecord): StoredMoveLogRevision {
  return {
    moveLogId: record.moveLogId,
    version: record.version,
    publishedAt: record.publishedAt,
    author: record.author,
    whatChanged: record.whatChanged,
    likelyCause: record.likelyCause,
    explainedPct: record.explainedPct,
    unexplainedFactors: record.unexplainedFactors,
    evidenceIds: record.evidenceIds,
    correctionNote: record.correctionNote,
  }
}
