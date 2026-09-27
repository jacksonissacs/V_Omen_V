"use client"

import { Activity, History, List, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { useWorkspace } from "@/components/layout/workspace-provider"
import { summaryMatchesQuery } from "@/lib/events"

export function CommandPalette() {
  const { setPaletteOpen, eventIndex, shellDataAvailable } = useWorkspace()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const close = () => setPaletteOpen(false)
  const run = (href: string) => {
    router.push(href)
    close()
  }

  const items = useMemo(() => {
    const commands = [
      { section: "Launch", label: "Pulse", href: "/pulse", icon: Activity },
      { section: "Launch", label: "Following", href: "/watchlists", icon: List },
      { section: "Launch", label: "Archive (demo)", href: "/archive", icon: History },
      { section: "Also available", label: "Events book", href: "/events", icon: Activity },
    ]
    const eventHits = eventIndex
      .filter((event) => summaryMatchesQuery(event, query))
      .slice(0, 8)
      .map((event) => ({
        section: "Events",
        label: event.title,
        href: `/events/${event.id}`,
        icon: Search,
      }))
    const filteredCommands = commands.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    )
    return query.trim() ? [...eventHits, ...filteredCommands] : [...filteredCommands, ...eventHits.slice(0, 4)]
  }, [eventIndex, query])

  const sections = [...new Set(items.map((item) => item.section))]

  return (
    <div
      className="aion-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="aion-palette" role="dialog" aria-modal="true" aria-label="Search events">
        <label className="aion-palette-input">
          <Search size={14} color="var(--a-tx-2)" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events or go to Pulse, Following…"
            aria-label="Search events"
          />
        </label>
        <div className="aion-palette-body">
          {sections.map((section) => (
            <div key={section}>
              <div className="aion-palette-section">{section}</div>
              {items
                .filter((item) => item.section === section)
                .map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      type="button"
                      className="aion-palette-item"
                      onClick={() => run(item.href)}
                      key={`${item.section}-${item.label}`}
                    >
                      <Icon size={14} aria-hidden />
                      {item.label}
                    </button>
                  )
                })}
            </div>
          ))}
          {!shellDataAvailable ? (
            <div className="aion-palette-section" role="status">
              Event search is unavailable right now. Navigation still works.
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="aion-palette-section">No matching events.</div>
          ) : null}
        </div>
        <div className="aion-palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
