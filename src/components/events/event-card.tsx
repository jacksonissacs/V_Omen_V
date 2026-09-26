"use client"

import Link from "next/link"

import { ChangeIndicator } from "@/components/events/change-indicator"
import { FollowEventButton } from "@/components/events/follow-event-button"
import { ProbabilityBadge } from "@/components/events/probability-badge"
import { BASIS_LABEL, formatInterval, latestChange, probabilityBasis } from "@/lib/domain/probability-history"
import { formatDateTime } from "@/lib/format"
import type { AionEvent } from "@/types/event"

export function EventCard({ event }: { event: AionEvent }) {
  const href = `/events/${event.id}`
  const headline = event.probabilitySeries[0]
  const latest = headline?.observations.at(-1)
  const compared = latestChange(headline)
  const basis = headline ? probabilityBasis(headline) : undefined

  return (
    <article className="aion-pulse-card" data-provenance={event.provenance}>
      <Link className="aion-card-link" href={href} aria-label={`Open ${event.title}`}>
        <span className="aion-sr-only">Open {event.title}</span>
      </Link>
      <div className="aion-card-meta">
        <span className="category">{event.category}</span>
        {basis ? (
          <span className="aion-chip" data-testid="series-basis">
            {BASIS_LABEL[basis]}
          </span>
        ) : null}
        <span className="aion-chip" data-testid="event-provenance">
          {event.provenance === "demo" ? "Demo" : "Sourced"}
        </span>
      </div>
      <h2>{event.title}</h2>
      <div className="aion-card-move">
        {compared ? (
          <>
            <ProbabilityBadge value={compared.from.probability} muted />
            <span className="aion-card-arrow">→</span>
          </>
        ) : null}
        {latest ? <ProbabilityBadge value={latest.probability} /> : <b className="aion-mono">Not recorded</b>}
        <div className="aion-card-stats">
          <span>{compared ? <ChangeIndicator change={compared.deltaPp} /> : <b className="aion-mono">Not computable</b>}</span>
          <span>
            {compared ? (
              <>
                over <b className="aion-mono">{formatInterval(compared.intervalMs)}</b>
              </>
            ) : (
              "One observation"
            )}
          </span>
        </div>
      </div>
      <div className="aion-card-body">
        <div className="aion-card-cause">
          <Cause event={event} />
          <Attribution event={event} />
        </div>
        <div className="aion-card-confidence">
          <div>
            <span>Source</span>
            <span>{headline ? headline.sourceName : "Not recorded"}</span>
          </div>
          <div>
            <span>Observed</span>
            <span className="aion-mono" data-testid="observation-time">
              {latest ? formatDateTime(latest.observedAt) : "Not recorded"}
            </span>
          </div>
          <div>
            <span>Captured by OMEN</span>
            <span className="aion-mono" data-testid="capture-time">
              {latest?.capturedAt ? formatDateTime(latest.capturedAt) : "Not recorded"}
            </span>
          </div>
          <div>
            <span>Recorded comparisons</span>
            <span className="aion-mono" data-testid="analogue-count">
              n = {event.analogues.length}
            </span>
          </div>
          <p className="aion-note">
            {event.analogues.length === 0
              ? "No analogues are recorded."
              : "Editorial comparisons. Similarity is not measured."}
          </p>
        </div>
      </div>
      <div className="aion-card-actions">
        <Link className="aion-button" data-quiet="true" href={href} onClick={(event) => event.stopPropagation()}>
          Open event
        </Link>
        <Link className="aion-button" data-quiet="true" href={href} onClick={(event) => event.stopPropagation()}>
          View evidence
        </Link>
        <FollowEventButton
          eventId={event.id}
          eventTitle={event.title}
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
        />
      </div>
    </article>
  )
}

function Cause({ event }: { event: AionEvent }) {
  if (event.moveLog) {
    return (
      <>
        <span className="aion-label">{event.provenance === "demo" ? "Illustrative move log" : "Move log"}</span>
        <span>{event.likelyCause}</span>
      </>
    )
  }
  if (event.provenance === "demo" && event.catalyst.trim()) {
    return (
      <>
        <span className="aion-label">Illustrative narrative</span>
        <span>{event.catalyst}</span>
      </>
    )
  }
  return (
    <>
      <span className="aion-label">Cause</span>
      <span>No cause has been recorded.</span>
    </>
  )
}

function Attribution({ event }: { event: AionEvent }) {
  if (event.explained == null) {
    return (
      <p className="aion-note" data-testid="attribution">
        No attribution percentage is recorded.
      </p>
    )
  }
  if (!event.moveLog) {
    return (
      <p className="aion-note" data-testid="attribution">
        Illustrative attribution: {event.explained}%. Not a measured split.
      </p>
    )
  }
  return (
    <p className="aion-note" data-testid="attribution">
      {event.provenance === "demo" ? "Illustrative. " : ""}
      The move log author states {event.explained}% of the move is explained. Not a measured split.
    </p>
  )
}
