"use client"

import { Activity, CircleDot, History, List, Search, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { useWorkspace } from "@/components/layout/workspace-provider"
import { summaryMatchesQuery } from "@/lib/events"

const COMMANDS = [
  { section: "Navigate", label: "Pulse", href: "/pulse", icon: Activity },
  { section: "Navigate", label: "Explore", href: "/events", icon: CircleDot },
  { section: "Navigate", label: "Following", href: "/watchlists", icon: List },
  { section: "Navigate", label: "Archive", href: "/archive", icon: History },
] as const

export function CommandPalette() {
  const { setPaletteOpen, eventIndex, shellDataAvailable } = useWorkspace()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
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
    const eventHits = eventIndex
      .filter((event) => summaryMatchesQuery(event, query))
      .slice(0, 8)
      .map((event) => ({
        section: "Events",
        label: event.title,
        href: `/events/${event.id}`,
        icon: Sparkles,
      }))
    const filteredCommands = COMMANDS.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    )
    return query.trim() ? [...eventHits, ...filteredCommands] : [...filteredCommands, ...eventHits.slice(0, 4)]
  }, [eventIndex, query])

  const selectedIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1)
  const sections = [...new Set(items.map((item) => item.section))]

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (items.length === 0) return
      setActiveIndex((index) => (Math.min(index, items.length - 1) + 1) % items.length)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (items.length === 0) return
      setActiveIndex((index) => (Math.min(index, items.length - 1) - 1 + items.length) % items.length)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const item = items[selectedIndex]
      if (item) run(item.href)
    }
  }

  let flatIndex = -1

  return (
    <div className="aion-overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="aion-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <label className="aion-palette-input">
          <Search size={14} color="var(--a-tx-2)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search events…"
            aria-label="Search events"
            aria-activedescendant={items[selectedIndex] ? `palette-item-${selectedIndex}` : undefined}
          />
        </label>
        <div className="aion-palette-body" role="listbox" aria-label="Commands and events">
          {sections.map((section) => (
            <div key={section}>
              <div className="aion-palette-section">{section}</div>
              {items
                .filter((item) => item.section === section)
                .map((item) => {
                  flatIndex += 1
                  const index = flatIndex
                  const Icon = item.icon
                  const active = index === selectedIndex
                  return (
                    <button
                      type="button"
                      id={`palette-item-${index}`}
                      role="option"
                      aria-selected={active}
                      className="aion-palette-item"
                      data-active={active}
                      onClick={() => run(item.href)}
                      onMouseEnter={() => setActiveIndex(index)}
                      key={`${item.section}-${item.label}`}
                    >
                      <Icon size={14} />
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
          {items.length === 0 ? <div className="aion-palette-section">No matching events.</div> : null}
        </div>
        <div className="aion-palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
