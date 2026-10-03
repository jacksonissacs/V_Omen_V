import { describe, expect, it } from "vitest"

import { demoIntelligenceAllowed, productionMarker, readStorageConfig, StorageConfigError } from "@/lib/db/config"

const SECRET_URL = "postgres://omen:s3cret-password@db.internal:5432/omen"

describe("readStorageConfig", () => {
  it("does not select demo storage when the mode is unset or blank", () => {
    expect(() => readStorageConfig({})).toThrow(/OMEN_STORAGE_MODE is not set/)
    expect(() => readStorageConfig({ OMEN_STORAGE_MODE: "  " })).toThrow(/OMEN_STORAGE_MODE is not set/)
    expect(() => readStorageConfig({ NODE_ENV: "development" })).toThrow(/OMEN_STORAGE_MODE is not set/)
    expect(() => readStorageConfig({ NODE_ENV: "production" })).toThrow(/NODE_ENV=production/)
  })

  it("allows demo storage only in an explicit development or test environment", () => {
    expect(readStorageConfig({ OMEN_STORAGE_MODE: "demo", NODE_ENV: "development" })).toEqual({ mode: "demo" })
    expect(readStorageConfig({ OMEN_STORAGE_MODE: "demo", NODE_ENV: "test" })).toEqual({ mode: "demo" })
    expect(() => readStorageConfig({ OMEN_STORAGE_MODE: "demo" })).toThrow(/development or test/)
    expect(() => readStorageConfig({ OMEN_STORAGE_MODE: "demo", NODE_ENV: "production" })).toThrow(
      /NODE_ENV=production/,
    )
    expect(() =>
      readStorageConfig({ OMEN_STORAGE_MODE: "demo", NODE_ENV: "development", VERCEL_ENV: "production" }),
    ).toThrow(/VERCEL_ENV=production/)
  })

  it("ignores DATABASE_URL in an explicit demo environment", () => {
    expect(
      readStorageConfig({ OMEN_STORAGE_MODE: "demo", NODE_ENV: "test", DATABASE_URL: SECRET_URL }),
    ).toEqual({ mode: "demo" })
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

describe("demoIntelligenceAllowed", () => {
  it("fails closed unless demo mode and a non-production environment are both explicit", () => {
    expect(demoIntelligenceAllowed({})).toBe(false)
    expect(demoIntelligenceAllowed({ OMEN_STORAGE_MODE: "demo" })).toBe(false)
    expect(demoIntelligenceAllowed({ NODE_ENV: "development" })).toBe(false)
    expect(demoIntelligenceAllowed({ NODE_ENV: "development", OMEN_STORAGE_MODE: "database" })).toBe(false)
    expect(demoIntelligenceAllowed({ NODE_ENV: "production", OMEN_STORAGE_MODE: "demo" })).toBe(false)
    expect(demoIntelligenceAllowed({ NODE_ENV: "test", OMEN_STORAGE_MODE: "demo", OMEN_DEPLOYMENT_ENV: "production" })).toBe(
      false,
    )
    expect(demoIntelligenceAllowed({ NODE_ENV: "development", OMEN_STORAGE_MODE: "demo" })).toBe(true)
    expect(demoIntelligenceAllowed({ NODE_ENV: "test", OMEN_STORAGE_MODE: " demo " })).toBe(true)
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
