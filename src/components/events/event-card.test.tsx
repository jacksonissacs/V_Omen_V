import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { EventCard } from "@/components/events/event-card"
import { AppShell } from "@/components/layout/app-shell"
import { getEvent } from "@/data/events"
import { seriesId } from "@/lib/domain/probability-history"
import { testEvent } from "@/test/fake-repository"
import type { ProbabilitySeries } from "@/types/event"

function renderCard(event: Parameters<typeof EventCard>[0]["event"], density?: "scan" | "book") {
  return render(
    <AppShell>
      <EventCard event={event} density={density} />
    </AppShell>,
  )
}

describe("EventCard", () => {
  it("renders question prominently with probability, pp change, provenance and actions", () => {
    const event = getEvent("evt-gpu-export")
    if (!event) throw new Error("fixture missing")

    renderCard(event)

    const question = screen.getByRole("heading", { level: 2 })
    expect(question).toHaveTextContent(event.question)
    expect(question).toHaveClass("aion-card-question")

    expect(screen.getByTestId("event-card-current-probability")).toHaveTextContent("68.0%")
    expect(screen.getByTestId("event-card-change")).toHaveTextContent("+17.0 pp")
    expect(screen.getByTestId("event-card-change")).toHaveAttribute("aria-label", "+17.0 pp")
    expect(screen.queryByText(/\+17\.0 pts/)).not.toBeInTheDocument()

    expect(screen.getByTestId("event-provenance")).toHaveTextContent("Demo")
    expect(screen.getByTestId("series-basis")).toHaveTextContent("Illustrative")
    expect(screen.getByTestId("event-card-provenance")).toBeInTheDocument()
    expect(screen.getByText("OMEN demo book")).toBeInTheDocument()
    expect(screen.getByTestId("observation-time").textContent).not.toBe(screen.getByTestId("capture-time").textContent)
    expect(screen.getByTestId("capture-time")).toHaveTextContent("Not recorded")

    expect(screen.getByTestId("event-card-why")).toHaveTextContent("Why it moved")
    expect(screen.getByTestId("event-card-why").textContent).toMatch(/Illustrative narrative|Move log|No cause/)
    expect(screen.getByTestId("attribution")).toHaveTextContent("Illustrative")
    expect(screen.getByTestId("attribution")).toHaveTextContent("Not a measured split")

    expect(screen.getByRole("link", { name: "View brief" })).toHaveAttribute("href", "/events/evt-gpu-export")
    expect(screen.getByRole("link", { name: "Inspect evidence" })).toHaveAttribute(
      "href",
      "/events/evt-gpu-export#event-evidence",
    )
    expect(screen.getByRole("button", { name: /Follow Extra-territorial GPU license expansion/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Make a call" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Open event" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "View evidence" })).not.toBeInTheDocument()

    expect(screen.queryByText("Data quality")).not.toBeInTheDocument()
    expect(screen.queryByText(/Move explained/)).not.toBeInTheDocument()
    expect(screen.queryByText(/σ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/confidence bar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/community/i)).not.toBeInTheDocument()
  })

  it("shows resolution when recorded and honest unknown states otherwise", () => {
    const withResolution = testEvent({
      id: "evt-resolve",
      title: "Resolved later",
      question: "Will the desk publish before Friday?",
      resolvesAt: "31 Dec 2026",
    })
    const { unmount } = renderCard(withResolution)
    expect(screen.getByTestId("event-card-horizon")).toHaveTextContent("31 Dec 2026")
    unmount()

    const without = testEvent({
      id: "evt-no-resolve",
      title: "Open question",
      question: "Will anything resolve?",
      resolvesAt: undefined,
      deadline: undefined,
    })
    renderCard(without)
    expect(screen.getByTestId("event-card-horizon")).toHaveTextContent("Not recorded")
  })

  it("does not invent causality when only an observation is recorded", () => {
    const event = testEvent({
      id: "evt-observed",
      title: "Observed only",
      question: "Will the print hold?",
      provenance: "sourced",
      moveLog: undefined,
      catalyst: "",
      likelyCause: "",
      explained: null,
    })

    renderCard(event)

    expect(screen.getByTestId("event-card-why")).toHaveTextContent("No cause has been recorded.")
    expect(screen.getByTestId("event-card-why").textContent).not.toMatch(/caused the probability/i)
    expect(screen.getByTestId("attribution")).toHaveTextContent("No attribution percentage is recorded.")
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
      question: "Will the lone print stand?",
      provenance: "sourced",
      probability: 99,
      previousProbability: 1,
      sigma: 0,
      explained: 0,
      analogues: [],
      probabilitySeries: [headline],
    })

    renderCard(event)

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Will the lone print stand?")
    expect(screen.getByTestId("event-card-current-probability")).toHaveTextContent("41.0%")
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

  it("supports a denser book density without changing honesty markup", () => {
    const event = getEvent("evt-boc-cut")
    if (!event) throw new Error("fixture missing")

    const { container } = renderCard(event, "book")
    expect(container.querySelector('[data-density="book"]')).toBeTruthy()
    expect(screen.getByTestId("event-card-current-probability")).toHaveTextContent("73.8%")
    expect(screen.getByTestId("event-card-change")).toHaveTextContent("+12.6 pp")
    expect(screen.getByTestId("event-provenance")).toBeInTheDocument()
  })
})
