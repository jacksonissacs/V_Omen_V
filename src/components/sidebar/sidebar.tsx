"use client"

import {
  Activity,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  History,
  List,
  Menu,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useState } from "react"

import { MoreMenu } from "@/components/layout/more-menu"
import { useCompactViewport } from "@/components/layout/use-compact-viewport"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { AionMark } from "@/components/sidebar/aion-mark"
import { primaryNav } from "@/data/workspace"
import type { NavItem } from "@/types/workspace"

const icons = {
  pulse: Activity,
  events: CircleDot,
  watchlists: List,
  archive: History,
} as const

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, toggleCollapsed } = useWorkspace()
  const compact = useCompactViewport()
  const [moreOpen, setMoreOpen] = useState(false)
  const closeMore = useCallback(() => setMoreOpen(false), [])

  if (compact) return null

  return (
    <>
      <aside className="aion-sidebar" aria-label="Workspace navigation">
        <Link className="aion-logo" href="/pulse" aria-label="OMEN workspace home">
          <AionMark />
          <span className="aion-logo-word">OMEN</span>
        </Link>
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        <button
          type="button"
          className="aion-nav-item"
          aria-expanded={moreOpen}
          aria-controls="aion-more-nav"
          aria-haspopup="dialog"
          data-active={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span className="aion-nav-icon">
            {moreOpen ? <X size={14} aria-hidden /> : <Menu size={14} aria-hidden />}
          </span>
          <span className="aion-nav-label">{moreOpen ? "Close" : "More"}</span>
        </button>
        <div className="aion-sidebar-foot">
          <button type="button" className="aion-collapse" onClick={toggleCollapsed}>
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            <span className="aion-nav-label">{collapsed ? "" : "collapse"}</span>
          </button>
        </div>
      </aside>
      <MoreMenu open={moreOpen} onClose={closeMore} />
    </>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = icons[item.icon as keyof typeof icons]
  return (
    <Link
      href={item.href}
      className="aion-nav-item"
      data-active={active}
      title={item.label}
    >
      <span className="aion-nav-icon">{Icon ? <Icon size={14} /> : null}</span>
      <span className="aion-nav-label">{item.label}</span>
    </Link>
  )
}

export function isActive(pathname: string, href: string) {
  if (href === "/pulse") {
    return pathname === "/pulse"
  }
  if (href === "/events") {
    return pathname === "/events" || pathname.startsWith("/events/")
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
