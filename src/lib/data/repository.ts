import "server-only"

import { Pool } from "pg"

import type {
  EventFilter,
  IntelligenceItem,
  RelationshipGraph,
  SearchHit,
} from "@/lib/domain/types"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"
import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"
import { readStorageConfig, type StorageMode } from "@/lib/db/config"
import type { ReconstructionOutcome } from "@/lib/domain/historical-reconstruction"
import type { AionEvent, Provenance } from "@/types/event"

/**
 * The single read boundary for the core workspace. Every method is async so a
 * persistent adapter can replace the in-process mock without touching callers.
 * Only server components, route handlers and tests may import this module.
 */
export interface IntelligenceRepository {
  /**
   * Where records are stored. This says nothing about where they came from:
   * provenance lives on each event, and demo records stay demo in PostgreSQL.
   */
  readonly storage: StorageMode | "misconfigured"
  listEvents(filter?: EventFilter): Promise<AionEvent[]>
  getEvent(id: string): Promise<AionEvent | undefined>
  /** Events linked from `id`, in the order the event lists them. Unknown ids yield `[]`. */
  getRelatedEvents(id: string): Promise<AionEvent[]>
  /** The unexplained-move event highlighted at the foot of Pulse, if any. */
  getFeaturedAnomaly(): Promise<AionEvent | undefined>
  /** Event ids the workspace follows when it first loads. */
  listFollowedEventIds(): Promise<string[]>
  listFeed(filter?: EventFilter): Promise<IntelligenceItem[]>
  getGraph(): Promise<RelationshipGraph>
  search(query: string): Promise<SearchHit[]>
  /**
   * Stored checkpoint replay for one event. Returns a historical view, never
   * today's `AionEvent`. Demo storage reports unsupported history. Database
   * failures reject; they do not fall back to current or demo rows.
   */
  reconstructEvent(eventId: string, checkpointId: string): Promise<ReconstructionOutcome>
}

/** Summarises record provenance for display. `none` means there were no records to describe. */
export type ProvenanceSummary = Provenance | "mixed" | "none"

export function summarizeProvenance(events: readonly Pick<AionEvent, "provenance">[]): ProvenanceSummary {
  const kinds = new Set(events.map((event) => event.provenance))
  if (kinds.size === 0) return "none"
  if (kinds.size > 1) return "mixed"
  return [...kinds][0]
}

/** Stands in when storage configuration is invalid: every read rejects with the configuration error. */
class UnavailableRepository implements IntelligenceRepository {
  constructor(
    readonly storage: StorageMode | "misconfigured",
    private readonly reason: Error,
  ) {}

  private fail = async (): Promise<never> => {
    throw new RepositoryUnavailableError(this.reason.message, { cause: this.reason })
  }

  listEvents = this.fail
  getEvent = this.fail
  getRelatedEvents = this.fail
  getFeaturedAnomaly = this.fail
  listFollowedEventIds = this.fail
  listFeed = this.fail
  getGraph = this.fail
  search = this.fail
  reconstructEvent = this.fail
}

let instance: IntelligenceRepository | undefined
let pool: Pool | undefined

function createPool(connectionString: string): Pool {
  const created = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "omen-web",
  })
  created.on("error", (error) => {
    console.error("PostgreSQL idle client error:", error.message)
  })
  return created
}

export function getRepository(): IntelligenceRepository {
  if (instance) return instance
  try {
    const config = readStorageConfig()
    if (config.mode === "demo") {
      instance = new MockIntelligenceRepository()
    } else {
      pool ??= createPool(config.connectionString)
      instance = new PostgresIntelligenceRepository(pool)
    }
  } catch (error) {
    const requested = process.env.OMEN_STORAGE_MODE?.trim() === "database" ? "database" : "misconfigured"
    instance = new UnavailableRepository(requested, error as Error)
  }
  return instance
}

export function __resetRepositoryForTests(
  next?: IntelligenceRepository,
): void {
  instance = next
  if (pool) {
    void pool.end().catch(() => undefined)
    pool = undefined
  }
}
