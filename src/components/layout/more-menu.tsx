"use client"

import Link from "next/link"
import { useEffect, useId, useRef } from "react"

import { moreNav } from "@/data/workspace"

export function MoreMenu({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="aion-overlay aion-more-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        id="aion-more-nav"
        className="aion-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>More</h2>
        <p className="aion-more-note">
          Archive replays recorded checkpoints. The public page is the OMEN marketing site.
        </p>
        <ul>
          {moreNav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={onClose}>
                <span className="aion-more-label">{item.label}</span>
                <span className="aion-more-status">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <button ref={closeRef} type="button" className="aion-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
