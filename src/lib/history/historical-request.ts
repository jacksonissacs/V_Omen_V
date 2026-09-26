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

/**
 * Detects a request for a recorded checkpoint or an arbitrary past instant.
 * V0 on this SHA has no verified checkpoint store, so callers must refuse
 * to render or return the current record.
 */
export function requestedHistoricalView(
  searchParams:
    | { [key: string]: string | string[] | undefined }
    | URLSearchParams
    | undefined,
): HistoricalRequest | undefined {
  if (!searchParams) return undefined
  const read = (key: string) =>
    searchParams instanceof URLSearchParams
      ? firstQueryValue(searchParams.get(key))
      : firstQueryValue(searchParams[key])
  for (const kind of HISTORICAL_QUERY_KEYS) {
    const value = read(kind)
    if (value) return { kind, value }
  }
}

export function historicalViewUnavailableMessage(request: HistoricalRequest): string {
  if (request.kind === "checkpoint") {
    return `Checkpoint ${request.value} cannot be reconstructed. This build has no recorded history checkpoints.`
  }
  return `Historical ${request.kind}=${request.value} cannot be reconstructed. This build does not replay arbitrary times.`
}
