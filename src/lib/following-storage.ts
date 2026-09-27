export const FOLLOWING_STORAGE_KEY = "omen.following.v1"

export type FollowingRead =
  | { status: "missing" }
  | { status: "ok"; ids: string[] }
  | { status: "invalid" }
  | { status: "error"; reason: string }

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
}

/** Reads the device-local follow list. Never throws. */
export function readStoredFollowing(storage?: Pick<Storage, "getItem"> | null): FollowingRead {
  if (!storage) return { status: "missing" }
  try {
    const raw = storage.getItem(FOLLOWING_STORAGE_KEY)
    if (raw === null) return { status: "missing" }
    const parsed: unknown = JSON.parse(raw)
    if (!isIdList(parsed)) return { status: "invalid" }
    return { status: "ok", ids: [...new Set(parsed)] }
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : "unreadable" }
  }
}

/** Writes the device-local follow list. Returns false when storage refuses the write. */
export function writeStoredFollowing(
  ids: readonly string[],
  storage?: Pick<Storage, "setItem"> | null,
): boolean {
  if (!storage) return false
  try {
    storage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify([...new Set(ids)]))
    return true
  } catch {
    return false
  }
}

export function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const FOLLOWING_CHANGE_EVENT = "omen-following-change"

let snapshot: string[] = []
let snapshotKey = ""

function sameIds(ids: string[]): string[] {
  const key = ids.join("\0")
  if (key === snapshotKey) return snapshot
  snapshot = ids
  snapshotKey = key
  return snapshot
}

/** Cached follow list for `useSyncExternalStore`. Missing or invalid storage uses `fallback`. */
export function peekFollowing(fallback: readonly string[]): string[] {
  const stored = readStoredFollowing(browserStorage())
  return sameIds(stored.status === "ok" ? stored.ids : [...fallback])
}

export function subscribeFollowing(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(FOLLOWING_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(FOLLOWING_CHANGE_EVENT, onStoreChange)
  }
}

export function publishFollowing(ids: readonly string[]): boolean {
  const unique = [...new Set(ids)]
  const ok = writeStoredFollowing(unique, browserStorage())
  sameIds(unique)
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FOLLOWING_CHANGE_EVENT))
  return ok
}
