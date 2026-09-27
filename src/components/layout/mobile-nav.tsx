"use client"

import { Activity, CircleDot, List, Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useState } from "react"

import { MoreMenu } from "@/components/layout/more-menu"
import { useCompactViewport } from "@/components/layout/use-compact-viewport"
import { isActive } from "@/components/sidebar/sidebar"
import { primaryNav } from "@/data/workspace"

const ICONS = {
  pulse: Activity,
  events: CircleDot,
  watchlists: List,
} as const

export function MobileNav() {
  const pathname = usePathname()
  const compact = useCompactViewport()
  const [moreOpen, setMoreOpen] = useState(false)
  const closeMore = useCallback(() => setMoreOpen(false), [])

  if (!compact) return null

  return (
    <>
      <nav className="aion-mobile-nav" aria-label="Consumer navigation">
        {primaryNav.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS]
          return (
            <Link
              key={item.href}
              href={item.href}
              className="aion-mobile-nav-item"
              data-active={isActive(pathname, item.href)}
              onClick={closeMore}
            >
              {Icon ? <Icon size={16} aria-hidden /> : null}
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className="aion-mobile-nav-item"
          aria-expanded={moreOpen}
          aria-controls="aion-more-nav"
          aria-haspopup="dialog"
          data-active={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
        >
          {moreOpen ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          <span>{moreOpen ? "Close" : "More"}</span>
        </button>
      </nav>
      <MoreMenu open={moreOpen} onClose={closeMore} />
    </>
  )
}
