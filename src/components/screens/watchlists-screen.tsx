"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { ScreenHead } from "@/components/common/screen-head"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { watchlistRows } from "@/lib/watchlist"
import type { AionEvent } from "@/types/event"

export function WatchlistsScreen({ events }: { events: AionEvent[] }) {
  const router = useRouter()
  const { watchlist, toggleWatch } = useWorkspace()
  const rows = useMemo(
    () => watchlistRows(events.filter((event) => watchlist.has(event.id))),
    [events, watchlist],
  )

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Watchlists"
        description="Markets, entities and event classes you follow."
      />
      <div className="aion-watch-head">
        <span>Item</span>
        <span>Current state</span>
        <span>Largest recent move</span>
        <span>Last catalyst</span>
        <span>Next event</span>
      </div>
      {rows.length === 0 ? (
        <div className="aion-panel" role="status">
          <h2>Nothing followed</h2>
          <p className="aion-note">Open an event and follow it to pin it here.</p>
        </div>
      ) : (
        rows.map((row) => (
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
            <button
              type="button"
              className="aion-button"
              data-quiet="true"
              onClick={() => toggleWatch(row.eventId)}
            >
              Unfollow
            </button>
          </div>
        ))
      )}
    </section>
  )
}
