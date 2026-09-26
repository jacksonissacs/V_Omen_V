/** @vitest-environment node */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../../..")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe("intake stays outside published history and the HTTP surface", () => {
  it("does not publish evidence, assign a probability, or schedule itself", () => {
    const files = [
      ...sourceFiles(path.join(ROOT, "src/lib/intake")).filter((file) => !file.endsWith(".test.ts")),
      path.join(ROOT, "scripts/omen-intake.ts"),
    ]
    const forbidden = ["writeEventBundle", "probabilityPct", "currentProbability", "setInterval", "child_process", "DATABASE_URL", "eval(", "new Function"]
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      for (const token of forbidden) {
        expect(source, `${path.relative(ROOT, file)} contains ${token}`).not.toContain(token)
      }
    }
    const command = readFileSync(path.join(ROOT, "scripts/omen-intake.ts"), "utf8")
    expect(command).not.toContain("server-only")
    expect(command).not.toContain("./adapter")
  })

  it("has no app route that can receive a source URL", () => {
    const appFiles = sourceFiles(path.join(ROOT, "src/app"))
    const offenders = appFiles.filter((file) => {
      const source = readFileSync(file, "utf8")
      return source.includes("lib/intake") || source.includes("omen-intake") || source.includes("cisa-kev")
    })
    expect(offenders).toEqual([])
  })
})
