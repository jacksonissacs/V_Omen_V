import type { AionEvent, EventCategory, EventSort } from "@/types/event"

/** Absolute move in the headline series, or null when fewer than two observations were recorded. */
export function eventChange(event: Pick<AionEvent, "change">): number | null {
  return event.change
}

export function eventQueryHaystack(event: AionEvent): string {
  return [
    event.title,
    event.question,
    event.summary,
    event.category,
    event.likelyCause,
    event.region,
    ...event.tags,
    ...event.entities,
  ]
    .join(" ")
    .toLowerCase()
}

export function matchesQuery(event: AionEvent, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return eventQueryHaystack(event).includes(q)
}

/** The serializable slice of an event the workspace shell needs for crumbs and ⌘K search. */
export interface EventSummary {
  id: string
  title: string
  category: EventCategory
  searchText: string
}

export function toEventSummary(event: AionEvent): EventSummary {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    searchText: eventQueryHaystack(event),
  }
}

export function summaryMatchesQuery(summary: EventSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return summary.searchText.includes(q)
}

export function filterEvents(
  events: AionEvent[],
  options: {
    category?: EventCategory | "All"
    query?: string
    watchlist?: ReadonlySet<string>
    watchlistOnly?: boolean
  } = {},
): AionEvent[] {
  return events.filter((event) => {
    if (options.category && options.category !== "All" && event.category !== options.category) {
      return false
    }
    if (options.query && !matchesQuery(event, options.query)) {
      return false
    }
    if (options.watchlistOnly && options.watchlist && !options.watchlist.has(event.id)) {
      return false
    }
    return true
  })
}

function recordedMove(event: AionEvent): number {
  return event.change === null ? Number.NEGATIVE_INFINITY : Math.abs(event.change)
}

export function sortEvents(events: AionEvent[], sort: EventSort): AionEvent[] {
  const copy = events.slice()
  switch (sort) {
    case "probability":
      return copy.sort((a, b) => b.probability - a.probability)
    case "time":
      return copy.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    case "change":
    default:
      return copy.sort((a, b) => recordedMove(b) - recordedMove(a))
  }
}

export function uniqueMarkets(events: AionEvent[]) {
  const seen = new Map<string, { market: AionEvent["relatedMarkets"][number]; eventIds: string[] }>()
  for (const event of events) {
    for (const market of event.relatedMarkets) {
      const existing = seen.get(market.id)
      if (existing) {
        existing.eventIds.push(event.id)
      } else {
        seen.set(market.id, { market, eventIds: [event.id] })
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => Math.abs(b.market.changePct) - Math.abs(a.market.changePct),
  )
}

export function uniqueSignals(events: AionEvent[]) {
  return events
    .flatMap((event) =>
      event.signals.map((signal) => ({
        ...signal,
        eventId: event.id,
        eventTitle: event.title,
        category: event.category,
        timestamp: event.timestamp,
        displayTime: event.displayTime,
      })),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
