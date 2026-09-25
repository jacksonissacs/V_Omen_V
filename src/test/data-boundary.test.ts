import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const SRC = path.resolve(__dirname, "..")

/**
 * Demo-only screens that still read `@/data/events` directly. They are outside the
 * V0 core workspace boundary; see docs/architecture.md. Do not add to this list.
 */
const LEGACY_FIXTURE_READERS = [
  "components/screens/markets-screen.tsx",
  "components/screens/signals-screen.tsx",
]

const SERVER_ONLY_MODULES = ["lib/data/repository.ts", "lib/data/mock-repository.ts"]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

function isClientModule(source: string): boolean {
  return /^\s*["']use client["']/.test(source)
}

function imports(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!)
}

const clientModules = sourceFiles(SRC)
  .map((file) => ({ file: path.relative(SRC, file), source: readFileSync(file, "utf8") }))
  .filter(({ source }) => isClientModule(source))

describe("server data boundary", () => {
  it("finds the client modules it is guarding", () => {
    const files = clientModules.map(({ file }) => file)
    expect(files).toContain("components/screens/pulse-screen.tsx")
    expect(files).toContain("components/layout/workspace-provider.tsx")
  })

  it("keeps the repository and its adapters out of client modules", () => {
    const offenders = clientModules.filter(({ source }) =>
      imports(source).some((specifier) => specifier.startsWith("@/lib/data/")),
    )
    expect(offenders.map(({ file }) => file)).toEqual([])
  })

  it("keeps seeded event fixtures out of core workspace client modules", () => {
    const offenders = clientModules
      .filter(({ source }) => imports(source).includes("@/data/events"))
      .map(({ file }) => file)
    expect(offenders.sort()).toEqual([...LEGACY_FIXTURE_READERS].sort())
  })

  it("marks the repository modules server-only", () => {
    for (const file of SERVER_ONLY_MODULES) {
      expect(readFileSync(path.join(SRC, file), "utf8")).toMatch(/^import "server-only"/)
    }
  })
})
