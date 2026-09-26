import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

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
    return <HistoricalUnavailable eventId={id} request={{ kind: "checkpoint", value: checkpointId }} />
  }
  const arbitrary = arbitraryTimeQuery(query)
  if (arbitrary) {
    return <HistoricalUnavailable eventId={id} request={arbitrary} />
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
        <Link className="aion-button" data-primary="true" href={`/events/${id}`}>
          Return to present
        </Link>
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
          <Link className="aion-button" data-primary="true" href={`/events/${id}`} style={{ marginTop: 16 }}>
            Return to present
          </Link>
        </section>
      )
    case "pre_coverage":
      return (
        <section className="aion-screen">
          <p className="aion-label">409 · Pre-coverage checkpoint</p>
          <h1>Semantic history not yet recorded</h1>
          <HistoricalReconstructionPanel reconstruction={replay.reconstruction} preCoverage />
          <Link className="aion-button" data-primary="true" href={`/events/${id}`} style={{ marginTop: 16 }}>
            Return to present
          </Link>
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
        />
      )
  }
}
