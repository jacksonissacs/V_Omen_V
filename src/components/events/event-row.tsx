"use client"

import Link from "next/link"

import { ChangeIndicator } from "@/components/events/change-indicator"
import { FollowEventButton } from "@/components/events/follow-event-button"
import { ProbabilityBadge } from "@/components/events/probability-badge"
import { BASIS_LABEL, latestChange, probabilityBasis } from "@/lib/domain/probability-history"
import { formatDateTime } from "@/lib/format"
import type { AionEvent } from "@/types/event"

export function EventRow({ event }: { event: AionEvent }) {
  const headline = event.probabilitySeries[0]
  const latest = headline?.observations.at(-1)
  const compared = latestChange(headline)

  return (
    <div className="aion-event-row">
      <Link className="aion-event-row-main" href={`/events/${event.id}`}>
        <span>
          <span className="aion-watch-name">{event.title}</span>
          <span className="aion-watch-sub">
            {event.category} · Observed {latest ? formatDateTime(latest.observedAt) : "—"} · {event.status}
          </span>
        </span>
        <span>{latest ? <ProbabilityBadge value={latest.probability} size="sm" /> : <span>Not recorded</span>}</span>
        <span>
          <ChangeIndicator change={compared ? compared.deltaPp : null} />
        </span>
        <span className="aion-event-row-meta">
          <span>{headline ? `${BASIS_LABEL[probabilityBasis(headline)]} · ${headline.sourceName}` : "No series"}</span>
          <span className="aion-mono">{latest?.capturedAt ? `Captured ${formatDateTime(latest.capturedAt)}` : "Capture time not recorded"}</span>
        </span>
      </Link>
      <FollowEventButton eventId={event.id} eventTitle={event.title} />
    </div>
  )
}
