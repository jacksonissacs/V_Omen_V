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

const DEMO_ENVIRONMENTS = new Set(["development", "test"])

/**
 * Demo intelligence is an explicit non-production tool.
 * A missing mode, a missing NODE_ENV, or any production marker keeps it off.
 */
export function demoIntelligenceAllowed(env: Env = process.env): boolean {
  if (productionMarker(env)) return false
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() ?? ""
  if (!DEMO_ENVIRONMENTS.has(nodeEnv)) return false
  return env.OMEN_STORAGE_MODE?.trim() === "demo"
}

/**
 * Reads `OMEN_STORAGE_MODE` and, in database mode, `DATABASE_URL`.
 * An unset mode does not select the demo book. Demo mode is refused in
 * production and unless NODE_ENV is development or test. Database mode never
 * falls back to demo: a missing or malformed URL is an error. Messages never
 * include the URL itself.
 */
export function readStorageConfig(env: Env = process.env): StorageConfig {
  const rawMode = env.OMEN_STORAGE_MODE?.trim() ?? ""
  if (rawMode === "" || rawMode === "demo") {
    if (demoIntelligenceAllowed(env)) return { mode: "demo" }
    const marker = productionMarker(env)
    if (rawMode === "") {
      throw new StorageConfigError(
        marker
          ? `OMEN_STORAGE_MODE is not set (${marker}=production). Demo intelligence is not used.`
          : 'OMEN_STORAGE_MODE is not set. Set it to "database", or to "demo" in an explicit development or test environment.',
      )
    }
    if (marker) {
      throw new StorageConfigError(`Refusing demo intelligence: ${marker}=production.`)
    }
    throw new StorageConfigError(
      'OMEN_STORAGE_MODE=demo requires NODE_ENV to be development or test, with no production marker set.',
    )
  }
  if (rawMode !== "database") {
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
