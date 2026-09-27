"use client"

import Link from "next/link"

import { FollowEventButton } from "@/components/events/follow-event-button"
import { BASIS_LABEL, formatInterval, latestChange, probabilityBasis } from "@/lib/domain/probability-history"
import { formatProbability, formatSignedPp, movementDirection } from "@/lib/domain/scoring"
import { formatDateTime } from "@/lib/format"
import type { AionEvent } from "@/types/event"

export function EventCard({
  event,
  density = "scan",
}: {
  event: AionEvent
  /** `scan` for Pulse; `book` is a denser Explore variant of the same card. */
  density?: "scan" | "book"
}) {
  const href = `/events/${event.id}`
  const evidenceHref = `${href}#event-evidence`
  const headline = event.probabilitySeries[0]
  const latest = headline?.observations.at(-1)
  const compared = latestChange(headline)
  const basis = headline ? probabilityBasis(headline) : undefined
  const question = event.question.trim() || event.title
  const resolution = event.resolvesAt?.trim() || event.deadline?.trim() || null

  return (
    <article
      className="aion-pulse-card"
      data-provenance={event.provenance}
      data-density={density}
      aria-labelledby={`event-card-question-${event.id}`}
    >
      <Link className="aion-card-link" href={href} aria-label={`Open brief for ${question}`}>
        <span className="aion-sr-only">Open brief for {question}</span>
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

      <h2 id={`event-card-question-${event.id}`} className="aion-card-question">
        {question}
      </h2>

      <div className="aion-card-move" data-testid="event-card-probability">
        <div className="aion-card-probability-block">
          <span className="aion-label">Current probability</span>
          {latest ? (
            <b className="aion-mono aion-card-to" data-testid="event-card-current-probability">
              {formatProbability(latest.probability)}
            </b>
          ) : (
            <b className="aion-mono aion-card-to">Not recorded</b>
          )}
        </div>
        <div className="aion-card-change-block">
          <span className="aion-label">Change</span>
          {compared ? (
            <ScanChange deltaPp={compared.deltaPp} />
          ) : (
            <b className="aion-mono" data-testid="event-card-change">
              Not computable
            </b>
          )}
          <span className="aion-card-interval">
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

      <div className="aion-card-horizon" data-testid="event-card-horizon">
        <span className="aion-label">Resolution</span>
        <span>{resolution ? resolution : "Not recorded"}</span>
      </div>

      <div className="aion-card-body">
        <div className="aion-card-cause" data-testid="event-card-why">
          <WhyItMoved event={event} />
          <Attribution event={event} />
        </div>
        <div className="aion-card-confidence" data-testid="event-card-provenance">
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
        <Link className="aion-button" data-quiet="true" href={href} onClick={(mouseEvent) => mouseEvent.stopPropagation()}>
          View brief
        </Link>
        <Link
          className="aion-button"
          data-quiet="true"
          href={evidenceHref}
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
        >
          Inspect evidence
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

function ScanChange({ deltaPp }: { deltaPp: number }) {
  const direction = movementDirection(deltaPp)
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→"
  const signed = formatSignedPp(deltaPp)

  return (
    <b
      className={`aion-mono aion-card-change ${direction === "up" ? "aion-up" : direction === "down" ? "aion-down" : ""}`}
      data-testid="event-card-change"
      aria-label={signed}
    >
      <span aria-hidden="true">{arrow} </span>
      {signed}
    </b>
  )
}

function WhyItMoved({ event }: { event: AionEvent }) {
  if (event.moveLog) {
    return (
      <>
        <span className="aion-label">
          Why it moved · {event.provenance === "demo" ? "Illustrative move log" : "Move log"}
        </span>
        <span>{event.likelyCause}</span>
        <p className="aion-note">Attributed interpretation, not a measured cause.</p>
      </>
    )
  }
  if (event.provenance === "demo" && event.catalyst.trim()) {
    return (
      <>
        <span className="aion-label">Why it moved · Illustrative narrative</span>
        <span>{event.catalyst}</span>
        <p className="aion-note">OMEN recorded this narrative alongside the observation. Not a measured cause.</p>
      </>
    )
  }
  return (
    <>
      <span className="aion-label">Why it moved</span>
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
