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
  it("keeps Pulse and Following as the launch destinations", async () => {
    await renderPulse()

    expect(screen.getByRole("heading", { name: "Pulse", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "OMEN workspace home" })).toHaveAttribute("href", "/pulse")
    expect(screen.getByRole("link", { name: "Pulse" })).toHaveAttribute("href", "/pulse")
    expect(screen.getByRole("link", { name: "Following" })).toHaveAttribute("href", "/watchlists")
    expect(screen.getByRole("link", { name: /Archive/ })).toHaveAttribute("href", "/archive")
    expect(screen.getByRole("link", { name: "Events book" })).toHaveAttribute("href", "/events")
    expect(screen.getByRole("link", { name: /Markets/ })).toHaveAttribute("href", "/markets")
    expect(screen.queryByRole("link", { name: "Intelligence" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Watchlists" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Alan/)).not.toBeInTheDocument()
    expect(screen.queryByText("1,847")).not.toBeInTheDocument()
    expect(screen.getByText("Demo data")).toBeInTheDocument()
  })

  it("filters the pulse by category and opens event search", async () => {
    const user = userEvent.setup()
    await renderPulse()

    await user.click(screen.getByRole("button", { name: "AI" }))
    expect(screen.getByText("Frontier model released before December 1")).toBeInTheDocument()
    expect(screen.queryByText("Bank of Canada cuts rates in October")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Search events" }))
    expect(screen.getByRole("dialog", { name: "Search events" })).toBeInTheDocument()
  })
})
