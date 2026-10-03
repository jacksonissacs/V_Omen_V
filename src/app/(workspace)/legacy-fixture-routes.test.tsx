import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NotFoundError, RedirectError } from "@/test/next-navigation"
import AgentsPage from "@/app/(workspace)/agents/page"
import AlertsPage from "@/app/(workspace)/alerts/page"
import MarketsPage from "@/app/(workspace)/markets/page"
import RelationsPage from "@/app/(workspace)/relations/page"
import ResearchPage from "@/app/(workspace)/research/page"
import SignalsPage from "@/app/(workspace)/signals/page"
import GraphRedirectPage from "@/app/graph/page"

const quarantined = [MarketsPage, SignalsPage, AgentsPage, ResearchPage, RelationsPage] as const

afterEach(() => {
  vi.unstubAllEnvs()
})

function production() {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("OMEN_STORAGE_MODE", "demo")
  vi.stubEnv("VERCEL_ENV", "production")
}

function developmentDemo() {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("OMEN_STORAGE_MODE", "demo")
  vi.stubEnv("VERCEL_ENV", "")
  vi.stubEnv("OMEN_DEPLOYMENT_ENV", "")
}

describe("legacy fixture routes", () => {
  it.each([
    ["markets", MarketsPage],
    ["signals", SignalsPage],
    ["agents", AgentsPage],
    ["research", ResearchPage],
    ["relations", RelationsPage],
  ] as const)("rejects /%s in production", async (_name, page) => {
    production()
    await expect(page()).rejects.toBeInstanceOf(NotFoundError)
  })

  it("rejects alerts and the graph redirect in production", () => {
    production()
    expect(() => AlertsPage()).toThrow(NotFoundError)
    expect(() => GraphRedirectPage()).toThrow(NotFoundError)
  })

  it("rejects the routes when demo mode is missing", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("OMEN_STORAGE_MODE", "")
    await expect(MarketsPage()).rejects.toBeInstanceOf(NotFoundError)
    expect(() => AlertsPage()).toThrow(NotFoundError)
  })

  it("still renders the demo book when development explicitly selects demo mode", async () => {
    developmentDemo()
    render(await MarketsPage())
    expect(screen.getByText("USD/CAD")).toBeInTheDocument()
    expect(screen.getByText("BoC Oct cut")).toBeInTheDocument()
  })

  it("still renders labeled illustrative figures when development explicitly selects demo mode", async () => {
    developmentDemo()
    render(await AgentsPage())
    expect(screen.getByTestId("agents-illustrative-banner")).toHaveTextContent(/Illustrative demo figures/i)

    render(await RelationsPage())
    expect(screen.getByText("0.73")).toBeInTheDocument()

    render(AlertsPage())
    expect(screen.getByText("BoC Oct cut > 70%")).toBeInTheDocument()
  })

  it("redirects /graph to relations only when the demo book is explicit", () => {
    developmentDemo()
    expect(() => GraphRedirectPage()).toThrow(RedirectError)
    try {
      GraphRedirectPage()
    } catch (error) {
      expect(error).toBeInstanceOf(RedirectError)
      expect((error as RedirectError).url).toBe("/relations")
    }
  })

  it("does not render fixture copy when production calls the page functions", async () => {
    production()
    for (const page of quarantined) {
      await expect(page()).rejects.toBeInstanceOf(NotFoundError)
    }
    expect(() => AlertsPage()).toThrow(NotFoundError)
  })
})
