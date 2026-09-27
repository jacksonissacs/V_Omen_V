"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { ScreenHead } from "@/components/common/screen-head"
import { EventCard } from "@/components/events/event-card"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { capPulseEvents, filterEvents, orderPulseEvents, PULSE_SCAN_LIMIT } from "@/lib/events"
import { EVENT_CATEGORIES, type AionEvent, type EventCategory } from "@/types/event"

const SORTS: { label: string; value: "change" | "watchlist" }[] = [
  { label: "Largest move", value: "change" },
  { label: "My watchlist", value: "watchlist" },
]

export function PulseScreen({
  events,
  anomaly,
}: {
  events: AionEvent[]
  anomaly?: AionEvent
}) {
  const { watchlist } = useWorkspace()
  const [category, setCategory] = useState<EventCategory | "All">("All")
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("change")
  const [query, setQuery] = useState("")

  const filtered = useMemo(
    () =>
      filterEvents(events, {
        category,
        query,
        watchlist,
        watchlistOnly: sort === "watchlist",
      }),
    [events, category, query, sort, watchlist],
  )

  const ordered = useMemo(() => orderPulseEvents(filtered), [filtered])
  const visible = useMemo(() => capPulseEvents(ordered), [ordered])
  const capped = ordered.length > visible.length

  if (events.length === 0) {
    return (
      <section className="aion-screen">
        <ScreenHead
          title="Pulse"
          description="A high-signal scan of recorded moves — not the full book, and not personalized."
        />
        <div className="aion-panel" role="status">
          <h2>No events in the book yet</h2>
          <p className="aion-note">Expectation moves appear here once events are recorded.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Pulse"
        description="Events worth scanning right now: largest recorded moves first. Not a recommendation engine."
      />
      <p className="aion-note aion-surface-count" data-testid="pulse-count" role="status">
        Showing {visible.length} of {filtered.length} matching · {events.length} in the book
        {capped ? (
          <>
            {" "}
            · capped at {PULSE_SCAN_LIMIT}.{" "}
            <Link href="/events">Open Explore for the full book</Link>
          </>
        ) : (
          <>
            {" "}
            · ordered by largest recorded move.{" "}
            <Link href="/events">Browse Explore</Link>
          </>
        )}
      </p>
      <label className="aion-search-large" style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search events, catalysts, entities…"
          aria-label="Search pulse"
        />
      </label>
      <div className="aion-filters" aria-label="Pulse filters">
        {(["All", ...EVENT_CATEGORIES] as const).map((item) => (
          <button
            type="button"
            key={item}
            className="aion-filter"
            data-active={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
        <span className="aion-filter-divider" />
        {SORTS.map((item) => (
          <button
            type="button"
            key={item.label}
            className="aion-filter"
            data-active={sort === item.value}
            onClick={() => setSort(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="aion-pulse-stream">
        {visible.length === 0 ? (
          <div className="aion-panel" role="status">
            <h2>No matching events</h2>
            <p className="aion-note">Clear filters or search a different catalyst.</p>
          </div>
        ) : (
          visible.map((event) => <EventCard key={event.id} event={event} density="scan" />)
        )}
        {anomaly && category === "All" && !query ? (
          <article className="aion-pulse-card aion-anomaly">
            <div className="aion-card-meta">
              <span className="category">{anomaly.category}</span>
              <span className="aion-mono">{anomaly.displayTime}</span>
            </div>
            <div className="aion-anomaly-flag">△ Expected reaction missing</div>
            <h2>{anomaly.title}</h2>
            <p>{anomaly.anomaly?.body ?? anomaly.summary}</p>
            <div className="aion-anomaly-interpretations">
              {(anomaly.anomaly?.interpretations ?? []).map((item) => (
                <span key={item}>Possible: {item}</span>
              ))}
            </div>
            <p className="aion-note">
              {anomaly.provenance === "demo"
                ? "Illustrative note. Not a measured relationship."
                : "Stored note. Not a measured relationship."}
            </p>
            <div className="aion-card-actions">
              <Link className="aion-button" data-quiet="true" href={`/events/${anomaly.id}`}>
                View brief
              </Link>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  )
}
