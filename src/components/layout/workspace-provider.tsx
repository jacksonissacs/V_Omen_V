"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import type { EventSummary } from "@/lib/events"
import { getFollowingStore } from "@/lib/following/following-store"
import type { FollowingStorageScope } from "@/lib/following/persistence"
import type { AionEvent, Provenance } from "@/types/event"

export type ShellStorage = FollowingStorageScope
export type ShellProvenance = Provenance | "mixed" | "none"

/** Serializable data the server layout loads once for the whole workspace shell. */
export interface WorkspaceShellData {
  eventIndex: EventSummary[]
  /** Repository-provided ids used only to seed first-visit following; never overwrites browser saves. */
  followedEventIds: string[]
  /** False when the repository could not be read; the shell renders but search is disabled. */
  available: boolean
  /** Where records are stored. Never implies where they came from. */
  storage: ShellStorage
  /** Where the loaded records came from, summarised across the book. */
  provenance: ShellProvenance
}

const EMPTY_SHELL_DATA: WorkspaceShellData = {
  eventIndex: [],
  followedEventIds: [],
  available: true,
  storage: "demo",
  provenance: "demo",
}

interface WorkspaceContextValue {
  eventIndex: EventSummary[]
  shellDataAvailable: boolean
  storage: ShellStorage
  provenance: ShellProvenance
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
  followingReady: boolean
  followingSaveError: string | null
  followingReadWarning: string | null
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  children,
  data = EMPTY_SHELL_DATA,
}: {
  children: ReactNode
  data?: WorkspaceShellData
}) {
  const { eventIndex, followedEventIds, available: shellDataAvailable, storage, provenance } = data
  const followingStore = useMemo(() => getFollowingStore(storage), [storage])
  followingStore.setRepositoryDefaults(followedEventIds)

  const following = useSyncExternalStore(
    followingStore.subscribe,
    followingStore.getSnapshot,
    followingStore.getServerSnapshot,
  )

  const watchlist = useMemo(() => new Set(following.eventIds), [following.eventIds])

  const summaryById = useMemo(
    () => new Map(eventIndex.map((summary) => [summary.id, summary])),
    [eventIndex],
  )
  const findEventSummary = useCallback((id: string) => summaryById.get(id), [summaryById])

  const [collapsed, setCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [callEvent, setCallEvent] = useState<AionEvent | null>(null)

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

  const toggleWatch = useCallback(
    (id: string) => {
      followingStore.toggle(id)
    },
    [followingStore],
  )

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
      storage,
      provenance,
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
      followingReady: following.ready,
      followingSaveError: following.saveError,
      followingReadWarning: following.readWarning,
    }),
    [
      eventIndex,
      shellDataAvailable,
      storage,
      provenance,
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
      following.ready,
      following.saveError,
      following.readWarning,
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
