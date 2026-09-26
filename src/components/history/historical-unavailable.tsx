import Link from "next/link"

import {
  historicalViewUnavailableMessage,
  type HistoricalRequest,
} from "@/lib/history/historical-request"

export function HistoricalUnavailable({
  eventId,
  request,
}: {
  eventId?: string
  request: HistoricalRequest
}) {
  return (
    <section className="aion-screen" data-testid="historical-unavailable">
      <p className="aion-label">422</p>
      <h1>Historical view unavailable</h1>
      <p>{historicalViewUnavailableMessage(request)}</p>
      <p className="aion-note">
        This URL asked for a recorded checkpoint or a past instant. This build has no verified history
        checkpoints, so the current event text is not shown.
      </p>
      {eventId ? (
        <Link className="aion-button" data-primary="true" href={`/events/${eventId}`}>
          Return to present
        </Link>
      ) : (
        <Link className="aion-button" data-primary="true" href="/pulse">
          Return to Pulse
        </Link>
      )}
    </section>
  )
}
