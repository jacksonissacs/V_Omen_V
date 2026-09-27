import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { AppShell } from "@/components/layout/app-shell"
import { EventsScreen } from "@/components/screens/events-screen"
import { testEvent } from "@/test/fake-repository"
import type { AionEvent } from "@/types/event"

function renderExplore(events: AionEvent[]) {
  return render(
    <AppShell>
      <EventsScreen events={events} />
    </AppShell>,
  )
}

function cardQuestions() {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent)
}

describe("EventsScreen Explore discovery", () => {
  const book = [
    testEvent({ id: "evt-alpha", title: "Alpha", probability: 70, previousProbability: 50, timestamp: "2026-09-01T10:00:00.000Z" }),
    testEvent({
      id: "evt-beta",
      title: "Beta",
      category: "AI",
      probability: 30,
      previousProbability: 25,
      timestamp: "2026-09-03T10:00:00.000Z",
    }),
    testEvent({ id: "evt-gamma", title: "Gamma", probability: 40, previousProbability: 40, timestamp: "2026-09-02T10:00:00.000Z" }),
  ]

  it("presents the broader book with truthful counts and shared cards", () => {
    renderExplore(book)

    expect(screen.getByRole("heading", { name: "Explore", level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/full book of questions/i)).toBeInTheDocument()
    expect(screen.getByTestId("explore-count")).toHaveTextContent("3 events in view · 3 in the book")
    expect(screen.getByTestId("explore-count-footer")).toHaveTextContent("3 events in view · 3 in the book")
    expect(screen.getByTestId("explore-stream").querySelectorAll('[data-density="book"]')).toHaveLength(3)
    expect(cardQuestions()).toEqual(["Will Alpha?", "Will Beta?", "Will Gamma?"])
  })

  it("preserves category, search and sort controls", async () => {
    const user = userEvent.setup()
    renderExplore(book)

    await user.click(screen.getByRole("button", { name: "Probability" }))
    expect(cardQuestions()).toEqual(["Will Alpha?", "Will Gamma?", "Will Beta?"])

    await user.click(screen.getByRole("button", { name: "AI" }))
    expect(cardQuestions()).toEqual(["Will Beta?"])

    await user.click(screen.getByRole("button", { name: "All" }))
    await user.type(screen.getByRole("textbox", { name: "Search events" }), "gamma")
    expect(cardQuestions()).toEqual(["Will Gamma?"])
    expect(screen.getByTestId("explore-count")).toHaveTextContent("1 events in view · 3 in the book")
  })

  it("keeps Follow available from Explore cards", async () => {
    const user = userEvent.setup()
    renderExplore(book)

    await user.click(screen.getByRole("button", { name: "Follow Alpha" }))
    expect(screen.getByRole("button", { name: "Unfollow Alpha" })).toHaveAttribute("aria-pressed", "true")
  })
})
