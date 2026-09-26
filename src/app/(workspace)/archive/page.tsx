import type { Metadata } from "next"

import { HistoricalUnavailable } from "@/components/history/historical-unavailable"
import { ArchiveScreen } from "@/components/screens/archive-screen"
import { ARBITRARY_TIME_UNSUPPORTED } from "@/lib/domain/historical-reconstruction"
import { requestedHistoricalView } from "@/lib/history/historical-request"

export const metadata: Metadata = { title: "Archive" }

export default async function ArchivePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const historical = requestedHistoricalView(searchParams ? await searchParams : undefined)
  if (historical) {
    const detail =
      historical.kind === "checkpoint"
        ? undefined
        : ARBITRARY_TIME_UNSUPPORTED
    return <HistoricalUnavailable request={historical} detail={detail} />
  }
  return <ArchiveScreen />
}
