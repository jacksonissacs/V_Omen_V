import "server-only"

import type { Pool, PoolClient } from "pg"

import { applyEventFilter, buildFeed, eventGraph } from "@/lib/data/event-query"
import type { IntelligenceRepository } from "@/lib/data/repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"
import { readEvents, type StoredEvents } from "@/lib/db/event-reader"
import { EXPECTED_SCHEMA_VERSION, MIGRATIONS_TABLE } from "@/lib/db/schema-version"
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
    const { rows } = await client.query<{ version: number | null }>(
      `SELECT CASE WHEN to_regclass($1) IS NULL THEN NULL
                   ELSE (SELECT max(version) FROM ${MIGRATIONS_TABLE}) END AS version`,
      [`public.${MIGRATIONS_TABLE}`],
    )
    const version = rows[0]?.version ?? null
    if (version !== EXPECTED_SCHEMA_VERSION) {
      throw new RepositoryUnavailableError(
        version === null
          ? "PostgreSQL storage has no OMEN schema. Run `npm run db:migrate`."
          : `PostgreSQL storage schema is at version ${version}; this build expects ${EXPECTED_SCHEMA_VERSION}.`,
      )
    }
    this.schemaVerified = true
  }

  private async snapshot(ids?: string[]): Promise<StoredEvents> {
    let client: PoolClient
    try {
      client = await this.pool.connect()
    } catch (error) {
      throw new RepositoryUnavailableError("Could not connect to PostgreSQL storage.", { cause: error })
    }
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      await this.verifySchema(client)
      const stored = await readEvents(client, ids)
      await client.query("COMMIT")
      return stored
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      if (error instanceof RepositoryUnavailableError) throw error
      throw new RepositoryUnavailableError("PostgreSQL storage read failed.", { cause: error })
    } finally {
      client.release()
    }
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
}
