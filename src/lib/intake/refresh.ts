import path from "node:path"

import { loadMatchConfig } from "./match"
import { getSourceDocument, SourceRequestError, type LookupFn, type SourceFetch } from "./network"
import { compareByStatedDate, MalformedCatalogError, parseKevCatalog } from "./parse-kev"
import { applyCapture, assertIntakeWritable, readQueue, writeQueue } from "./queue"
import { CISA_KEV, INTAKE_LIMITS } from "./source"
import type { IntakeQueue, IntakeRefreshReport, IntakeVersion, MatchRule } from "./types"

type Env = Record<string, string | undefined>

export interface RefreshOptions {
  queueDir: string
  now?: string
  env?: Env
  rules?: readonly MatchRule[]
  matchesPath?: string
  limit?: number
  minIntervalMs?: number
  fetchImpl?: SourceFetch
  lookup?: LookupFn
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  maxBytes?: number
  maxRetries?: number
  maxRedirects?: number
}

function blankReport(now: string, partial: Partial<IntakeRefreshReport> = {}): IntakeRefreshReport {
  return {
    sourceId: CISA_KEV.id,
    ok: false,
    fetchedAt: now,
    failure: null,
    sourceCatalogVersion: null,
    staged: [],
    duplicates: [],
    changed: [],
    undated: [],
    malformedEntries: [],
    ambiguous: [],
    truncated: false,
    windowSize: 0,
    requests: 0,
    ...partial,
  }
}

/**
 * Fetch the allowlisted catalog and append new or changed items to the review queue.
 * Does not write events, observations, evidence, or probabilities.
 */
export async function refreshSource(options: RefreshOptions): Promise<IntakeRefreshReport> {
  assertIntakeWritable(options.env)
  const now = options.now ?? new Date().toISOString()
  const limit = options.limit ?? INTAKE_LIMITS.defaultItemLimit
  if (!Number.isInteger(limit) || limit < 1 || limit > INTAKE_LIMITS.maxItemLimit) {
    throw new Error(`Item limit must be an integer from 1 to ${INTAKE_LIMITS.maxItemLimit}.`)
  }
  const queue = await readQueue(options.queueDir)
  const minIntervalMs = options.minIntervalMs ?? INTAKE_LIMITS.minIntervalMs
  if (queue.lastRequestAt && minIntervalMs > 0 && Date.parse(now) - Date.parse(queue.lastRequestAt) < minIntervalMs) {
    return blankReport(now, {
      failure: {
        kind: "rate_limited",
        message: "Local intake interval has not elapsed. No request was sent.",
      },
    })
  }

  const rules = options.rules ? [...options.rules] : loadMatchConfig(options.matchesPath ?? defaultMatchesPath())
  let requests = 0
  try {
    const document = await getSourceDocument({
      fetchImpl: options.fetchImpl,
      lookup: options.lookup,
      sleep: options.sleep,
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      maxRetries: options.maxRetries,
      maxRedirects: options.maxRedirects,
    })
    requests = document.requests
    const parsed = parseKevCatalog(document.body)
    const ordered = [...parsed.entries].sort(compareByStatedDate)
    const window = ordered.slice(0, limit)
    const applied = applyCapture(queue.versions, window, now, rules)
    const next: IntakeQueue = {
      ...queue,
      lastRequestAt: now,
      versions: applied.versions,
    }
    await writeQueue(options.queueDir, next)
    return blankReport(now, {
      ok: true,
      sourceCatalogVersion: parsed.catalogVersion,
      staged: applied.staged,
      duplicates: applied.duplicates,
      changed: applied.changed,
      undated: applied.undated,
      malformedEntries: parsed.malformedEntries,
      ambiguous: applied.ambiguous,
      truncated: ordered.length > window.length,
      windowSize: window.length,
      requests,
    })
  } catch (error) {
    const failure =
      error instanceof SourceRequestError
        ? { kind: error.kind, message: error.message, ...(error.status === undefined ? {} : { status: error.status }) }
        : error instanceof MalformedCatalogError
          ? { kind: "malformed" as const, message: error.message }
          : null
    if (!failure) throw error
    await writeQueue(options.queueDir, { ...queue, lastRequestAt: now, versions: queue.versions })
    return blankReport(now, { failure, requests })
  }
}

export function defaultQueueDir(): string {
  return path.join(process.cwd(), ".omen", "intake")
}

export function defaultMatchesPath(): string {
  return path.join(process.cwd(), "config", "intake-matches.json")
}

export function listVersions(versions: readonly IntakeVersion[], state?: IntakeVersion["reviewState"]): IntakeVersion[] {
  const filtered = state ? versions.filter((version) => version.reviewState === state) : [...versions]
  const rank = { pending: 0, selected: 1, rejected: 2 }
  return filtered.sort((left, right) => rank[left.reviewState] - rank[right.reviewState] || right.firstFetchedAt.localeCompare(left.firstFetchedAt))
}
