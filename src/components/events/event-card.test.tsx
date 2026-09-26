import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { EventCard } from "@/components/events/event-card"
import { AppShell } from "@/components/layout/app-shell"
import { getEvent } from "@/data/events"
import { seriesId } from "@/lib/domain/probability-history"
import { testEvent } from "@/test/fake-repository"
import type { ProbabilitySeries } from "@/types/event"

function renderCard(event: Parameters<typeof EventCard>[0]["event"]) {
  return render(
    <AppShell>
      <EventCard event={event} />
    </AppShell>,
  )
}

describe("EventCard", () => {
  it("renders title, probabilities, and the signed move", () => {
    const event = getEvent("evt-gpu-export")
    if (!event) throw new Error("fixture missing")

    renderCard(event)

    expect(screen.getByText("Extra-territorial GPU license expansion")).toBeInTheDocument()
    expect(screen.getByText("68.0%")).toBeInTheDocument()
    expect(screen.getByText("+17.0 pts")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Make a call" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View evidence" })).toHaveAttribute("href", "/events/evt-gpu-export")
    expect(screen.getByTestId("event-provenance")).toHaveTextContent("Demo")
    expect(screen.getByTestId("series-basis")).toHaveTextContent("Illustrative")
    expect(screen.getByText("OMEN demo book")).toBeInTheDocument()
    expect(screen.getByTestId("observation-time").textContent).not.toBe(screen.getByTestId("capture-time").textContent)
    expect(screen.getByTestId("capture-time")).toHaveTextContent("Not recorded")
    expect(screen.getByTestId("attribution")).toHaveTextContent("Illustrative")
    expect(screen.getByTestId("attribution")).toHaveTextContent("Not a measured split")
    expect(screen.queryByText("Data quality")).not.toBeInTheDocument()
    expect(screen.queryByText(/Move explained/)).not.toBeInTheDocument()
    expect(screen.queryByText(/σ/)).not.toBeInTheDocument()
  })

  it("shows zero analogues and no fabricated change for one sourced observation", () => {
    const identity = {
      sourceKind: "provider" as const,
      sourceName: "Desk",
      probabilityType: "market_implied" as const,
      provenance: "sourced" as const,
    }
    const headline: ProbabilitySeries = {
      id: seriesId(identity),
      ...identity,
      observations: [
        {
          observedAt: "2026-09-04T00:00:00.000Z",
          capturedAt: "2026-09-04T00:05:00.000Z",
          probability: 41,
        },
      ],
    }
    const event = testEvent({
      id: "evt-lone",
      title: "Lone print",
      provenance: "sourced",
      probability: 99,
      previousProbability: 1,
      sigma: 0,
      explained: 0,
      analogues: [],
      probabilitySeries: [headline],
    })

    renderCard(event)

    expect(screen.getByText("41.0%")).toBeInTheDocument()
    expect(screen.queryByText("99.0%")).not.toBeInTheDocument()
    expect(screen.queryByText("1.0%")).not.toBeInTheDocument()
    expect(screen.getByText("Not computable")).toBeInTheDocument()
    expect(screen.getByText("One observation")).toBeInTheDocument()
    expect(screen.getByTestId("analogue-count")).toHaveTextContent("n = 0")
    expect(screen.getByText("No analogues are recorded.")).toBeInTheDocument()
    expect(screen.queryByText("n = 1")).not.toBeInTheDocument()
    expect(screen.getByTestId("event-provenance")).toHaveTextContent("Sourced")
    expect(screen.getByTestId("series-basis")).toHaveTextContent("Market-implied")
    expect(screen.getByTestId("attribution")).toHaveTextContent("No attribution percentage is recorded.")
    expect(screen.getByTestId("observation-time").textContent).not.toBe(screen.getByTestId("capture-time").textContent)
    expect(screen.getByTestId("capture-time").textContent).toMatch(/UTC/)
    expect(screen.queryByText("Data quality")).not.toBeInTheDocument()
    expect(screen.queryByText(/σ/)).not.toBeInTheDocument()
  })
})
