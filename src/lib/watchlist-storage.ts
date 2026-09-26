const STORAGE_KEY = "omen.workspace.watchlist.v1"

export function readPersistedWatchlist(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) return []
    return parsed
  } catch {
    return []
  }
}

export function writePersistedWatchlist(ids: Iterable<string>): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}
