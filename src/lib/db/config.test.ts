import { describe, expect, it } from "vitest"

import { productionMarker, readStorageConfig, StorageConfigError } from "@/lib/db/config"

const SECRET_URL = "postgres://omen:s3cret-password@db.internal:5432/omen"

describe("readStorageConfig", () => {
  it("defaults to demo storage when the mode is unset or blank", () => {
    expect(readStorageConfig({})).toEqual({ mode: "demo" })
    expect(readStorageConfig({ OMEN_STORAGE_MODE: "  " })).toEqual({ mode: "demo" })
  })

  it("ignores DATABASE_URL in demo mode", () => {
    expect(readStorageConfig({ OMEN_STORAGE_MODE: "demo", DATABASE_URL: SECRET_URL })).toEqual({ mode: "demo" })
  })

  it("returns the connection string in database mode", () => {
    expect(readStorageConfig({ OMEN_STORAGE_MODE: "database", DATABASE_URL: SECRET_URL })).toEqual({
      mode: "database",
      connectionString: SECRET_URL,
    })
  })

  it("rejects unknown modes instead of guessing", () => {
    expect(() => readStorageConfig({ OMEN_STORAGE_MODE: "postgres" })).toThrow(StorageConfigError)
    expect(() => readStorageConfig({ OMEN_STORAGE_MODE: "Database" })).toThrow(/must be "demo" or "database"/)
  })

  it("rejects database mode without a URL", () => {
    expect(() => readStorageConfig({ OMEN_STORAGE_MODE: "database" })).toThrow(
      "OMEN_STORAGE_MODE=database requires DATABASE_URL.",
    )
  })

  it.each([
    ["not a url", /not a valid URL/],
    ["mysql://omen:s3cret-password@db.internal/omen", /postgres:\/\/ or postgresql:\/\//],
    ["postgres://omen:s3cret-password@db.internal:5432", /must name a database/],
  ])("rejects a malformed DATABASE_URL (%s) without echoing it", (url, message) => {
    let error: unknown
    try {
      readStorageConfig({ OMEN_STORAGE_MODE: "database", DATABASE_URL: url })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(StorageConfigError)
    expect((error as Error).message).toMatch(message)
    expect((error as Error).message).not.toContain("s3cret-password")
  })
})

describe("productionMarker", () => {
  it("names the variable that marks the process as production", () => {
    expect(productionMarker({})).toBeUndefined()
    expect(productionMarker({ NODE_ENV: "development" })).toBeUndefined()
    expect(productionMarker({ NODE_ENV: "production" })).toBe("NODE_ENV")
    expect(productionMarker({ VERCEL_ENV: "production" })).toBe("VERCEL_ENV")
    expect(productionMarker({ OMEN_DEPLOYMENT_ENV: "Production" })).toBe("OMEN_DEPLOYMENT_ENV")
  })
})
