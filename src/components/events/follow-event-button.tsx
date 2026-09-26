"use client"

import type { MouseEvent } from "react"

import { useWorkspace } from "@/components/layout/workspace-provider"
import { FOLLOWING_BROWSER_HINT } from "@/lib/following/persistence"

export function FollowEventButton({
  eventId,
  eventTitle,
  className = "aion-button",
  quiet = true,
  onClick,
}: {
  eventId: string
  eventTitle: string
  className?: string
  quiet?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const { isWatched, toggleWatch, followingSaveError } = useWorkspace()
  const watched = isWatched(eventId)
  const persistenceHint = followingSaveError ?? FOLLOWING_BROWSER_HINT

  return (
    <button
      type="button"
      className={className}
      data-quiet={quiet ? "true" : undefined}
      aria-label={watched ? `Unfollow ${eventTitle}` : `Follow ${eventTitle}`}
      aria-pressed={watched}
      title={persistenceHint}
      onClick={(event) => {
        onClick?.(event)
        toggleWatch(eventId)
      }}
    >
      {watched ? "Following" : "Follow"}
    </button>
  )
}
