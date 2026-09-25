"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import type { EventSummary } from "@/lib/events"
import type { AionEvent } from "@/types/event"

/** Serializable data the server layout loads once for the whole workspace shell. */
export interface WorkspaceShellData {
  eventIndex: EventSummary[]
  followedEventIds: string[]
  /** False when the repository could not be read; the shell renders but search is disabled. */
  available: boolean
}

const EMPTY_SHELL_DATA: WorkspaceShellData = {
  eventIndex: [],
  followedEventIds: [],
  available: true,
}

interface WorkspaceContextValue {
  eventIndex: EventSummary[]
  shellDataAvailable: boolean
  findEventSummary: (id: string) => EventSummary | undefined
  collapsed: boolean
  toggleCollapsed: () => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  callEvent: AionEvent | null
  openCall: (event: AionEvent) => void
  closeCall: () => void
  watchlist: Set<string>
  isWatched: (id: string) => boolean
  toggleWatch: (id: string) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  children,
  data = EMPTY_SHELL_DATA,
}: {
  children: ReactNode
  data?: WorkspaceShellData
}) {
  const { eventIndex, followedEventIds, available: shellDataAvailable } = data
  const [collapsed, setCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [callEvent, setCallEvent] = useState<AionEvent | null>(null)
  const [watchlist, setWatchlist] = useState<Set<string>>(
    () => new Set(followedEventIds),
  )
  const summaryById = useMemo(
    () => new Map(eventIndex.map((summary) => [summary.id, summary])),
    [eventIndex],
  )
  const findEventSummary = useCallback((id: string) => summaryById.get(id), [summaryById])
  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => !value)
  }, [])

  const openCall = useCallback((event: AionEvent) => {
    setCallEvent(event)
  }, [])

  const closeCall = useCallback(() => {
    setCallEvent(null)
  }, [])

  const isWatched = useCallback((id: string) => watchlist.has(id), [watchlist])

  const toggleWatch = useCallback((id: string) => {
    setWatchlist((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
      if (event.key === "Escape") {
        setPaletteOpen(false)
        setCallEvent(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo(
    () => ({
      eventIndex,
      shellDataAvailable,
      findEventSummary,
      collapsed,
      toggleCollapsed,
      paletteOpen,
      setPaletteOpen,
      callEvent,
      openCall,
      closeCall,
      watchlist,
      isWatched,
      toggleWatch,
    }),
    [
      eventIndex,
      shellDataAvailable,
      findEventSummary,
      collapsed,
      toggleCollapsed,
      paletteOpen,
      callEvent,
      openCall,
      closeCall,
      watchlist,
      isWatched,
      toggleWatch,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider")
  }
  return context
}

export function useOptionalWorkspace() {
  return useContext(WorkspaceContext)
}
