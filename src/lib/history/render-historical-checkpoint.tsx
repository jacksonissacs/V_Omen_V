import { notFound } from "next/navigation"
import type { ReactElement } from "react"

import { HistoricalCheckpointView } from "@/components/history/historical-checkpoint-view"
import { HistoricalUnavailable } from "@/components/history/historical-unavailable"
import { getRepository } from "@/lib/data/repository"
import { ARBITRARY_TIME_UNSUPPORTED } from "@/lib/domain/historical-reconstruction"
import type { HistoricalRequest } from "@/lib/history/historical-request"

export async function renderHistoricalCheckpointPage(
  eventId: string,
  checkpointId: string,
): Promise<ReactElement> {
  const repository = getRepository()
  const event = await repository.getEvent(eventId)
  if (!event) notFound()

  const result = await repository.reconstructEvent(eventId, checkpointId)
  switch (result.outcome) {
    case "reconstruction":
    case "pre_coverage":
      return <HistoricalCheckpointView reconstruction={result.reconstruction} outcome={result.outcome} />
    case "invalid_request":
    case "unsupported_history":
      return (
        <HistoricalUnavailable
          eventId={eventId}
          request={{ kind: "checkpoint", value: checkpointId }}
          detail={result.message}
        />
      )
    case "unknown_event":
      notFound()
  }
}

export function renderArbitraryHistoricalRequest(eventId: string, request: HistoricalRequest): ReactElement {
  const detail =
    request.kind === "checkpoint"
      ? undefined
      : ARBITRARY_TIME_UNSUPPORTED
  return <HistoricalUnavailable eventId={eventId} request={request} detail={detail} />
}
