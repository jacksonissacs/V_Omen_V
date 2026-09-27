"use client"

import {
  Activity,
  AlarmClock,
  Bot,
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Database,
  History,
  KeyRound,
  List,
  Network,
  Radio,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useWorkspace } from "@/components/layout/workspace-provider"
import { AionMark } from "@/components/sidebar/aion-mark"
import { archiveNav, bookNav, demoNav, launchNav } from "@/data/workspace"
import type { NavItem } from "@/types/workspace"

const icons = {
  pulse: Activity,
  events: CircleDot,
  markets: Database,
  signals: Radio,
  agents: Bot,
  watchlists: List,
  research: Braces,
  archive: History,
  relations: Network,
  alerts: AlarmClock,
  settings: Settings,
  team: Bot,
  api: KeyRound,
} as const

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, toggleCollapsed } = useWorkspace()

  return (
    <aside className="aion-sidebar" aria-label="Workspace navigation">
      <Link className="aion-logo" href="/pulse" aria-label="OMEN workspace home">
        <AionMark />
        <span className="aion-logo-word">OMEN</span>
      </Link>
      <div className="aion-nav-section">Launch</div>
      {launchNav.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      {archiveNav.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      <div className="aion-nav-section">Also available</div>
      {bookNav.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      <div className="aion-nav-section">Demo screens</div>
      {demoNav.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      <div className="aion-sidebar-foot">
        <button type="button" className="aion-collapse" onClick={toggleCollapsed}>
          {collapsed ? <ChevronRight size={13} aria-hidden /> : <ChevronLeft size={13} aria-hidden />}
          <span className="aion-nav-label">{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </div>
    </aside>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = icons[item.icon]
  const title = item.status ?? item.label
  return (
    <Link
      href={item.href}
      className="aion-nav-item"
      data-active={active}
      data-demo={item.demo ? "true" : undefined}
      title={title}
    >
      <span className="aion-nav-icon" aria-hidden>
        <Icon size={14} />
      </span>
      <span className="aion-nav-label">
        {item.label}
        {item.demo ? <span className="aion-nav-demo">Demo</span> : null}
      </span>
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
