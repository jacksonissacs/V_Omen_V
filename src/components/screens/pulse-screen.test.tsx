import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { AppShell } from "@/components/layout/app-shell"
import { PulseScreen } from "@/components/screens/pulse-screen"
import { PULSE_SCAN_LIMIT } from "@/lib/events"
import { testEvent } from "@/test/fake-repository"
import type { AionEvent } from "@/types/event"

function renderPulse(events: AionEvent[], anomaly?: AionEvent) {
  return render(
    <AppShell>
      <PulseScreen events={events} anomaly={anomaly} />
    </AppShell>,
  )
}

function cardQuestions() {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent)
}

describe("PulseScreen discovery", () => {
  it("states the curated scan count and avoids personalization language", () => {
    const events = [
      testEvent({ id: "evt-a", title: "A", probability: 70, previousProbability: 50 }),
      testEvent({ id: "evt-b", title: "B", probability: 55, previousProbability: 50 }),
    ]
    renderPulse(events)

    expect(screen.getByRole("heading", { name: "Pulse", level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId("pulse-count")).toHaveTextContent("Showing 2 of 2 matching · 2 in the book")
    expect(screen.getByTestId("pulse-count")).toHaveTextContent("ordered by largest recorded move")
    expect(screen.getByRole("link", { name: "Browse Explore" })).toHaveAttribute("href", "/events")
    expect(screen.getByText(/Not a recommendation engine/)).toBeInTheDocument()
    expect(screen.queryByText(/since your last visit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/for you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/personalized/i)).not.toBeInTheDocument()
  })

  it("caps the scan and points to Explore for the rest of the book", () => {
    const events = Array.from({ length: PULSE_SCAN_LIMIT + 3 }, (_, index) =>
      testEvent({
        id: `evt-cap-${index}`,
        title: `Cap ${index}`,
        probability: 50 + ((index % 20) + 1),
        previousProbability: 50,
      }),
    )
    renderPulse(events)

    expect(screen.getByTestId("pulse-count")).toHaveTextContent(
      `Showing ${PULSE_SCAN_LIMIT} of ${events.length} matching · ${events.length} in the book`,
    )
    expect(screen.getByTestId("pulse-count")).toHaveTextContent(`capped at ${PULSE_SCAN_LIMIT}`)
    expect(screen.getByRole("link", { name: "Open Explore for the full book" })).toHaveAttribute(
      "href",
      "/events",
    )
    expect(cardQuestions().filter((text) => text?.startsWith("Will Cap"))).toHaveLength(PULSE_SCAN_LIMIT)
  })

  it("orders cards by largest absolute recorded move", () => {
    const events = [
      testEvent({
        id: "evt-small",
        title: "Small",
        probability: 52,
        previousProbability: 50,
        timestamp: "2026-09-01T10:00:00.000Z",
      }),
      testEvent({
        id: "evt-large",
        title: "Large",
        probability: 70,
        previousProbability: 50,
        timestamp: "2026-09-04T10:00:00.000Z",
      }),
      testEvent({
        id: "evt-down",
        title: "Down",
        probability: 30,
        previousProbability: 50,
        timestamp: "2026-09-03T10:00:00.000Z",
      }),
    ]
    renderPulse(events)
    expect(cardQuestions().slice(0, 3)).toEqual(["Will Large?", "Will Down?", "Will Small?"])
  })

  it("keeps Follow available on the first card", async () => {
    const events = [testEvent({ id: "evt-follow", title: "Followable", probability: 60, previousProbability: 40 })]
    const user = userEvent.setup()
    renderPulse(events)

    await user.click(screen.getByRole("button", { name: "Follow Followable" }))
    expect(screen.getByRole("button", { name: "Unfollow Followable" })).toHaveAttribute("aria-pressed", "true")
  })
})
