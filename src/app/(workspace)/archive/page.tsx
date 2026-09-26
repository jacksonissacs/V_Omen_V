import type { Metadata } from "next"
import { Suspense } from "react"

import { ArchiveView } from "@/components/archive/archive-view"
import { HistoricalUnavailable } from "@/components/history/historical-unavailable"
import { loadArchivePageData } from "@/lib/archive/load-archive-page"
import { firstQueryValue, requestedHistoricalView } from "@/lib/history/historical-request"

export const metadata: Metadata = { title: "Archive" }

async function ArchivePageContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const historical = requestedHistoricalView(searchParams, { route: "archive" })
  if (historical && (historical.kind === "at" || historical.kind === "cutoff")) {
    return <HistoricalUnavailable request={historical} />
  }

  const event = firstQueryValue(searchParams.event)
  const checkpoint = firstQueryValue(searchParams.checkpoint)
  const loaded = await loadArchivePageData({ event, checkpoint })

  return (
    <ArchiveView
      events={loaded.events}
      storage={loaded.storage}
      provenance={loaded.provenance}
      initialEventId={loaded.initialEventId}
      initialCheckpoint={loaded.initialCheckpoint}
      initialReconstruction={loaded.initialReconstruction}
      initialCheckpoints={loaded.initialCheckpoints}
      initialStatus={loaded.initialStatus}
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
