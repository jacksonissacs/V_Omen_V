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
  it("uses the demo adapter when the mode is unset", async () => {
    useStorage(undefined)
    const repository = getRepository()
    expect(repository).toBeInstanceOf(MockIntelligenceRepository)
    expect(repository.storage).toBe("demo")
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
