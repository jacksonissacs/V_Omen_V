import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { EventCard } from "@/components/events/event-card"
import { AppShell } from "@/components/layout/app-shell"
import { getEvent } from "@/data/events"

describe("EventCard", () => {
  it("renders title, probabilities, and the signed move", () => {
    const event = getEvent("evt-gpu-export")
    if (!event) throw new Error("fixture missing")

    render(
      <AppShell>
        <EventCard event={event} />
      </AppShell>,
    )

    expect(screen.getByText("Extra-territorial GPU license expansion")).toBeInTheDocument()
    expect(screen.getByText("68.0%")).toBeInTheDocument()
    expect(screen.getByText("+17.0 pts")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Make a call" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View evidence" })).toHaveAttribute("href", "/events/evt-gpu-export")
  })
})
