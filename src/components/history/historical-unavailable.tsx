import Link from "next/link"

import { ShareViewControl } from "@/components/common/share-view-control"
import {
  historicalViewUnavailableMessage,
  type HistoricalRequest,
} from "@/lib/history/historical-request"

export function HistoricalUnavailable({
  eventId,
  request,
  detail,
  share = false,
}: {
  eventId?: string
  request: HistoricalRequest
  detail?: string
  /** Checkpoint routes can copy the URL that produced this refusal. */
  share?: boolean
}) {
  const returnHref = eventId ? `/events/${eventId}` : "/pulse"
  const returnLabel = eventId ? "Return to present" : "Return to Pulse"
  const returnLink = (
    <Link className="aion-button" data-primary="true" href={returnHref}>
      {returnLabel}
    </Link>
  )

  return (
    <section className="aion-screen" data-testid="historical-unavailable">
      <p className="aion-label">422</p>
      <h1>Historical view unavailable</h1>
      <p>{detail ?? historicalViewUnavailableMessage(request)}</p>
      <p className="aion-note">
        This URL asked for a recorded checkpoint or a past instant. The current event text is not shown.
      </p>
      {share ? (
        <div className="aion-event-actions" data-checkpoint="true">
          <ShareViewControl />
          {returnLink}
        </div>
      ) : (
        returnLink
      )}
    </section>
  )
}
