import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("consumer workspace CSS foundation", () => {
  const css = readFileSync(join(process.cwd(), "src/app/aion-workspace.css"), "utf8")

  it("raises muted text contrast and defines the spacing scale", () => {
    expect(css).toMatch(/--a-tx-2:\s*#7c848e/)
    expect(css).toMatch(/--a-sp-1:\s*4px/)
    expect(css).toMatch(/--a-sp-7:\s*48px/)
  })

  it("uses a 1.5px accent focus ring with 2px offset", () => {
    expect(css).toMatch(/outline:\s*1\.5px solid var\(--a-accent\)/)
    expect(css).toMatch(/outline-offset:\s*2px/)
  })

  it("honours prefers-reduced-motion with 0ms transitions", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/transition-duration:\s*0ms/)
  })

  it("does not hide the provenance chip at phone widths", () => {
    expect(css).not.toMatch(/\.aion-demo-chip\s*\{\s*display:\s*none/)
    expect(css).toMatch(/\.aion-demo-chip\s*\{\s*display:\s*inline-flex/)
  })

  it("reserves a labelled bottom navigation row on phone widths", () => {
    expect(css).toMatch(/\.aion-mobile-nav/)
    expect(css).toMatch(/--a-mobile-nav:\s*64px/)
    expect(css).toMatch(/min-height:\s*44px/)
  })

  it("keeps scan-card actions wrapping without a horizontal-only overflow row", () => {
    expect(css).toMatch(/\.aion-card-actions\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(css).toMatch(/\.aion-card-actions\s*\{[^}]*overflow-x:\s*visible/s)
    expect(css).toMatch(/\.aion-card-actions \.aion-button\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.aion-card-question/)
    expect(css).toMatch(/\.aion-card-to\s*\{[^}]*font-size:\s*28px/s)
  })
})
