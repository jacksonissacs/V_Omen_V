/**
 * Nonproduction OMEN database command. Never prints DATABASE_URL.
 *
 *   npm run db:migrate -- [--identify development|test|demo --label "<text>"]
 *   npm run db:status
 *   npm run db:upsert -- --file <bundle.json>
 *   npm run db:show -- --event <id>
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { Client } from "pg"

import { assertPostgresUrl, productionMarker, StorageConfigError } from "../src/lib/db/config"
import { BundleValidationError, parseEventBundle } from "../src/lib/db/event-bundle"
import { readEvents, readMoveLogHistory } from "../src/lib/db/event-reader"
import { HistoryConflictError, writeEventBundle } from "../src/lib/db/event-store"
import {
  assertWritableDatabase,
  DatabaseSafetyError,
  identifyDatabase,
  loadMigrations,
  migrate,
  readIdentity,
} from "../src/lib/db/migrate"
import { DATABASE_ENVIRONMENTS, type DatabaseEnvironment, MIGRATIONS_TABLE } from "../src/lib/db/schema-version"

const USAGE = `Usage: omen-db <migrate|status|upsert|show> [options]
  migrate [--identify <${DATABASE_ENVIRONMENTS.join("|")}> --label <text>]
  status
  upsert --file <bundle.json>
  show --event <id>`

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env.local")
  if (existsSync(file)) process.loadEnvFile(file)
}

async function connect(): Promise<Client> {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new StorageConfigError("DATABASE_URL is not set.")
  assertPostgresUrl(connectionString, "DATABASE_URL")
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, application_name: "omen-db-cli" })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`Could not connect to the database named by DATABASE_URL (${(error as Error).message}).`)
  }
  return client
}

async function runMigrate(client: Client, values: { identify?: string; label?: string }) {
  if (values.identify) {
    if (!(DATABASE_ENVIRONMENTS as readonly string[]).includes(values.identify)) {
      throw new DatabaseSafetyError(`--identify must be one of ${DATABASE_ENVIRONMENTS.join(", ")}.`)
    }
    const identity = await identifyDatabase(
      client,
      values.identify as DatabaseEnvironment,
      values.label ?? `OMEN ${values.identify} database`,
    )
    console.log(`Database identity: ${identity.environment} (${identity.label})`)
  }
  const result = await migrate(client, loadMigrations())
  console.log(
    result.applied.length === 0
      ? `Schema up to date (${result.alreadyApplied} migration(s) applied earlier).`
      : `Applied ${result.applied.map((migration) => `${String(migration.version).padStart(4, "0")}_${migration.name}`).join(", ")}.`,
  )
}

async function runStatus(client: Client) {
  const identity = await readIdentity(client)
  if (!identity) {
    console.log("Database identity: none (this tooling will not write here)")
    return
  }
  console.log(`Database identity: ${identity.environment} (${identity.label}), identified ${identity.createdAt}`)
  const migrations = await client.query<{ version: number; name: string; applied_at: Date }>(
    `SELECT version, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY version`,
  )
  for (const row of migrations.rows) {
    console.log(`  migration ${String(row.version).padStart(4, "0")}_${row.name} applied ${row.applied_at.toISOString()}`)
  }
  if (migrations.rowCount === 0) return
  const counts = await client.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM events)::text AS events,
            (SELECT count(*) FROM probability_observations)::text AS observations,
            (SELECT count(*) FROM evidence)::text AS evidence,
            (SELECT count(*) FROM move_log_revisions)::text AS move_log_revisions,
            (SELECT count(*) FROM event_revisions)::text AS event_revisions,
            (SELECT count(*) FROM history_checkpoints)::text AS history_checkpoints`,
  )
  console.log(`  rows: ${Object.entries(counts.rows[0]).map(([key, value]) => `${key}=${value}`).join(" ")}`)
}

async function runUpsert(client: Client, file: string | undefined) {
  if (!file) throw new Error("upsert needs --file <bundle.json>")
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new Error(`Could not read ${file}: ${(error as Error).message}`)
  }
  const bundle = parseEventBundle(raw)
  const identity = await assertWritableDatabase(client)
  const summary = await writeEventBundle(client, bundle)
  console.log(`Target: ${identity.environment} (${identity.label})`)
  console.log(`Event ${summary.eventId}: ${summary.event}`)
  console.log(
    `  eventRevisions: ${summary.eventRevisions.appended} appended, ${summary.eventRevisions.unchanged} already recorded`,
  )
  for (const key of ["observations", "evidence", "moveLogRevisions"] as const) {
    console.log(`  ${key}: ${summary[key].appended} appended, ${summary[key].unchanged} already recorded`)
  }
  console.log(
    `  checkpoint: sequence ${summary.checkpoint.sequence} ${summary.checkpoint.created ? "published" : "unchanged"} (${summary.checkpoint.semanticHistory})`,
  )
}

async function runShow(client: Client, eventId: string | undefined) {
  if (!eventId) throw new Error("show needs --event <id>")
  const { events } = await readEvents(client, [eventId])
  const event = events[0]
  if (!event) throw new Error(`Event ${eventId} is not stored.`)
  const history = await readMoveLogHistory(client, eventId)
  console.log(
    JSON.stringify(
      {
        id: event.id,
        provenance: event.provenance,
        question: event.question,
        status: event.status,
        deadline: event.deadline,
        resolutionCriteria: event.resolutionCriteria,
        probability: event.probability,
        previousProbability: event.previousProbability,
        observations: event.expectationHistory,
        evidence: event.evidence.map(({ id, name, publishedAt, firstObservedAt }) => ({
          id,
          name,
          publishedAt,
          firstObservedAt,
        })),
        moveLog: event.moveLog,
        moveLogHistory: history.map(({ moveLogId, version, publishedAt, explainedPct, correctionNote, evidenceIds }) => ({
          moveLogId,
          version,
          publishedAt,
          explainedPct,
          correctionNote,
          evidenceIds,
        })),
      },
      null,
      2,
    ),
  )
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { values } = parseArgs({
    args: rest,
    options: {
      identify: { type: "string" },
      label: { type: "string" },
      file: { type: "string" },
      event: { type: "string" },
    },
  })
  if (!command || !["migrate", "status", "upsert", "show"].includes(command)) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  loadLocalEnv()
  const marker = productionMarker()
  if (marker && command !== "status" && command !== "show") {
    throw new DatabaseSafetyError(`Refusing to run "${command}": ${marker}=production.`)
  }

  const client = await connect()
  try {
    if (command === "migrate") await runMigrate(client, values)
    else if (command === "status") await runStatus(client)
    else if (command === "upsert") await runUpsert(client, values.file)
    else await runShow(client, values.event)
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  const known =
    error instanceof BundleValidationError ||
    error instanceof DatabaseSafetyError ||
    error instanceof HistoryConflictError ||
    error instanceof StorageConfigError
  const pgCode = (error as { code?: string }).code
  console.error(known ? error.message : `omen-db failed${pgCode ? ` [${pgCode}]` : ""}: ${(error as Error).message}`)
  process.exitCode = 1
})
