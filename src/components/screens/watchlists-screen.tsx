"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { ScreenHead } from "@/components/common/screen-head"
import { FollowEventButton } from "@/components/events/follow-event-button"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { FOLLOWING_BROWSER_LABEL } from "@/lib/following/persistence"
import { watchlistRows } from "@/lib/watchlist"
import type { AionEvent } from "@/types/event"

export function WatchlistsScreen({ events }: { events: AionEvent[] }) {
  const router = useRouter()
  const { watchlist, followingSaveError, followingReadWarning } = useWorkspace()
  const catalogIds = useMemo(() => new Set(events.map((event) => event.id)), [events])
  const followedInCatalog = useMemo(
    () => events.filter((event) => watchlist.has(event.id)),
    [events, watchlist],
  )
  const unresolvedIds = useMemo(
    () => [...watchlist].filter((id) => !catalogIds.has(id)).sort(),
    [watchlist, catalogIds],
  )
  const rows = useMemo(() => watchlistRows(followedInCatalog), [followedInCatalog])

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Watchlists"
        description={`Markets, entities and event classes you follow. ${FOLLOWING_BROWSER_LABEL}`}
      />
      {followingReadWarning ? (
        <p className="aion-note" role="status">
          {followingReadWarning}
        </p>
      ) : null}
      {followingSaveError ? (
        <p className="aion-note" role="alert">
          {followingSaveError}
        </p>
      ) : null}
      <div className="aion-watch-head">
        <span>Item</span>
        <span>Current state</span>
        <span>Largest recent move</span>
        <span>Last catalyst</span>
        <span>Next event</span>
      </div>
      {rows.length === 0 && unresolvedIds.length === 0 ? (
        <div className="aion-panel" role="status">
          <h2>Nothing followed</h2>
          <p className="aion-note">Open an event and follow it to pin it here.</p>
        </div>
      ) : (
        <>
          {rows.map((row) => (
            <div className="aion-watch-row-wrap" key={row.id}>
              <button
                type="button"
                className="aion-watch-row"
                onClick={() => router.push(`/events/${row.eventId}`)}
              >
                <span>
                  <span className="aion-watch-name">{row.name}</span>
                  <span className="aion-watch-sub">{row.subtitle}</span>
                </span>
                <span className="aion-mono">{row.state}</span>
                <span className={row.move.startsWith("−") || row.move === "No move" ? "aion-down" : "aion-up"}>
                  {row.move}
                </span>
                <span>{row.catalyst}</span>
                <span className="aion-mono">{row.nextEvent}</span>
              </button>
              <FollowEventButton eventId={row.eventId} eventTitle={row.name} />
            </div>
          ))}
          {unresolvedIds.map((eventId) => (
            <div className="aion-watch-row-wrap" key={eventId}>
              <div className="aion-watch-row" aria-disabled="true">
                <span>
                  <span className="aion-watch-name">Event not in the current book</span>
                  <span className="aion-watch-sub aion-mono">{eventId}</span>
                </span>
                <span>—</span>
                <span>—</span>
                <span className="aion-note">Catalog unavailable or entry removed</span>
                <span>—</span>
              </div>
              <FollowEventButton eventId={eventId} eventTitle={eventId} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}
