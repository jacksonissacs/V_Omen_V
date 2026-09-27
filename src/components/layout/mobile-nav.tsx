"use client"

import { Activity, History, List, Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState, useSyncExternalStore } from "react"

import { isActive } from "@/components/sidebar/sidebar"
import { archiveNav, bookNav, demoNav } from "@/data/workspace"

const LAUNCH = [
  { href: "/pulse" as const, label: "Pulse", icon: Activity },
  { href: "/watchlists" as const, label: "Following", icon: List },
  { href: "/archive" as const, label: "Archive", icon: History, demo: true },
]

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia("(max-width: 760px)")
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

const getCompact = () => window.matchMedia("(max-width: 760px)").matches

export function MobileNav() {
  const pathname = usePathname()
  const compact = useSyncExternalStore(subscribeCompact, getCompact, () => false)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (!compact) return null

  return (
    <>
      <nav className="aion-mobile-nav" aria-label="Launch">
        {LAUNCH.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="aion-mobile-nav-item"
              data-active={isActive(pathname, item.href)}
            >
              <Icon size={16} aria-hidden />
              <span>
                {item.label}
                {item.demo ? <abbr title="Demo — does not query stored history">Demo</abbr> : null}
              </span>
            </Link>
          )
        })}
        <button
          type="button"
          className="aion-mobile-nav-item"
          aria-expanded={open}
          aria-controls="aion-more-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          <span>{open ? "Close" : "More"}</span>
        </button>
      </nav>
      {open ? (
        <div className="aion-overlay aion-more-overlay" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div
            id="aion-more-nav"
            className="aion-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId}>More screens</h2>
            <p className="aion-more-note">
              Pulse and Following are the launch workspace. Everything below is kept for reference and is labelled
              when it is only a demo.
            </p>
            <ul>
              {bookNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    {item.label}
                  </Link>
                </li>
              ))}
              {[...archiveNav, ...demoNav].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    <span>{item.label}</span>
                    <span className="aion-nav-demo">Demo</span>
                    {item.status ? <span className="aion-more-status">{item.status}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" className="aion-button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
