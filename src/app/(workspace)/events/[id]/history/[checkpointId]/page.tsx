import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ShareViewControl } from "@/components/common/share-view-control"
import { HistoricalReconstructionPanel } from "@/components/history/historical-reconstruction-panel"
import { HistoricalUnavailable } from "@/components/history/historical-unavailable"
import { getRepository } from "@/lib/data/repository"
import {
  ARBITRARY_TIME_UNSUPPORTED,
  invalidCheckpointId,
  type ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"
import { arbitraryTimeQuery } from "@/lib/history/historical-request"

type CheckpointPageProps = {
  params: Promise<{ id: string; checkpointId: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params, searchParams }: CheckpointPageProps): Promise<Metadata> {
  const { checkpointId } = await params
  const query = searchParams ? await searchParams : undefined
  if (arbitraryTimeQuery(query)) return { title: "Historical view unavailable" }
  return { title: `Checkpoint ${checkpointId}` }
}

export default async function EventCheckpointPage({ params, searchParams }: CheckpointPageProps) {
  const { id, checkpointId } = await params
  const query = searchParams ? await searchParams : undefined
  const invalid = invalidCheckpointId(checkpointId)
  if (invalid) {
    return <HistoricalUnavailable eventId={id} request={{ kind: "checkpoint", value: checkpointId }} share />
  }
  const arbitrary = arbitraryTimeQuery(query)
  if (arbitrary) {
    return <HistoricalUnavailable eventId={id} request={arbitrary} share />
  }

  let replay: ReconstructionOutcome
  try {
    replay = await getRepository().reconstructEvent(id, checkpointId)
  } catch {
    return (
      <section className="aion-screen" data-testid="historical-unavailable">
        <p className="aion-label">503</p>
        <h1>Historical view unavailable</h1>
        <p>Event storage is unavailable.</p>
        <CheckpointActions eventId={id} />
      </section>
    )
  }

  switch (replay.outcome) {
    case "reconstruction":
      return (
        <section className="aion-screen">
          <p className="aion-label">Historical checkpoint</p>
          <h1>Stored reconstruction</h1>
          <p className="aion-note" style={{ border: 0, margin: "0 0 16px", padding: 0 }}>
            {ARBITRARY_TIME_UNSUPPORTED}
          </p>
          <HistoricalReconstructionPanel reconstruction={replay.reconstruction} />
          <CheckpointActions eventId={id} />
        </section>
      )
    case "pre_coverage":
      return (
        <section className="aion-screen">
          <p className="aion-label">409 · Pre-coverage checkpoint</p>
          <h1>Semantic history not yet recorded</h1>
          <HistoricalReconstructionPanel reconstruction={replay.reconstruction} preCoverage />
          <CheckpointActions eventId={id} />
        </section>
      )
    case "unknown_event":
      notFound()
    case "missing_checkpoint":
    case "verification_failed":
    case "unsupported_history":
    case "invalid_request":
      return (
        <HistoricalUnavailable
          eventId={id}
          request={{ kind: "checkpoint", value: checkpointId }}
          detail={"message" in replay ? replay.message : undefined}
          share
        />
      )
  }
}

function CheckpointActions({ eventId }: { eventId: string }) {
  return (
    <div className="aion-event-actions" data-checkpoint="true">
      <ShareViewControl />
      <Link className="aion-button" data-primary="true" href={`/events/${eventId}`}>
        Return to present
      </Link>
    </div>
  )
}
