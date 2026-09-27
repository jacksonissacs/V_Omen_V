"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { ScreenHead } from "@/components/common/screen-head"
import { EventCard } from "@/components/events/event-card"
import { filterEvents, sortEvents } from "@/lib/events"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { EVENT_CATEGORIES, type AionEvent, type EventCategory } from "@/types/event"

const SORTS = [
  { label: "Largest move", value: "change" },
  { label: "Followed only", value: "watchlist" },
] as const

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

  const visible = useMemo(() => {
    const filtered = filterEvents(events, {
      category,
      query,
      watchlist,
      watchlistOnly: sort === "watchlist",
    })
    return sortEvents(filtered, "change").slice(0, 12)
  }, [events, category, query, sort, watchlist])

  if (events.length === 0) {
    return (
      <section className="aion-screen">
        <ScreenHead title="Pulse" description="Recorded questions whose probability moved." />
        <div className="aion-panel" role="status">
          <h2>No events in the book yet</h2>
          <p className="aion-note">Expectation moves appear here once events are recorded.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="aion-screen">
      <ScreenHead title="Pulse" description="Question, recorded change, then the evidence that is on file." />
      <label className="aion-search-large" style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions, catalysts, entities…"
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
            <p className="aion-note">Clear filters or search a different question.</p>
          </div>
        ) : (
          visible.map((event) => <EventCard key={event.id} event={event} />)
        )}
        {anomaly && category === "All" && !query ? (
          <article className="aion-pulse-card aion-anomaly">
            <div className="aion-card-meta">
              <span className="category">{anomaly.category}</span>
              <span className="aion-chip aion-demo-chip">Interpretation</span>
            </div>
            <div className="aion-anomaly-flag">Expected reaction missing</div>
            <p className="aion-card-question">{anomaly.question}</p>
            <h2>{anomaly.title}</h2>
            <p>{anomaly.anomaly?.body ?? anomaly.summary}</p>
            <div className="aion-card-actions">
              <Link className="aion-button" data-primary="true" href={`/events/${anomaly.id}`}>
                Inspect evidence
              </Link>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  )
}
