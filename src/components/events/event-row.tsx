"use client"

import Link from "next/link"

import { ChangeIndicator } from "@/components/events/change-indicator"
import { ProbabilityBadge } from "@/components/events/probability-badge"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { formatDateTime } from "@/lib/format"
import { BASIS_LABEL, latestChange, probabilityBasis } from "@/lib/domain/probability-history"
import type { AionEvent } from "@/types/event"

export function EventRow({ event }: { event: AionEvent }) {
  const { isWatched, toggleWatch } = useWorkspace()
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
      <button
        type="button"
        className="aion-button"
        data-quiet="true"
        aria-label={isWatched(event.id) ? `Unfollow ${event.title}` : `Follow ${event.title}`}
        aria-pressed={isWatched(event.id)}
        onClick={() => toggleWatch(event.id)}
      >
        {isWatched(event.id) ? "Following" : "Follow"}
      </button>
    </div>
  )
}
