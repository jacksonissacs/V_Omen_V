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

describe("analyst stays outside autonomous publish and the HTTP write surface", () => {
  it("does not schedule itself, browse arbitrarily, or expose a public write route", () => {
    const files = [
      ...sourceFiles(path.join(ROOT, "src/lib/analyst")).filter((file) => !file.endsWith(".test.ts")),
      path.join(ROOT, "scripts/omen-analyst.ts"),
    ]
    const forbidden = ["setInterval", "setTimeout(", "child_process", "eval(", "new Function", "fetch("]
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      for (const token of forbidden) {
        // execute.ts uses setTimeout only for provider AbortSignal bounds — allow that file for setTimeout.
        if (token === "setTimeout(" && file.endsWith("execute.ts")) continue
        expect(source, `${path.relative(ROOT, file)} contains ${token}`).not.toContain(token)
      }
    }

    const appFiles = sourceFiles(path.join(ROOT, "src/app"))
    const offenders = appFiles.filter((file) => {
      const source = readFileSync(file, "utf8")
      return source.includes("lib/analyst") || source.includes("omen-analyst")
    })
    expect(offenders).toEqual([])
  })

  it("keeps publishApprovedReviewItem from treating analyst proposals as bundles", () => {
    const publication = readFileSync(path.join(ROOT, "src/lib/db/publication.ts"), "utf8")
    expect(publication).toContain('item.payload.kind === "analyst_proposal"')
    const bundle = readFileSync(path.join(ROOT, "src/lib/db/publication-bundle.ts"), "utf8")
    expect(bundle).toContain('candidate.kind === "analyst_proposal"')
    expect(bundle).toContain("dedicated analyst staging workflow")
  })
})
