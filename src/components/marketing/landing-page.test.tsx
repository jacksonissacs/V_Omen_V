import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import MarketingLayout from "@/app/(marketing)/layout"
import LandingPage from "@/app/(marketing)/page"

beforeEach(() => {
  // jsdom has no canvas; exercise the spectrum's static fallback quietly.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderLanding() {
  return render(
    <MarketingLayout>
      <LandingPage />
    </MarketingLayout>,
  )
}

describe("landing page", () => {
  it("routes every primary CTA to the demo workspace and never to a signup", () => {
    renderLanding()
    const ctas = screen.getAllByRole("link", { name: "Explore the demo" })
    expect(ctas.length).toBeGreaterThanOrEqual(3) // top bar, hero, final CTA
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/pulse")

    const secondary = screen.getAllByRole("link", { name: "See how it works" })
    expect(secondary).toHaveLength(2)
    for (const link of secondary) expect(link).toHaveAttribute("href", "#walkthrough")

    expect(screen.queryByText(/request access/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("brands as OMEN and links marketing logos to /", () => {
    renderLanding()
    const homes = screen.getAllByRole("link", { name: "OMEN home" })
    expect(homes).toHaveLength(2)
    for (const home of homes) expect(home).toHaveAttribute("href", "/")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Every probability, with its history.")
    expect(document.body.textContent).not.toMatch(/AION/)
  })

  it("labels the demo and omits placeholder destinations", () => {
    renderLanding()
    expect(screen.getAllByText("Demo — illustrative data, not live").length).toBeGreaterThan(0)
    expect(screen.getByText(/workspace it opens use illustrative data/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/example\.invalid|early access|we read every request|be in touch/i)
    expect(screen.queryByRole("link", { name: /privacy|terms|social|community|email/i })).not.toBeInTheDocument()
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("href", "#")
      expect(link.getAttribute("href")).not.toMatch(/^mailto:/)
    }
  })

  it("renders the walkthrough as a keyboard-operable tablist", async () => {
    const user = userEvent.setup()
    renderLanding()
    const tablist = screen.getByRole("tablist", { name: "Walkthrough steps" })
    const tabs = within(tablist).getAllByRole("tab")
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(tabs[1]).toHaveAttribute("tabindex", "-1")

    tabs[0].focus()
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(tabs[2]).toHaveAttribute("aria-selected", "true")
    expect(tabs[2]).toHaveFocus()
    const panel = screen.getByRole("tabpanel")
    expect(panel).toHaveAttribute("aria-labelledby", tabs[2].id)

    // Step 3 opens the rewind at 14:34 and the displayed cutoff matches the filtered evidence.
    const slider = within(panel).getByRole("slider")
    expect(slider).toHaveValue("34")
    expect(slider).toHaveAttribute("aria-valuetext", "14:34, 70.1 percent")
    expect(within(panel).getByText("Sep 10 2026 · 14:34:00 EDT")).toBeInTheDocument()
    expect(within(panel).queryByText("Related rate market reacts")).not.toBeInTheDocument()
    expect(within(panel).getByText("Probability rises")).toBeInTheDocument()

    // Wrapping keeps the roving tabindex consistent.
    await user.keyboard("{ArrowDown}")
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(tabs[0]).toHaveFocus()
  })
})
