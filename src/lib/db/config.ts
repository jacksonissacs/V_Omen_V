export const STORAGE_MODES = ["demo", "database"] as const
export type StorageMode = (typeof STORAGE_MODES)[number]

export type StorageConfig =
  | { mode: "demo" }
  | { mode: "database"; connectionString: string }

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StorageConfigError"
  }
}

type Env = Record<string, string | undefined>

/**
 * Reads `OMEN_STORAGE_MODE` and, in database mode, `DATABASE_URL`.
 * An unset mode means demo. Database mode never falls back to demo: a missing
 * or malformed URL is an error. Messages never include the URL itself.
 */
export function readStorageConfig(env: Env = process.env): StorageConfig {
  const rawMode = env.OMEN_STORAGE_MODE?.trim() ?? ""
  const mode = rawMode === "" ? "demo" : rawMode
  if (mode === "demo") return { mode: "demo" }
  if (mode !== "database") {
    throw new StorageConfigError(
      `OMEN_STORAGE_MODE must be "demo" or "database" (received "${rawMode}").`,
    )
  }
  const connectionString = env.DATABASE_URL?.trim() ?? ""
  if (!connectionString) {
    throw new StorageConfigError("OMEN_STORAGE_MODE=database requires DATABASE_URL.")
  }
  assertPostgresUrl(connectionString, "DATABASE_URL")
  return { mode: "database", connectionString }
}

export function assertPostgresUrl(value: string, name: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StorageConfigError(`${name} is not a valid URL.`)
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new StorageConfigError(`${name} must use the postgres:// or postgresql:// scheme.`)
  }
  if (!url.pathname || url.pathname === "/") {
    throw new StorageConfigError(`${name} must name a database.`)
  }
}

const PRODUCTION_MARKERS = ["NODE_ENV", "VERCEL_ENV", "OMEN_DEPLOYMENT_ENV"] as const

/** Returns the first environment variable that marks this process as production, if any. */
export function productionMarker(env: Env = process.env): string | undefined {
  return PRODUCTION_MARKERS.find((name) => env[name]?.trim().toLowerCase() === "production")
}
