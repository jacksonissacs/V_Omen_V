"use client"

import { Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useWorkspace } from "@/components/layout/workspace-provider"
import { archiveNav, demoNav, routeHeadings } from "@/data/workspace"

export function TopBar() {
  const pathname = usePathname()
  const { setPaletteOpen, findEventSummary, storage } = useWorkspace()
  const eventMatch = pathname.match(/^\/events\/([^/]+)$/)
  const event = eventMatch ? findEventSummary(eventMatch[1]) : undefined
  const heading = event ? event.title : (routeHeadings[pathname] ?? (eventMatch ? "Event" : "OMEN"))
  const readsStore = CORE_ROUTE.test(pathname)
  const demoScreen = [...archiveNav, ...demoNav].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))

  return (
    <header className="aion-topbar">
      <div className="aion-crumb">
        {eventMatch ? (
          <>
            <Link href="/pulse">Pulse</Link>
            <span aria-hidden>/</span>
            {event ? <span>{event.category}</span> : null}
            {event ? <span aria-hidden>/</span> : null}
          </>
        ) : null}
        <b>{heading}</b>
      </div>
      {readsStore ? <DataChip /> : <LegacyDemoChip status={demoScreen?.status} />}
      {readsStore && storage === "database" ? (
        <span className="aion-chip" title="Records are read from the configured PostgreSQL database.">
          PostgreSQL
        </span>
      ) : null}
      <button
        type="button"
        className="aion-ask"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search events"
      >
        <Search size={13} aria-hidden />
        <span className="aion-ask-label">Search events</span>
        <span className="aion-kbd">⌘K</span>
      </button>
    </header>
  )
}

/** Routes whose data comes from the repository. Every other workspace screen is static demo content. */
const CORE_ROUTE = /^\/(pulse|events|watchlists)(\/|$)/

const PROVENANCE_CHIP = {
  demo: {
    label: "Demo data",
    title: "Every figure in this workspace is illustrative demo data, not a live feed — including records stored in PostgreSQL.",
  },
  sourced: {
    label: "Sourced data",
    title: "Records were entered from cited sources. They are not a live feed.",
  },
  mixed: {
    label: "Demo + sourced data",
    title: "The book mixes illustrative demo records with records entered from cited sources. Neither is a live feed.",
  },
  none: { label: "No data", title: "The configured store holds no events." },
} as const

function DataChip() {
  const { shellDataAvailable, provenance } = useWorkspace()
  if (!shellDataAvailable) {
    return (
      <span className="aion-chip aion-status-chip" title="The configured store could not be read. No substitute data is shown.">
        <span className="aion-chip-dot" aria-hidden />
        Data unavailable
      </span>
    )
  }
  const chip = PROVENANCE_CHIP[provenance]
  return (
    <span
      className={`aion-chip aion-status-chip${provenance === "demo" ? " aion-demo-chip" : ""}`}
      title={chip.title}
    >
      <span className="aion-chip-dot" aria-hidden />
      {chip.label}
    </span>
  )
}

function LegacyDemoChip({ status }: { status?: string }) {
  return (
    <span
      className="aion-chip aion-demo-chip aion-status-chip"
      title={status ?? "This screen shows illustrative demo content. It does not read the configured store."}
    >
      <span className="aion-chip-dot" aria-hidden />
      Demo data
    </span>
  )
}
