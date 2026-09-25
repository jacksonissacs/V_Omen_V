"use client"

import { Search } from "lucide-react"
import { usePathname } from "next/navigation"

import { useWorkspace } from "@/components/layout/workspace-provider"
import { routeHeadings } from "@/data/workspace"

export function TopBar() {
  const pathname = usePathname()
  const { setPaletteOpen, findEventSummary } = useWorkspace()
  const eventMatch = pathname.match(/^\/events\/([^/]+)$/)
  const event = eventMatch ? findEventSummary(eventMatch[1]) : undefined
  const heading = event ? event.title : (routeHeadings[pathname] ?? "OMEN")

  return (
    <header className="aion-topbar">
      <div className="aion-crumb">
        {event ? (
          <>
            <span>Events</span>
            <span>/</span>
            <span>{event.category}</span>
            <span>/</span>
          </>
        ) : null}
        <b>{heading}</b>
      </div>
      <span className="aion-chip aion-demo-chip" title="Every figure in this workspace is illustrative fixture data, not a live feed.">
        <span className="aion-chip-dot" aria-hidden />
        Demo data
      </span>
      <button
        type="button"
        className="aion-ask"
        onClick={() => setPaletteOpen(true)}
        aria-label="Ask OMEN"
      >
        <Search size={13} />
        Ask OMEN…
        <span className="aion-kbd">⌘K</span>
      </button>
    </header>
  )
}
