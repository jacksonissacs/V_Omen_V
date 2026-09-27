import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { EventCard } from "@/components/events/event-card"
import { AppShell } from "@/components/layout/app-shell"
import { getEvent } from "@/data/events"

describe("EventCard", () => {
  it("leads with the question, the recorded change and the evidence on file", () => {
    const event = getEvent("evt-gpu-export")
    if (!event) throw new Error("fixture missing")

    render(
      <AppShell>
        <EventCard event={event} />
      </AppShell>,
    )

    expect(screen.getByText(event.question)).toBeInTheDocument()
    expect(screen.getByText("Extra-territorial GPU license expansion")).toBeInTheDocument()
    expect(screen.getByText("68.0%")).toBeInTheDocument()
    expect(screen.getByText("+17.0 pp")).toBeInTheDocument()
    expect(screen.getByText("What changed")).toBeInTheDocument()
    expect(screen.getByText("Evidence")).toBeInTheDocument()
    expect(screen.queryByText(/σ/)).not.toBeInTheDocument()
    expect(screen.queryByText("Data quality")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Make a call" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Inspect evidence" })).toHaveAttribute("href", "/events/evt-gpu-export")
  })
})
