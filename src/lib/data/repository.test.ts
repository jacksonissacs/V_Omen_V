// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { MockIntelligenceRepository } from "@/lib/data/mock-repository"
import { PostgresIntelligenceRepository } from "@/lib/data/postgres-repository"
import {
  __resetRepositoryForTests,
  getRepository,
  summarizeProvenance,
} from "@/lib/data/repository"
import { RepositoryUnavailableError } from "@/lib/data/repository-errors"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  __resetRepositoryForTests()
})

function useStorage(mode: string | undefined, url?: string) {
  vi.stubEnv("OMEN_STORAGE_MODE", mode as string)
  vi.stubEnv("DATABASE_URL", url as string)
  __resetRepositoryForTests()
}

describe("getRepository storage selection", () => {
  it("does not serve the demo book when the mode is unset", async () => {
    vi.stubEnv("NODE_ENV", "development")
    useStorage(undefined)
    const repository = getRepository()
    expect(repository).not.toBeInstanceOf(MockIntelligenceRepository)
    expect(repository.storage).toBe("misconfigured")
    await expect(repository.listEvents()).rejects.toThrow(/OMEN_STORAGE_MODE is not set/)
    await expect(repository.getEvent("evt-boc-cut")).rejects.toThrow(RepositoryUnavailableError)
  })

  it("uses the demo adapter only when demo mode is explicit outside production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    useStorage("demo")
    const repository = getRepository()
    expect(repository).toBeInstanceOf(MockIntelligenceRepository)
    expect(repository.storage).toBe("demo")
    const events = await repository.listEvents()
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => event.provenance === "demo")).toBe(true)
  })

  it("refuses the demo adapter in production even when demo mode is set", async () => {
    vi.stubEnv("NODE_ENV", "production")
    useStorage("demo", "postgres://omen:s3cret@127.0.0.1:1/omen")
    const repository = getRepository()
    expect(repository).not.toBeInstanceOf(MockIntelligenceRepository)
    const failure = await repository.listEvents().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(RepositoryUnavailableError)
    expect((failure as Error).message).toMatch(/NODE_ENV=production/)
    expect((failure as Error).message).not.toContain("s3cret")
    await expect(repository.getEvent("evt-boc-cut")).rejects.toThrow(RepositoryUnavailableError)
  })

  it("uses the PostgreSQL adapter in production database mode", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    useStorage("database", "postgres://omen:pw@127.0.0.1:1/omen_missing")
    const repository = getRepository()
    expect(repository).toBeInstanceOf(PostgresIntelligenceRepository)
    expect(repository.storage).toBe("database")
  })

  it("uses the PostgreSQL adapter in database mode", () => {
    useStorage("database", "postgres://omen:pw@127.0.0.1:1/omen_missing")
    const repository = getRepository()
    expect(repository).toBeInstanceOf(PostgresIntelligenceRepository)
    expect(repository.storage).toBe("database")
  })

  it("fails every read in database mode without DATABASE_URL instead of serving demo data", async () => {
    useStorage("database")
    const repository = getRepository()
    expect(repository.storage).toBe("database")
    expect(repository).not.toBeInstanceOf(MockIntelligenceRepository)
    await expect(repository.listEvents()).rejects.toThrow(RepositoryUnavailableError)
    await expect(repository.getEvent("evt-boc-cut")).rejects.toThrow(
      "OMEN_STORAGE_MODE=database requires DATABASE_URL.",
    )
    await expect(repository.listFollowedEventIds()).rejects.toThrow(RepositoryUnavailableError)
    await expect(repository.reconstructEvent("evt-boc-cut", "1")).rejects.toThrow(RepositoryUnavailableError)
    await expect(repository.listHistoryCheckpoints("evt-boc-cut")).rejects.toThrow(RepositoryUnavailableError)
  })

  it("fails every read for an unknown storage mode", async () => {
    useStorage("sqlite")
    const repository = getRepository()
    expect(repository.storage).toBe("misconfigured")
    await expect(repository.listEvents()).rejects.toThrow(/must be "demo" or "database"/)
  })

  it("rejects with RepositoryUnavailableError when PostgreSQL is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    useStorage("database", "postgres://omen:s3cret@127.0.0.1:1/omen_unreachable")
    const repository = getRepository()
    const failure = await repository.listEvents().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(RepositoryUnavailableError)
    expect((failure as Error).message).toBe("Could not connect to PostgreSQL storage.")
    expect((failure as Error).message).not.toContain("s3cret")
  })
})

describe("summarizeProvenance", () => {
  it("keeps demo, sourced and mixed books distinct", () => {
    expect(summarizeProvenance([])).toBe("none")
    expect(summarizeProvenance([{ provenance: "demo" }, { provenance: "demo" }])).toBe("demo")
    expect(summarizeProvenance([{ provenance: "sourced" }])).toBe("sourced")
    expect(summarizeProvenance([{ provenance: "demo" }, { provenance: "sourced" }])).toBe("mixed")
  })
})
