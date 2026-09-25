import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { AppShell } from "@/components/layout/app-shell"
import { PulseScreen } from "@/components/screens/pulse-screen"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"

const repository = new MockIntelligenceRepository()

async function renderPulse() {
  const [events, anomaly] = await Promise.all([
    repository.listEvents({ order: "catalog" }),
    repository.getFeaturedAnomaly(),
  ])
  return render(
    <AppShell>
      <PulseScreen events={events} anomaly={anomaly} />
    </AppShell>,
  )
}

describe("AppShell", () => {
  it("renders routed navigation for the major product areas", async () => {
    await renderPulse()

    expect(screen.getByRole("heading", { name: "Pulse", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "OMEN workspace home" })).toHaveAttribute("href", "/pulse")
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/pulse")
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events")
    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("href", "/markets")
    expect(screen.getByRole("link", { name: "Signals" })).toHaveAttribute("href", "/signals")
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("href", "/agents")
    expect(screen.getByRole("link", { name: "Watchlists" })).toHaveAttribute("href", "/watchlists")
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research")
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
    expect(screen.getByText("Demo data")).toBeInTheDocument()
  })

  it("filters the pulse by category and opens the command palette", async () => {
    const user = userEvent.setup()
    await renderPulse()

    await user.click(screen.getByRole("button", { name: "AI" }))
    expect(screen.getByText("Frontier model released before December 1")).toBeInTheDocument()
    expect(screen.queryByText("Bank of Canada cuts rates in October")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Ask OMEN" }))
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument()
  })
})
