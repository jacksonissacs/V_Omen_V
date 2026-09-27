"use client"

import Link from "next/link"

import { ScreenHead } from "@/components/common/screen-head"
import { ChangeIndicator } from "@/components/events/change-indicator"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { formatProbability } from "@/lib/domain/scoring"
import type { AionEvent } from "@/types/event"

export function WatchlistsScreen({ events }: { events: AionEvent[] }) {
  const { watchlist, toggleWatch, followingPersisted } = useWorkspace()
  const rows = events.filter((event) => watchlist.has(event.id))

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Following"
        description="Events you chose to keep. Saved on this device, not synced to an account."
      />
      <p className="aion-note aion-follow-note" data-testid="following-storage-note">
        {followingPersisted
          ? "This list is stored in this browser only. Clearing site data or using another device starts from the book's default follows."
          : "This browser would not save the list (storage is blocked or full). Follows last only until you leave the page."}
      </p>
      {rows.length === 0 ? (
        <div className="aion-panel" role="status">
          <h2>Nothing followed</h2>
          <p className="aion-note">Open an event and choose Follow. The choice stays on this device.</p>
        </div>
      ) : (
        <ul className="aion-follow-list">
          {rows.map((event) => (
            <li className="aion-follow-item" key={event.id}>
              <Link className="aion-follow-main" href={`/events/${event.id}`}>
                <span className="aion-watch-name">{event.title}</span>
                <span className="aion-watch-sub">{event.question}</span>
                <span className="aion-follow-figures">
                  <span className="aion-mono">{formatProbability(event.probability)}</span>
                  <ChangeIndicator change={event.change} unit="pp" />
                </span>
              </Link>
              <button type="button" className="aion-button" data-quiet="true" onClick={() => toggleWatch(event.id)}>
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
