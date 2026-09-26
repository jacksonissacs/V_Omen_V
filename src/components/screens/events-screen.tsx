"use client"

import { useMemo, useState } from "react"

import { ScreenHead } from "@/components/common/screen-head"
import { EventRow } from "@/components/events/event-row"
import { filterEvents, sortEvents } from "@/lib/events"
import { EVENT_CATEGORIES, type AionEvent, type EventCategory, type EventSort } from "@/types/event"

export function EventsScreen({ events }: { events: AionEvent[] }) {
  const [category, setCategory] = useState<EventCategory | "All">("All")
  const [sort, setSort] = useState<EventSort>("change")
  const [query, setQuery] = useState("")

  const visible = useMemo(
    () => sortEvents(filterEvents(events, { category, query }), sort),
    [events, category, query, sort],
  )

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Events"
        description="The book of questions OMEN is tracking."
      />
      <label className="aion-search-large">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, category, cause, entity…"
          aria-label="Search events"
        />
      </label>
      <div className="aion-filters" aria-label="Event filters">
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
        {(
          [
            ["change", "Change"],
            ["probability", "Probability"],
            ["time", "Time"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className="aion-filter"
            data-active={sort === value}
            onClick={() => setSort(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="aion-event-list">
        <div className="aion-event-list-head">
          <span>Event</span>
          <span>Probability</span>
          <span>Change</span>
          <span>Source</span>
          <span />
        </div>
        {visible.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
        {visible.length === 0 ? (
          <div className="aion-panel" role="status">
            <h2>{events.length === 0 ? "No events in the book yet" : "No matching events"}</h2>
            <p className="aion-note">
              {events.length === 0
                ? "Tracked questions appear here once events are recorded."
                : "Clear filters or search a different title, cause or entity."}
            </p>
          </div>
        ) : null}
      </div>
      <p className="aion-note">{visible.length} events in view · {events.length} in the book</p>
    </section>
  )
}
