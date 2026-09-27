import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@/test/next-navigation"
import { mockPathname, mockPush } from "@/test/next-navigation"

import { AppShell } from "@/components/layout/app-shell"
import { PulseScreen } from "@/components/screens/pulse-screen"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"

const repository = new MockIntelligenceRepository()

function stubCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("760px") ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  })
}

function restoreDesktopViewport() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

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

afterEach(() => {
  restoreDesktopViewport()
  mockPathname.mockReturnValue("/")
  mockPush.mockClear()
})

describe("AppShell desktop navigation", () => {
  it("promotes Pulse, Explore, Following, and More — not unfinished destinations", async () => {
    stubCompactViewport(false)
    mockPathname.mockReturnValue("/pulse")
    await renderPulse()

    expect(screen.getByRole("heading", { name: "Pulse", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "OMEN workspace home" })).toHaveAttribute("href", "/pulse")
    expect(screen.getByRole("link", { name: "Pulse" })).toHaveAttribute("href", "/pulse")
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/events")
    expect(screen.getByRole("link", { name: "Following" })).toHaveAttribute("href", "/watchlists")
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Archive" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument()
    for (const label of ["Markets", "Signals", "Agents", "Research", "Relations", "Alerts", "Team", "API"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument()
    }
    expect(screen.queryByText(/Alan/)).not.toBeInTheDocument()
    expect(screen.getByText("Demo data")).toBeInTheDocument()
  })

  it("opens More with Archive and the public page, and closes on Escape", async () => {
    stubCompactViewport(false)
    mockPathname.mockReturnValue("/pulse")
    const user = userEvent.setup()
    await renderPulse()

    await user.click(screen.getByRole("button", { name: "More" }))
    const more = screen.getByRole("dialog", { name: "More" })
    expect(within(more).getByRole("link", { name: /Archive/ })).toHaveAttribute("href", "/archive")
    expect(within(more).getByRole("link", { name: /Public OMEN page/ })).toHaveAttribute("href", "/")
    expect(within(more).queryByText(/does not query stored history/i)).not.toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument()
  })

  it("filters the pulse by category and opens the command palette with consumer destinations", async () => {
    stubCompactViewport(false)
    mockPathname.mockReturnValue("/pulse")
    const user = userEvent.setup()
    await renderPulse()

    await user.click(screen.getByRole("button", { name: "AI" }))
    expect(
      screen.getByText("Will a U.S. frontier lab publicly release a new frontier-class model before 1 December 2026?"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Will the Bank of Canada cut the overnight rate at the 28–29 October 2026 decision?"),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Search" }))
    const palette = screen.getByRole("dialog", { name: "Command palette" })
    expect(palette).toBeInTheDocument()
    expect(within(palette).queryByRole("option", { name: "Why did rate-cut odds move today?" })).not.toBeInTheDocument()
    expect(within(palette).queryByRole("option", { name: "Alert if BoC October cut exceeds 70%" })).not.toBeInTheDocument()
    expect(within(palette).queryByRole("option", { name: "Agents" })).not.toBeInTheDocument()
    expect(within(palette).queryByRole("option", { name: "Settings" })).not.toBeInTheDocument()
    expect(within(palette).getByRole("option", { name: "Pulse" })).toBeInTheDocument()
    expect(within(palette).getByRole("option", { name: "Explore" })).toBeInTheDocument()
    expect(within(palette).getByRole("option", { name: "Following" })).toBeInTheDocument()
    expect(within(palette).getByRole("option", { name: "Archive" })).toBeInTheDocument()
    expect(within(palette).getByText("↑↓ navigate")).toBeInTheDocument()
    expect(within(palette).getByText("↵ run")).toBeInTheDocument()
    expect(within(palette).getByText("esc close")).toBeInTheDocument()
  })

  it("runs the highlighted command palette item with arrow keys and Enter", async () => {
    stubCompactViewport(false)
    mockPathname.mockReturnValue("/pulse")
    const user = userEvent.setup()
    await renderPulse()

    await user.click(screen.getByRole("button", { name: "Search" }))
    const palette = screen.getByRole("dialog", { name: "Command palette" })
    await user.keyboard("{ArrowDown}")
    expect(within(palette).getByRole("option", { name: "Explore" })).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{Enter}")
    expect(mockPush).toHaveBeenCalledWith("/events")
  })
})

describe("AppShell mobile navigation", () => {
  it("shows labelled Pulse, Explore, Following, and More without an icon-only rail", async () => {
    stubCompactViewport(true)
    mockPathname.mockReturnValue("/pulse")
    await renderPulse()

    const nav = screen.getByRole("navigation", { name: "Consumer navigation" })
    expect(within(nav).getByRole("link", { name: "Pulse" })).toHaveAttribute("href", "/pulse")
    expect(within(nav).getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/events")
    expect(within(nav).getByRole("link", { name: "Following" })).toHaveAttribute("href", "/watchlists")
    expect(within(nav).getByRole("button", { name: "More" })).toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: "Workspace navigation" })).not.toBeInTheDocument()
    expect(within(nav).queryByRole("link", { name: "Archive" })).not.toBeInTheDocument()
  })

  it("opens More to Archive and the public page, then closes on Escape", async () => {
    stubCompactViewport(true)
    mockPathname.mockReturnValue("/pulse")
    const user = userEvent.setup()
    await renderPulse()

    await user.click(screen.getByRole("button", { name: "More" }))
    const more = screen.getByRole("dialog", { name: "More" })
    expect(within(more).getByRole("link", { name: /Archive/ })).toHaveAttribute("href", "/archive")
    expect(within(more).getByRole("link", { name: /Public OMEN page/ })).toHaveAttribute("href", "/")

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument()
  })

  it("marks the Pulse destination active on /pulse", async () => {
    stubCompactViewport(true)
    mockPathname.mockReturnValue("/pulse")
    await renderPulse()
    const nav = screen.getByRole("navigation", { name: "Consumer navigation" })
    expect(within(nav).getByRole("link", { name: "Pulse" })).toHaveAttribute("data-active", "true")
    expect(within(nav).getByRole("link", { name: "Explore" })).toHaveAttribute("data-active", "false")
  })
})

describe("provenance chip visibility contract", () => {
  it("keeps the provenance chip in the mobile shell DOM", async () => {
    stubCompactViewport(true)
    mockPathname.mockReturnValue("/pulse")
    await renderPulse()
    const chip = screen.getByText("Demo data")
    expect(chip).toHaveClass("aion-demo-chip")
    expect(chip).toBeInTheDocument()
  })
})
