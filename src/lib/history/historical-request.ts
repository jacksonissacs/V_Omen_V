/** Query keys that ask for a past reconstruction instead of the current record. */
export const HISTORICAL_QUERY_KEYS = ["checkpoint", "at", "cutoff"] as const
export type HistoricalQueryKey = (typeof HISTORICAL_QUERY_KEYS)[number]

export interface HistoricalRequest {
  kind: HistoricalQueryKey
  value: string
}

export function firstQueryValue(value: string | string[] | undefined | null): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

export interface HistoricalRequestOptions {
  /** Archive serves checkpoint replay itself; only arbitrary-time queries are refused at the page gate. */
  route?: "archive" | "workspace"
}

/**
 * Detects a request for a recorded checkpoint or an arbitrary past instant on
 * workspace routes. Archive handles checkpoint replay; it still refuses `at` and
 * `cutoff`.
 */
export function requestedHistoricalView(
  searchParams:
    | { [key: string]: string | string[] | undefined }
    | URLSearchParams
    | undefined,
  options: HistoricalRequestOptions = {},
): HistoricalRequest | undefined {
  if (!searchParams) return undefined
  const read = (key: string) =>
    searchParams instanceof URLSearchParams
      ? firstQueryValue(searchParams.get(key))
      : firstQueryValue(searchParams[key])
  for (const kind of HISTORICAL_QUERY_KEYS) {
    if (options.route === "archive" && kind === "checkpoint") continue
    const value = read(kind)
    if (value) return { kind, value }
  }
}

export function historicalViewUnavailableMessage(request: HistoricalRequest): string {
  if (request.kind === "checkpoint") {
    return `Checkpoint ${request.value} cannot be reconstructed from this URL. Use a stored checkpoint id on /archive or /events/:id/history/:checkpointId.`
  }
  return `Historical ${request.kind}=${request.value} cannot be reconstructed. Replay a stored checkpoint id instead of an arbitrary time.`
}
