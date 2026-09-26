import type { Metadata } from "next"
import { Suspense } from "react"

import { ArchiveView, type ArchiveViewProps } from "@/components/archive/archive-view"
import { loadArchiveReconstruction } from "@/lib/archive/load-archive-reconstruction"
import { getRepository, summarizeProvenance } from "@/lib/data/repository"

export const metadata: Metadata = { title: "Archive" }

async function ArchivePageContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const repository = getRepository()
  const eventParam = typeof searchParams.event === "string" ? searchParams.event : undefined
  const cutoffParam = typeof searchParams.cutoff === "string" ? searchParams.cutoff : undefined
  const checkpointParam = typeof searchParams.checkpoint === "string" ? searchParams.checkpoint : undefined

  let events: ArchiveViewProps["events"] = []
  let storage = repository.storage
  let provenance: ArchiveViewProps["provenance"] = "none"

  try {
    const listed = await repository.listEvents({ order: "catalog" })
    events = listed.map((event) => ({ id: event.id, title: event.title }))
    provenance = summarizeProvenance(listed)
  } catch {
    storage = repository.storage
  }

  const eventId = eventParam ?? events[0]?.id
  let initialStatus: ArchiveViewProps["initialStatus"] = cutoffParam ? "ok" : "present"
  let initialReconstruction = null

  if (eventId && cutoffParam) {
    const loaded = await loadArchiveReconstruction(eventId, cutoffParam, checkpointParam)
    if (loaded.status === "ok") {
      initialReconstruction = loaded.reconstruction
      initialStatus = "ok"
    } else {
      initialStatus = loaded.status
    }
  }

  return (
    <ArchiveView
      events={events}
      storage={storage}
      provenance={provenance}
      initialEventId={eventId}
      initialCutoff={cutoffParam}
      initialCheckpoint={checkpointParam}
      initialReconstruction={initialReconstruction}
      initialStatus={initialStatus}
    />
  )
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <Suspense fallback={<section className="aion-screen" aria-busy="true" data-testid="archive-loading" />}>
      <ArchivePageContent searchParams={params} />
    </Suspense>
  )
}
