"use client"

import Link from "next/link"

import { FollowEventButton } from "@/components/events/follow-event-button"
import { ChangeIndicator } from "@/components/events/change-indicator"
import { ProbabilityBadge } from "@/components/events/probability-badge"
import { SourceBadge } from "@/components/events/source-badge"
import type { AionEvent } from "@/types/event"

export function EventRow({ event }: { event: AionEvent }) {
  return (
    <div className="aion-event-row">
      <Link className="aion-event-row-main" href={`/events/${event.id}`}>
        <span>
          <span className="aion-watch-name">{event.title}</span>
          <span className="aion-watch-sub">
            {event.category} · {event.displayTime} · {event.status}
          </span>
        </span>
        <span>
          <ProbabilityBadge value={event.probability} size="sm" />
        </span>
        <span>
          <ChangeIndicator change={event.change} />
        </span>
        <span className="aion-event-row-meta">
          <SourceBadge tier={event.sourceTier} />
        </span>
        <span className="aion-mono aion-event-row-meta">{event.sigma.toFixed(1)}σ</span>
      </Link>
      <FollowEventButton eventId={event.id} eventTitle={event.title} />
    </div>
  )
}
