import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { EventIntelligenceView } from "@/components/intelligence/event-intelligence-view"
import { AppShell } from "@/components/layout/app-shell"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"

const repository = new MockIntelligenceRepository()

async function loadEvent(id: string) {
  const event = await repository.getEvent(id)
  if (!event) throw new Error("fixture missing")
  return { event, related: await repository.getRelatedEvents(id) }
}

describe("EventIntelligenceView", () => {
  it("answers the core intelligence questions for a seeded event", async () => {
    const user = userEvent.setup()
    const { event, related } = await loadEvent("evt-boc-cut")

    render(
      <AppShell>
        <EventIntelligenceView event={event} related={related} />
      </AppShell>,
    )

    expect(screen.getByRole("heading", { name: event.title })).toBeInTheDocument()
    expect(screen.getByText("What changed?")).toBeInTheDocument()
    expect(screen.getByText("When did it change?")).toBeInTheDocument()
    expect(screen.getByText("How significant?")).toBeInTheDocument()
    expect(screen.getByText("What likely caused it?")).toBeInTheDocument()
    expect(screen.getByText("Current probability")).toBeInTheDocument()
    expect(screen.getByText("Previous probability")).toBeInTheDocument()
    expect(screen.getByText("What did the system previously believe?")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Make a call" }))
    expect(screen.getByRole("dialog", { name: "Make a call" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Lock prediction" }))
    expect(screen.getByText("Locked. Now revealed:")).toBeInTheDocument()
  })

  it("toggles the watchlist from the intelligence view", async () => {
    const user = userEvent.setup()
    const { event, related } = await loadEvent("evt-gpu-export")

    render(
      <AppShell>
        <EventIntelligenceView event={event} related={related} />
      </AppShell>,
    )

    const follow = screen.getByRole("button", { name: "Follow" })
    await user.click(follow)
    expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument()
  })

  it("links only the related events it is given", async () => {
    const { event, related } = await loadEvent("evt-boc-cut")

    const { unmount } = render(
      <AppShell>
        <EventIntelligenceView event={event} related={related} />
      </AppShell>,
    )
    for (const item of related) {
      expect(screen.getByRole("link", { name: new RegExp(item.title) })).toHaveAttribute(
        "href",
        `/events/${item.id}`,
      )
    }
    unmount()

    render(
      <AppShell>
        <EventIntelligenceView event={event} related={[]} />
      </AppShell>,
    )
    expect(screen.getByText("No linked events in the current book.")).toBeInTheDocument()
  })
})
