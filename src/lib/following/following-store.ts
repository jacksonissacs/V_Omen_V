"use client"

import {
  followingStorageKey,
  readBrowserFollowing,
  writeBrowserFollowing,
  type FollowingStoragePayload,
  type FollowingStorageScope,
} from "@/lib/following/persistence"

export type FollowingSnapshot = {
  eventIds: readonly string[]
  /** False during SSR and the hydration pass; follow controls use server defaults until then. */
  ready: boolean
  /** Set when persisted data could not be read; following still works for this session. */
  readWarning: string | null
  /** Set when the latest write to localStorage failed. */
  saveError: string | null
}

type Listener = () => void

type FollowingStore = {
  subscribe: (listener: Listener) => () => void
  getSnapshot: () => FollowingSnapshot
  getServerSnapshot: () => FollowingSnapshot
  setRepositoryDefaults: (ids: readonly string[]) => void
  toggle: (eventId: string) => void
  replaceFromStorage: () => void
}

const stores = new Map<FollowingStorageScope, FollowingStore>()

function idsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function createFollowingStore(storage: FollowingStorageScope): FollowingStore {
  let repositoryDefaults: readonly string[] = []
  let eventIds: string[] = []
  let ready = false
  let readWarning: string | null = null
  let saveError: string | null = null
  let userSaved = false
  const listeners = new Set<Listener>()

  let clientSnapshot: FollowingSnapshot = {
    eventIds: [],
    ready: false,
    readWarning: null,
    saveError: null,
  }
  let serverSnapshot: FollowingSnapshot = {
    eventIds: [],
    ready: false,
    readWarning: null,
    saveError: null,
  }

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const syncClientSnapshot = () => {
    if (
      clientSnapshot.ready === ready &&
      clientSnapshot.readWarning === readWarning &&
      clientSnapshot.saveError === saveError &&
      idsEqual(clientSnapshot.eventIds, eventIds)
    ) {
      return clientSnapshot
    }
    clientSnapshot = {
      eventIds: eventIds.slice(),
      ready,
      readWarning,
      saveError,
    }
    return clientSnapshot
  }

  const syncServerSnapshot = () => {
    if (
      serverSnapshot.ready === false &&
      serverSnapshot.readWarning === null &&
      serverSnapshot.saveError === null &&
      idsEqual(serverSnapshot.eventIds, repositoryDefaults)
    ) {
      return serverSnapshot
    }
    serverSnapshot = {
      eventIds: repositoryDefaults.slice(),
      ready: false,
      readWarning: null,
      saveError: null,
    }
    return serverSnapshot
  }

  const publish = () => {
    const previous = clientSnapshot
    syncClientSnapshot()
    if (previous !== clientSnapshot) emit()
  }

  const applyPersisted = (payload: FollowingStoragePayload) => {
    eventIds = [...payload.eventIds]
    userSaved = payload.userSaved
  }

  const hydrateFromDisk = () => {
    const read = readBrowserFollowing(storage)
    if (read.kind === "ok" && read.payload.userSaved) {
      applyPersisted(read.payload)
      readWarning = null
    } else if (read.kind === "ok" && !read.payload.userSaved) {
      eventIds = [...repositoryDefaults]
      userSaved = false
      readWarning = null
    } else if (read.kind === "invalid") {
      eventIds = [...repositoryDefaults]
      userSaved = false
      readWarning = read.reason
    } else {
      eventIds = [...repositoryDefaults]
      userSaved = false
      readWarning = null
    }
    ready = true
    publish()
  }

  const persist = () => {
    const result = writeBrowserFollowing(storage, {
      version: 1,
      eventIds,
      userSaved: true,
    })
    saveError = result.ok ? null : result.message
  }

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage) return
    if (event.key !== null && event.key !== followingStorageKey(storage)) return
    replaceFromStorageInternal()
    publish()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (typeof window !== "undefined") {
        if (!ready) hydrateFromDisk()
        window.addEventListener("storage", onStorage)
      }
      return () => {
        listeners.delete(listener)
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage)
        }
      }
    },
    getSnapshot() {
      return syncClientSnapshot()
    },
    getServerSnapshot() {
      return syncServerSnapshot()
    },
    setRepositoryDefaults(ids) {
      const defaultsChanged = !idsEqual(repositoryDefaults, ids)
      repositoryDefaults = ids.slice()
      syncServerSnapshot()
      if (!ready) {
        if (!userSaved) eventIds = repositoryDefaults.slice()
        return
      }
      if (!userSaved && defaultsChanged) {
        eventIds = repositoryDefaults.slice()
        publish()
      }
    },
    toggle(eventId) {
      const next = new Set(eventIds)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      eventIds = [...next]
      userSaved = true
      if (typeof window !== "undefined") persist()
      publish()
    },
    replaceFromStorage() {
      replaceFromStorageInternal()
      publish()
    },
  }

  function replaceFromStorageInternal() {
    const read = readBrowserFollowing(storage)
    if (read.kind === "ok" && read.payload.userSaved) {
      applyPersisted(read.payload)
      readWarning = null
    } else if (read.kind === "invalid") {
      readWarning = read.reason
    }
    saveError = null
    ready = true
  }
}

export function getFollowingStore(storage: FollowingStorageScope): FollowingStore {
  let store = stores.get(storage)
  if (!store) {
    store = createFollowingStore(storage)
    stores.set(storage, store)
  }
  return store
}

/** Clears in-memory following stores between tests. Does not touch localStorage. */
export function __resetFollowingStoresForTests() {
  stores.clear()
}
