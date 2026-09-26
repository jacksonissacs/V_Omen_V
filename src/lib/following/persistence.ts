export type FollowingStorageScope = "demo" | "database" | "misconfigured"

export const FOLLOWING_STORAGE_VERSION = 1 as const

export type FollowingStoragePayload = {
  version: typeof FOLLOWING_STORAGE_VERSION
  /** Event ids the user follows in this browser. May include ids not currently in the catalog. */
  eventIds: string[]
  /** True after the user has saved following state, including an intentionally empty list. */
  userSaved: boolean
}

export type FollowingReadResult =
  | { kind: "missing" }
  | { kind: "ok"; payload: FollowingStoragePayload }
  | { kind: "invalid"; reason: string }

export type FollowingWriteResult = { ok: true } | { ok: false; message: string }

const KEY_PREFIX = "omen-v0-following"

export function followingStorageKey(storage: FollowingStorageScope): string {
  return `${KEY_PREFIX}/v${FOLLOWING_STORAGE_VERSION}/${storage}`
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0) continue
    if (seen.has(value)) continue
    seen.add(value)
    ids.push(value)
  }
  return ids
}

/** Parses persisted JSON. Accepts legacy shapes when they can be interpreted safely. */
export function parseFollowingPayload(raw: string): FollowingReadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: "invalid", reason: "Following data in this browser was unreadable and was ignored." }
  }

  if (Array.isArray(parsed)) {
    return {
      kind: "ok",
      payload: {
        version: FOLLOWING_STORAGE_VERSION,
        eventIds: uniqueStrings(parsed),
        userSaved: true,
      },
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { kind: "invalid", reason: "Following data in this browser was unreadable and was ignored." }
  }

  const record = parsed as Record<string, unknown>
  const version = record.version

  if (version === 1) {
    if (!Array.isArray(record.eventIds)) {
      return { kind: "invalid", reason: "Following data in this browser was unreadable and was ignored." }
    }
    return {
      kind: "ok",
      payload: {
        version: FOLLOWING_STORAGE_VERSION,
        eventIds: uniqueStrings(record.eventIds),
        userSaved: record.userSaved === true,
      },
    }
  }

  if (version === undefined && Array.isArray(record.eventIds)) {
    return {
      kind: "ok",
      payload: {
        version: FOLLOWING_STORAGE_VERSION,
        eventIds: uniqueStrings(record.eventIds),
        userSaved: true,
      },
    }
  }

  return { kind: "invalid", reason: "Following data in this browser used an unsupported format and was ignored." }
}

export function readBrowserFollowing(storage: FollowingStorageScope): FollowingReadResult {
  if (typeof window === "undefined") return { kind: "missing" }
  try {
    const raw = window.localStorage.getItem(followingStorageKey(storage))
    if (raw === null) return { kind: "missing" }
    return parseFollowingPayload(raw)
  } catch {
    return { kind: "invalid", reason: "Following could not be read from this browser." }
  }
}

export function writeBrowserFollowing(
  storage: FollowingStorageScope,
  payload: FollowingStoragePayload,
): FollowingWriteResult {
  if (typeof window === "undefined") {
    return { ok: false, message: "Following can only be saved in the browser." }
  }
  try {
    window.localStorage.setItem(
      followingStorageKey(storage),
      JSON.stringify({
        version: FOLLOWING_STORAGE_VERSION,
        eventIds: uniqueStrings(payload.eventIds),
        userSaved: payload.userSaved,
      }),
    )
    return { ok: true }
  } catch {
    return {
      ok: false,
      message: "Could not save following in this browser. Storage may be full or blocked.",
    }
  }
}

export const FOLLOWING_BROWSER_LABEL = "Saved in this browser."

export const FOLLOWING_BROWSER_HINT =
  "Following is saved in this browser only. It is not backed up or synced across devices."
