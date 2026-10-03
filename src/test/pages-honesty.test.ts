import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

function readRepo(relative: string) {
  return readFileSync(path.join(ROOT, relative), "utf8")
}

describe("GitHub Pages honesty", () => {
  it("tells README visitors that Pages is not the hosted application", () => {
    const readme = readRepo("README.md")

    expect(readme).toMatch(/GitHub Pages is not the OMEN application/i)
    expect(readme).toMatch(/not publicly hosted yet/i)
    expect(readme).toMatch(/## Local demo/)
    expect(readme).toMatch(/localhost:3000\/pulse/)
    expect(readme).toMatch(/cp \.env\.example \.env\.local/)
    expect(readme).not.toMatch(/accessible-me-assignment/)
    expect(readme).toMatch(/AI and technology in North America/)
  })

  it("makes the Pages homepage and missing-route page refuse an app-preview reading", () => {
    const index = readRepo("index.html")
    const missing = readRepo("404.html")

    for (const page of [index, missing]) {
      expect(page).toMatch(/not the OMEN application/i)
      expect(page).toMatch(/\/pulse/)
      expect(page).toMatch(/local/i)
      expect(page).not.toMatch(/Explore the demo/)
    }

    expect(index).toMatch(/not publicly hosted yet/)
    expect(missing).toMatch(/not a public preview/)
  })
})
