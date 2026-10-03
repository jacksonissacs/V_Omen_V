"use client"

import { useState } from "react"

type ShareFeedback = { kind: "copied" } | { kind: "unavailable"; url: string }

/**
 * Copies the address-bar URL for the view on screen.
 * Client-only state that is not already in the URL is left out.
 */
export function ShareViewControl() {
  const [feedback, setFeedback] = useState<ShareFeedback | null>(null)

  async function copyCurrentView() {
    const url = window.location.href
    try {
      if (!navigator.clipboard?.writeText) {
        setFeedback({ kind: "unavailable", url })
        return
      }
      await navigator.clipboard.writeText(url)
      setFeedback({ kind: "copied" })
    } catch {
      setFeedback({ kind: "unavailable", url })
    }
  }

  return (
    <div className="aion-share">
      <button
        type="button"
        className="aion-button"
        data-testid="share-view"
        title="Copy the link to this view"
        onClick={() => {
          void copyCurrentView()
        }}
      >
        Share
      </button>
      <p className="aion-share-status" role="status" aria-live="polite" data-testid="share-feedback">
        {feedback?.kind === "copied" ? "Link copied" : null}
        {feedback?.kind === "unavailable" ? <span className="aion-mono">{feedback.url}</span> : null}
      </p>
    </div>
  )
}
