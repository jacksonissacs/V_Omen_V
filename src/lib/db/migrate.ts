import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import type { ClientBase } from "pg"

import { productionMarker } from "./config"
import {
  DATABASE_ENVIRONMENTS,
  IDENTITY_TABLE,
  MIGRATIONS_TABLE,
  type DatabaseEnvironment,
} from "./schema-version"

export class DatabaseSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DatabaseSafetyError"
  }
}

export interface Migration {
  version: number
  name: string
  sql: string
  checksum: string
}

export interface DatabaseIdentity {
  environment: DatabaseEnvironment
  label: string
  createdAt: string
}

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/

export function defaultMigrationsDir(): string {
  return path.join(process.cwd(), "db", "migrations")
}

export function loadMigrations(dir: string = defaultMigrationsDir()): Migration[] {
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => {
      const match = MIGRATION_FILE.exec(file)
      if (!match) throw new Error(`Migration file ${file} must be named NNNN_snake_case.sql`)
      const sql = readFileSync(path.join(dir, file), "utf8")
      return {
        version: Number(match[1]),
        name: match[2],
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      }
    })
    .sort((a, b) => a.version - b.version)
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migrations must be numbered consecutively from 0001; found ${migration.version}`)
    }
  })
  return migrations
}

async function tableExists(client: ClientBase, table: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${table}`],
  )
  return rows[0].exists
}

async function userRelationCount(client: ClientBase): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')`,
  )
  return Number(rows[0].count)
}

export async function readIdentity(client: ClientBase): Promise<DatabaseIdentity | undefined> {
  if (!(await tableExists(client, IDENTITY_TABLE))) return undefined
  const { rows } = await client.query<{ environment: string; label: string; created_at: Date }>(
    `SELECT environment, label, created_at FROM ${IDENTITY_TABLE}`,
  )
  const row = rows[0]
  if (!row) return undefined
  return {
    environment: row.environment as DatabaseEnvironment,
    label: row.label,
    createdAt: row.created_at.toISOString(),
  }
}

/**
 * Refuses to continue unless this process is not marked production and the
 * target database carries a nonproduction identity recorded by this tooling.
 */
export async function assertWritableDatabase(
  client: ClientBase,
  env: Record<string, string | undefined> = process.env,
): Promise<DatabaseIdentity> {
  const marker = productionMarker(env)
  if (marker) {
    throw new DatabaseSafetyError(`Refusing to write: ${marker}=production.`)
  }
  const identity = await readIdentity(client)
  if (!identity) {
    throw new DatabaseSafetyError(
      "Refusing to write: the target database has no OMEN identity. Identify an empty database with `npm run db:migrate -- --identify <development|test|demo>`.",
    )
  }
  if (!(DATABASE_ENVIRONMENTS as readonly string[]).includes(identity.environment)) {
    throw new DatabaseSafetyError(
      `Refusing to write: database identity "${identity.environment}" is not a nonproduction environment.`,
    )
  }
  return identity
}

/**
 * Records a nonproduction identity on a database that has no user relations.
 * A database that already holds tables is never adopted.
 */
export async function identifyDatabase(
  client: ClientBase,
  environment: DatabaseEnvironment,
  label: string,
  env: Record<string, string | undefined> = process.env,
): Promise<DatabaseIdentity> {
  const marker = productionMarker(env)
  if (marker) throw new DatabaseSafetyError(`Refusing to identify a database: ${marker}=production.`)
  if (!(DATABASE_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new DatabaseSafetyError(
      `Database environment must be one of ${DATABASE_ENVIRONMENTS.join(", ")}.`,
    )
  }
  if (!label.trim()) throw new DatabaseSafetyError("A database identity needs a label.")

  const existing = await readIdentity(client)
  if (existing) {
    if (existing.environment !== environment) {
      throw new DatabaseSafetyError(
        `Database is already identified as "${existing.environment}", not "${environment}".`,
      )
    }
    return existing
  }
  if ((await userRelationCount(client)) > 0) {
    throw new DatabaseSafetyError(
      "Refusing to identify a database that already contains tables. Use a new, empty database.",
    )
  }

  await client.query("BEGIN")
  try {
    await client.query(
      `CREATE TABLE ${IDENTITY_TABLE} (
         singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
         environment text NOT NULL CHECK (environment IN (${DATABASE_ENVIRONMENTS.map((value) => `'${value}'`).join(", ")})),
         label text NOT NULL CHECK (char_length(btrim(label)) > 0),
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await client.query(
      `CREATE TABLE ${MIGRATIONS_TABLE} (
         version integer PRIMARY KEY,
         name text NOT NULL,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await client.query(`INSERT INTO ${IDENTITY_TABLE} (environment, label) VALUES ($1, $2)`, [
      environment,
      label.trim(),
    ])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
  return (await readIdentity(client))!
}

export interface MigrationResult {
  identity: DatabaseIdentity
  applied: Migration[]
  alreadyApplied: number
}

const MIGRATION_LOCK_KEY = 7_406_183_201

export async function migrate(
  client: ClientBase,
  migrations: Migration[] = loadMigrations(),
  env: Record<string, string | undefined> = process.env,
): Promise<MigrationResult> {
  const identity = await assertWritableDatabase(client, env)
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY])
  try {
    const { rows } = await client.query<{ version: number; name: string; checksum: string }>(
      `SELECT version, name, checksum FROM ${MIGRATIONS_TABLE} ORDER BY version`,
    )
    const known = new Map(migrations.map((migration) => [migration.version, migration]))
    for (const row of rows) {
      const migration = known.get(row.version)
      if (!migration) {
        throw new DatabaseSafetyError(
          `Database has migration ${row.version} (${row.name}) that this checkout does not know.`,
        )
      }
      if (migration.checksum !== row.checksum) {
        throw new DatabaseSafetyError(
          `Migration ${row.version} (${row.name}) was edited after it was applied. Add a new migration instead.`,
        )
      }
    }
    const appliedVersions = new Set(rows.map((row) => row.version))
    const pending = migrations.filter((migration) => !appliedVersions.has(migration.version))
    for (const migration of pending) {
      await client.query("BEGIN")
      try {
        await client.query(migration.sql)
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    }
    return { identity, applied: pending, alreadyApplied: rows.length }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
  }
}
