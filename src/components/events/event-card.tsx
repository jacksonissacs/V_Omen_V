"use client"

import Link from "next/link"
import type { MouseEvent } from "react"

import { Residual } from "@/components/common/residual"
import { ChangeIndicator } from "@/components/events/change-indicator"
import { ConfidenceIndicator } from "@/components/events/confidence-indicator"
import { ProbabilityBadge } from "@/components/events/probability-badge"
import { SourceBadge } from "@/components/events/source-badge"
import { useWorkspace } from "@/components/layout/workspace-provider"
import type { AionEvent } from "@/types/event"

export function EventCard({ event }: { event: AionEvent }) {
  const { isWatched, toggleWatch } = useWorkspace()
  const href = `/events/${event.id}`
  const stop = (callback: () => void) => (mouseEvent: MouseEvent) => {
    mouseEvent.stopPropagation()
    callback()
  }

  return (
    <article className="aion-pulse-card">
      <Link className="aion-card-link" href={href} aria-label={`Open ${event.title}`}>
        <span className="aion-sr-only">Open {event.title}</span>
      </Link>
      <div className="aion-card-meta">
        <span className="category">{event.category}</span>
        <span className="aion-mono">{event.displayTime}</span>
        <SourceBadge tier={event.sourceTier} />
      </div>
      <h2>{event.title}</h2>
      <div className="aion-card-move">
        <ProbabilityBadge value={event.previousProbability} muted />
        <span className="aion-card-arrow">→</span>
        <ProbabilityBadge value={event.probability} />
        <div className="aion-card-stats">
          <span>
            <ChangeIndicator change={event.change} />
          </span>
          <span>
            <b className="aion-mono">{event.sigma.toFixed(1)}σ</b> move
          </span>
          <span>
            over <b className="aion-mono">{event.duration}</b>
          </span>
        </div>
      </div>
      <div className="aion-card-body">
        <div className="aion-card-cause">
          <span className="aion-label">{event.catalystLabel}</span>
          <span>{event.catalyst}</span>{" "}
          <span className="aion-mono aion-label" style={{ display: "inline" }}>
            {event.catalystTime}
          </span>
          <Residual explained={event.explained} />
        </div>
        <div className="aion-card-confidence">
          <ConfidenceIndicator value={event.confidence} />
          <div>
            <span>Data quality</span>
            <span>{event.confidence}</span>
          </div>
          <div>
            <span>Historical analogues</span>
            <span className="aion-mono">n = {event.analogues.length || 1}</span>
          </div>
        </div>
      </div>
      <div className="aion-card-actions">
        <Link className="aion-button" data-quiet="true" href={href} onClick={(event) => event.stopPropagation()}>
          Open event
        </Link>
        <Link className="aion-button" data-quiet="true" href={href} onClick={(event) => event.stopPropagation()}>
          View evidence
        </Link>
        <button
          type="button"
          className="aion-button"
          data-quiet="true"
          aria-pressed={isWatched(event.id)}
          onClick={stop(() => toggleWatch(event.id))}
        >
          {isWatched(event.id) ? "Following" : "Follow"}
        </button>
      </div>
    </article>
  )
}
