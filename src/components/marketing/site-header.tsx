"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { BrandLink } from "@/components/marketing/brand-link"

const NAV_LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#pulse", label: "Pulse" },
  { href: "#archive", label: "Archive" },
  { href: "#ledger", label: "Ledger" },
  { href: "#methodology", label: "Methodology" },
  { href: "#faq", label: "FAQ" },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <header className="topbar">
      <div className="wrap">
        <BrandLink variant="brand" />
        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label="Menu"
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <nav className={open ? "nav open" : "nav"} id="site-nav" aria-label="Site">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <Link className="btn btn-primary btn-sm" href="/pulse" onClick={() => setOpen(false)}>
            Explore the demo
          </Link>
        </nav>
      </div>
    </header>
  )
}
