import "server-only"

import type { Pool, PoolClient } from "pg"

import { applyEventFilter, buildFeed, eventGraph } from "@/lib/data/event-query"
import type { IntelligenceRepository } from "@/lib/data/repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"
import { readEvents, type StoredEvents } from "@/lib/db/event-reader"
import { readHistoryCheckpointPage, readStoredReconstruction } from "@/lib/db/historical-reader"
import { EXPECTED_SCHEMA_VERSION, MIGRATIONS_TABLE } from "@/lib/db/schema-version"
import {
  resolveCheckpointListQuery,
  validateReconstructionRequest,
  type CheckpointListOutcome,
  type ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"
import { probabilityDelta } from "@/lib/domain/scoring"
import type {
  EventFilter,
  IntelligenceItem,
  RelationshipGraph,
  SearchHit,
} from "@/lib/domain/types"
import { searchCatalog } from "@/lib/search/command-index"
import type { AionEvent } from "@/types/event"

/**
 * Reads the core workspace from PostgreSQL. Every read runs in one
 * repeatable-read, read-only transaction. Any connection, schema or query
 * failure rejects with `RepositoryUnavailableError`; it never substitutes demo data.
 */
export class PostgresIntelligenceRepository implements IntelligenceRepository {
  readonly storage = "database" as const
  private schemaVerified = false

  constructor(private readonly pool: Pool) {}

  private async verifySchema(client: PoolClient): Promise<void> {
    if (this.schemaVerified) return
    const exists = await client.query<{ present: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [`public.${MIGRATIONS_TABLE}`],
    )
    const version = exists.rows[0]?.present
      ? ((await client.query<{ version: number | null }>(`SELECT max(version) AS version FROM ${MIGRATIONS_TABLE}`))
          .rows[0]?.version ?? null)
      : null
    if (version !== EXPECTED_SCHEMA_VERSION) {
      throw new RepositoryUnavailableError(
        version === null
          ? "PostgreSQL storage has no OMEN schema. Run `npm run db:migrate`."
          : `PostgreSQL storage schema is at version ${version}; this build expects ${EXPECTED_SCHEMA_VERSION}.`,
      )
    }
    this.schemaVerified = true
  }

  private async withSnapshot<T>(read: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient
    try {
      client = await this.pool.connect()
    } catch (error) {
      throw new RepositoryUnavailableError("Could not connect to PostgreSQL storage.", { cause: error })
    }
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      await this.verifySchema(client)
      const result = await read(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      if (error instanceof RepositoryUnavailableError) throw error
      throw new RepositoryUnavailableError("PostgreSQL storage read failed.", { cause: error })
    } finally {
      client.release()
    }
  }

  private snapshot(ids?: string[]): Promise<StoredEvents> {
    return this.withSnapshot((client) => readEvents(client, ids))
  }

  async listEvents(filter?: EventFilter): Promise<AionEvent[]> {
    return applyEventFilter((await this.snapshot()).events, filter)
  }

  async getEvent(id: string): Promise<AionEvent | undefined> {
    return (await this.snapshot([id])).events[0]
  }

  async getRelatedEvents(id: string): Promise<AionEvent[]> {
    const event = await this.getEvent(id)
    if (!event || event.relatedEvents.length === 0) return []
    const byId = new Map((await this.snapshot(event.relatedEvents)).events.map((item) => [item.id, item]))
    return event.relatedEvents
      .map((relatedId) => byId.get(relatedId))
      .filter((item): item is AionEvent => item !== undefined)
  }

  async getFeaturedAnomaly(): Promise<AionEvent | undefined> {
    const withAnomaly = (await this.snapshot()).events.filter((event) => event.anomaly)
    return withAnomaly.sort(
      (a, b) =>
        Math.abs(probabilityDelta(b.probability, b.previousProbability)) -
        Math.abs(probabilityDelta(a.probability, a.previousProbability)),
    )[0]
  }

  async listFollowedEventIds(): Promise<string[]> {
    return (await this.snapshot()).followedEventIds
  }

  async listFeed(filter?: EventFilter): Promise<IntelligenceItem[]> {
    return buildFeed(applyEventFilter((await this.snapshot()).events, filter))
  }

  async getGraph(): Promise<RelationshipGraph> {
    return eventGraph((await this.snapshot()).events)
  }

  async search(query: string): Promise<SearchHit[]> {
    return searchCatalog(query, (await this.snapshot()).events)
  }

  async listHistoryCheckpoints(
    eventId: string,
    query?: { limit?: number; beforeSequence?: number },
  ): Promise<CheckpointListOutcome> {
    const resolved = resolveCheckpointListQuery(query)
    if ("outcome" in resolved) return resolved
    return this.withSnapshot((client) => readHistoryCheckpointPage(client, eventId, resolved))
  }

  async reconstructEvent(eventId: string, checkpointId: string): Promise<ReconstructionOutcome> {
    const invalid = validateReconstructionRequest(eventId, checkpointId)
    if (invalid) return invalid
    return this.withSnapshot((client) => readStoredReconstruction(client, eventId, checkpointId))
  }
}
