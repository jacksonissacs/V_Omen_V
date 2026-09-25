import { randomBytes } from "node:crypto"

import { Client } from "pg"

import { identifyDatabase, loadMigrations, migrate } from "@/lib/db/migrate"

const DISPOSABLE_PREFIX = "omen_test_"

export function testAdminUrl(): string {
  const url = process.env.OMEN_TEST_DATABASE_ADMIN_URL?.trim()
  if (!url) {
    throw new Error(
      "BLOCKED: OMEN_TEST_DATABASE_ADMIN_URL is not set, so PostgreSQL integration tests cannot run. See docs/database.md.",
    )
  }
  return url
}

export interface DisposableDatabase {
  name: string
  url: string
  drop(): Promise<void>
}

async function asAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testAdminUrl(), application_name: "omen-test-harness" })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Creates a uniquely named, empty database. `drop` only ever removes databases this harness named. */
export async function createDisposableDatabase(): Promise<DisposableDatabase> {
  const name = `${DISPOSABLE_PREFIX}${process.pid}_${randomBytes(4).toString("hex")}`
  await asAdmin((client) => client.query(`CREATE DATABASE ${name}`))
  const url = new URL(testAdminUrl())
  url.pathname = `/${name}`
  return {
    name,
    url: url.toString(),
    drop: async () => {
      if (!/^omen_test_\d+_[0-9a-f]{8}$/.test(name)) throw new Error(`Refusing to drop ${name}`)
      await asAdmin((client) => client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`))
    },
  }
}

export async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, application_name: "omen-test" })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** A disposable database identified as `test` with every migration applied. */
export async function createMigratedDatabase(): Promise<DisposableDatabase> {
  const database = await createDisposableDatabase()
  await withClient(database.url, async (client) => {
    await identifyDatabase(client, "test", `vitest ${database.name}`)
    await migrate(client, loadMigrations())
  })
  return database
}
