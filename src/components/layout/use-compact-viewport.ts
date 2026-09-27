"use client"

import { useSyncExternalStore } from "react"

const COMPACT_QUERY = "(max-width: 760px)"

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null
  }
  return window.matchMedia(COMPACT_QUERY)
}

function subscribeCompact(onChange: () => void) {
  const media = getMediaQueryList()
  if (!media) return () => {}
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

const getCompact = () => getMediaQueryList()?.matches ?? false

/** True at phone widths where labelled bottom navigation replaces the sidebar rail. */
export function useCompactViewport() {
  return useSyncExternalStore(subscribeCompact, getCompact, () => false)
}
