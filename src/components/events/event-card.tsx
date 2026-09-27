"use client"

import Link from "next/link"
import type { MouseEvent } from "react"

import { ChangeIndicator } from "@/components/events/change-indicator"
import { ProbabilityBadge } from "@/components/events/probability-badge"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { formatProbability } from "@/lib/domain/scoring"
import type { AionEvent } from "@/types/event"

export function EventCard({ event }: { event: AionEvent }) {
  const { isWatched, toggleWatch } = useWorkspace()
  const href = `/events/${event.id}`
  const stop = (callback: () => void) => (mouseEvent: MouseEvent) => {
    mouseEvent.stopPropagation()
    callback()
  }
  const lead = event.evidence[0]

  return (
    <article className="aion-pulse-card">
      <Link className="aion-card-link" href={href} aria-label={`Open ${event.title}`}>
        <span className="aion-sr-only">Open {event.title}</span>
      </Link>
      <div className="aion-card-meta">
        <span className="category">{event.category}</span>
        {event.provenance === "demo" ? <span className="aion-chip aion-demo-chip">Illustrative</span> : null}
      </div>
      <p className="aion-card-question">{event.question}</p>
      <h2>{event.title}</h2>
      <div className="aion-card-move">
        <ProbabilityBadge value={event.previousProbability} muted />
        <span className="aion-card-arrow" aria-hidden>
          →
        </span>
        <ProbabilityBadge value={event.probability} />
        <div className="aion-card-stats">
          <ChangeIndicator change={event.change} unit="pp" />
        </div>
      </div>
      <div className="aion-card-body">
        <div className="aion-card-cause">
          <span className="aion-label">What changed</span>
          <span>{event.whatChanged}</span>
        </div>
        <div className="aion-card-evidence">
          <span className="aion-label">Evidence</span>
          {lead ? (
            <span>
              {lead.name}
              {event.evidence.length > 1 ? ` · ${event.evidence.length} records` : ""}
            </span>
          ) : (
            <span>No evidence recorded</span>
          )}
        </div>
      </div>
      <div className="aion-card-actions">
        <Link className="aion-button" data-primary="true" href={href} onClick={(click) => click.stopPropagation()}>
          Inspect evidence
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
        <span className="aion-card-prob-note aion-mono">
          {formatProbability(event.previousProbability)} → {formatProbability(event.probability)}
        </span>
      </div>
    </article>
  )
}
