import { existsSync } from "node:fs"
import path from "node:path"

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { mockPathname, mockPush, NotFoundError } from "@/test/next-navigation"

import WorkspaceError from "@/app/(workspace)/error"
import EventsLoading from "@/app/(workspace)/events/(book)/loading"
import EventsPage from "@/app/(workspace)/events/(book)/page"
import EventIntelligencePage, { generateMetadata } from "@/app/(workspace)/events/[id]/page"
import WorkspaceLayout from "@/app/(workspace)/layout"
import PulseLoading from "@/app/(workspace)/pulse/loading"
import PulsePage from "@/app/(workspace)/pulse/page"
import WatchlistsLoading from "@/app/(workspace)/watchlists/loading"
import WatchlistsPage from "@/app/(workspace)/watchlists/page"
import { __resetRepositoryForTests, type IntelligenceRepository } from "@/lib/data/repository"
import { failingRepository, fakeRepository, testEvent } from "@/test/fake-repository"

const alpha = testEvent({
  id: "evt-alpha",
  title: "Alpha rate decision",
  probability: 70,
  previousProbability: 50,
  sigma: 1,
  timestamp: "2026-09-01T10:00:00.000Z",
})
const beta = testEvent({
  id: "evt-beta",
  title: "Beta model launch",
  category: "AI",
  probability: 30,
  previousProbability: 25,
  sigma: 3,
  timestamp: "2026-09-03T10:00:00.000Z",
  relatedEvents: ["evt-alpha", "evt-missing"],
})
const gamma = testEvent({
  id: "evt-gamma",
  title: "Gamma housing lull",
  probability: 40,
  previousProbability: 40,
  sigma: 2,
  timestamp: "2026-09-02T10:00:00.000Z",
  anomaly: {
    title: "Expected reaction missing",
    body: "Housing did not reprice.",
    interpretations: ["Lagged reaction"],
  },
})
const book = [alpha, beta, gamma]

function useRepository(repository: IntelligenceRepository) {
  __resetRepositoryForTests(repository)
}

/** Renders a page inside the real workspace layout, both loaded through the repository. */
async function renderRoute(page: Promise<ReactElement>) {
  const children = await page
  const shell = await WorkspaceLayout({ children: children as ReactNode })
  const user = userEvent.setup()
  return { user, ...render(shell) }
}

function cardTitles() {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent)
}

function rowTitles(container: HTMLElement) {
  return [...container.querySelectorAll(".aion-event-row .aion-watch-name")].map(
    (node) => node.textContent,
  )
}

afterEach(() => {
  __resetRepositoryForTests()
  mockPush.mockClear()
  mockPathname.mockReset()
  mockPathname.mockReturnValue("/")
  vi.restoreAllMocks()
})

describe("Pulse route", () => {
  it("renders events supplied by the repository, not the seeded fixtures", async () => {
    useRepository(fakeRepository(book, { anomalyId: "evt-gamma" }))
    await renderRoute(PulsePage())

    expect(screen.getByRole("heading", { name: "Pulse", level: 1 })).toBeInTheDocument()
    expect(cardTitles()).toEqual([
      "Alpha rate decision",
      "Beta model launch",
      "Gamma housing lull",
      "Gamma housing lull",
    ])
    expect(screen.getByText("△ Expected reaction missing")).toBeInTheDocument()
    expect(screen.queryByText("Bank of Canada cuts rates in October")).not.toBeInTheDocument()
  })

  it("sorts, filters by category, searches and narrows to the watchlist", async () => {
    useRepository(fakeRepository(book, { followed: ["evt-beta"] }))
    const { user } = await renderRoute(PulsePage())

    await user.click(screen.getByRole("button", { name: "Most unusual" }))
    expect(cardTitles()).toEqual(["Beta model launch", "Gamma housing lull", "Alpha rate decision"])

    await user.click(screen.getByRole("button", { name: "My watchlist" }))
    expect(cardTitles()).toEqual(["Beta model launch"])

    await user.click(screen.getByRole("button", { name: "Largest move" }))
    await user.click(screen.getByRole("button", { name: "AI" }))
    expect(cardTitles()).toEqual(["Beta model launch"])

    await user.click(screen.getByRole("button", { name: "All" }))
    await user.type(screen.getByRole("textbox", { name: "Search pulse" }), "no such catalyst")
    expect(screen.getByText("No matching events")).toBeInTheDocument()
  })

  it("links cards to event detail", async () => {
    useRepository(fakeRepository(book))
    await renderRoute(PulsePage())
    expect(screen.getByRole("link", { name: "Open Alpha rate decision" })).toHaveAttribute(
      "href",
      "/events/evt-alpha",
    )
  })

  it("shows an empty state when the book is empty", async () => {
    useRepository(fakeRepository([]))
    await renderRoute(PulsePage())
    expect(screen.getByText("No events in the book yet")).toBeInTheDocument()
  })

  it("propagates repository failures to the route error boundary", async () => {
    useRepository(failingRepository())
    await expect(PulsePage()).rejects.toThrow("store offline")
  })
})

describe("Events route", () => {
  it("lists repository events and sorts by probability", async () => {
    useRepository(fakeRepository(book))
    const { user, container } = await renderRoute(EventsPage())

    expect(rowTitles(container)).toEqual(["Alpha rate decision", "Beta model launch", "Gamma housing lull"])
    expect(screen.getByText("3 events in view · 3 in the book")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Probability" }))
    expect(rowTitles(container)).toEqual(["Alpha rate decision", "Gamma housing lull", "Beta model launch"])

    await user.click(screen.getByRole("button", { name: "Time" }))
    expect(rowTitles(container)).toEqual(["Beta model launch", "Gamma housing lull", "Alpha rate decision"])
  })

  it("filters by category and search, with an empty state for no matches", async () => {
    useRepository(fakeRepository(book))
    const { user, container } = await renderRoute(EventsPage())

    await user.click(screen.getByRole("button", { name: "AI" }))
    expect(rowTitles(container)).toEqual(["Beta model launch"])

    await user.click(screen.getByRole("button", { name: "All" }))
    await user.type(screen.getByRole("textbox", { name: "Search events" }), "gamma")
    expect(rowTitles(container)).toEqual(["Gamma housing lull"])

    await user.clear(screen.getByRole("textbox", { name: "Search events" }))
    await user.type(screen.getByRole("textbox", { name: "Search events" }), "nothing like this")
    expect(screen.getByText("No matching events")).toBeInTheDocument()
    expect(screen.getByText("0 events in view · 3 in the book")).toBeInTheDocument()
  })

  it("follows an event from its row and reflects it on the watchlist state", async () => {
    useRepository(fakeRepository(book))
    const { user } = await renderRoute(EventsPage())

    await user.click(screen.getByRole("button", { name: "Follow Alpha rate decision" }))
    expect(screen.getByRole("button", { name: "Unfollow Alpha rate decision" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("shows an empty state when the book is empty", async () => {
    useRepository(fakeRepository([]))
    await renderRoute(EventsPage())
    expect(screen.getByText("No events in the book yet")).toBeInTheDocument()
  })
})

describe("Event detail route", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) })

  it("renders the event and its repository-resolved related events", async () => {
    useRepository(fakeRepository(book))
    mockPathname.mockReturnValue("/events/evt-beta")
    await renderRoute(EventIntelligencePage(params("evt-beta")))

    expect(screen.getByRole("heading", { name: "Beta model launch", level: 1 })).toBeInTheDocument()
    const connected = screen.getByRole("heading", { name: "Connected events" }).parentElement!
    const links = within(connected).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "/events/evt-alpha")
    expect(within(document.querySelector(".aion-crumb")!).getByText("Beta model launch")).toBeInTheDocument()
  })

  it("shows resolution criteria, the corrected move log and when evidence was published versus first observed", async () => {
    const stored = testEvent({
      id: "evt-stored",
      title: "Stored rate decision",
      resolutionCriteria: "Resolves YES if the central bank cuts at the scheduled decision.",
      evidence: [
        {
          id: "ev-undated",
          name: "Undated desk note",
          publishedAt: null,
          firstObservedAt: "2026-09-05T12:40:00.000Z",
          summary: "No publication date on the source.",
          stance: "contradicts",
          reliability: 0.55,
        },
      ],
      moveLog: {
        id: "ml-stored",
        version: 2,
        publishedAt: "2026-09-05T13:10:00.000Z",
        firstPublishedAt: "2026-09-04T18:45:00.000Z",
        author: "Demo desk",
        correctionNote: "Coverage revised from 69% to 64%.",
        evidenceIds: ["ev-undated"],
      },
    })
    useRepository(fakeRepository([stored], { storage: "database" }))
    mockPathname.mockReturnValue("/events/evt-stored")
    const { user } = await renderRoute(EventIntelligencePage(params("evt-stored")))

    expect(screen.getByText(/Resolves YES if the central bank cuts/)).toBeInTheDocument()
    const note = screen.getByTestId("move-log-note")
    expect(note).toHaveTextContent("version 2")
    expect(note).toHaveTextContent("correction: Coverage revised from 69% to 64%.")
    expect(note).toHaveTextContent("first published")

    await user.click(screen.getByRole("tab", { name: "Evidence" }))
    expect(screen.getByText("Not stated by source")).toBeInTheDocument()
    expect(screen.getByText("First observed by OMEN")).toBeInTheDocument()
  })

  it("calls notFound for an unknown id and titles metadata accordingly", async () => {
    useRepository(fakeRepository(book))
    await expect(EventIntelligencePage(params("evt-nope"))).rejects.toBeInstanceOf(NotFoundError)
    expect(await generateMetadata(params("evt-nope"))).toEqual({ title: "Event not found" })
    expect(await generateMetadata(params("evt-alpha"))).toEqual({ title: "Alpha rate decision" })
  })
})

describe("Watchlists route", () => {
  it("shows followed events from the repository and supports unfollow and navigation", async () => {
    useRepository(fakeRepository(book, { followed: ["evt-alpha", "evt-gamma"] }))
    const { user } = await renderRoute(WatchlistsPage())

    expect(screen.getByText("Alpha rate decision")).toBeInTheDocument()
    expect(screen.getByText("Gamma housing lull")).toBeInTheDocument()
    expect(screen.queryByText("Beta model launch")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Gamma housing lull/ }))
    expect(mockPush).toHaveBeenCalledWith("/events/evt-gamma")

    const [firstUnfollow] = screen.getAllByRole("button", { name: "Unfollow" })
    await user.click(firstUnfollow!)
    expect(screen.queryByText("Alpha rate decision")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Unfollow" }))
    expect(screen.getByText("Nothing followed")).toBeInTheDocument()
  })
})

describe("Workspace shell", () => {
  it("searches repository events from the command palette and navigates", async () => {
    useRepository(fakeRepository(book))
    const { user } = await renderRoute(Promise.resolve(<div>child</div>))

    await user.click(screen.getByRole("button", { name: "Ask OMEN" }))
    await user.type(screen.getByRole("textbox", { name: "Ask OMEN" }), "beta")
    const palette = screen.getByRole("dialog", { name: "Command palette" })
    expect(within(palette).queryByText("Alpha rate decision")).not.toBeInTheDocument()
    await user.click(within(palette).getByRole("button", { name: "Beta model launch" }))
    expect(mockPush).toHaveBeenCalledWith("/events/evt-beta")
  })

  it("still renders with search disabled when the repository is unavailable", async () => {
    useRepository(failingRepository())
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { user } = await renderRoute(Promise.resolve(<div>child</div>))

    expect(screen.getByText("child")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Ask OMEN" }))
    expect(screen.getByText("Event search is unavailable right now. Navigation still works.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Events" })).toBeInTheDocument()
  })
})

describe("Workspace data labels", () => {
  it("labels in-process demo records as demo data without a storage chip", async () => {
    mockPathname.mockReturnValue("/pulse")
    useRepository(fakeRepository(book))
    await renderRoute(Promise.resolve(<div>child</div>))
    expect(screen.getByText("Demo data")).toBeInTheDocument()
    expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument()
  })

  it("keeps demo records labelled demo when they are stored in PostgreSQL", async () => {
    mockPathname.mockReturnValue("/events")
    useRepository(fakeRepository(book, { storage: "database" }))
    await renderRoute(Promise.resolve(<div>child</div>))
    expect(screen.getByText("Demo data")).toBeInTheDocument()
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument()
    expect(screen.queryByText("Sourced data")).not.toBeInTheDocument()
  })

  it("labels sourced and mixed books without calling them live", async () => {
    const sourced = { ...alpha, provenance: "sourced" as const }
    mockPathname.mockReturnValue("/watchlists")
    useRepository(fakeRepository([sourced], { storage: "database" }))
    const first = await renderRoute(Promise.resolve(<div>child</div>))
    expect(screen.getByText("Sourced data")).toBeInTheDocument()
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument()
    first.unmount()

    useRepository(fakeRepository([sourced, beta], { storage: "database" }))
    await renderRoute(Promise.resolve(<div>child</div>))
    expect(screen.getByText("Demo + sourced data")).toBeInTheDocument()
  })

  it("shows data unavailable, not demo data, when database storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockPathname.mockReturnValue("/pulse")
    useRepository(failingRepository("connection refused", "database"))
    await renderRoute(Promise.resolve(<div>child</div>))
    expect(screen.getByText("Data unavailable")).toBeInTheDocument()
    expect(screen.queryByText("Demo data")).not.toBeInTheDocument()
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument()
  })

  it("labels legacy demo-only screens as demo data even when the store holds sourced records", async () => {
    mockPathname.mockReturnValue("/markets")
    useRepository(fakeRepository([{ ...alpha, provenance: "sourced" }], { storage: "database" }))
    await renderRoute(Promise.resolve(<div>child</div>))
    expect(screen.getByText("Demo data")).toBeInTheDocument()
    expect(screen.queryByText("Sourced data")).not.toBeInTheDocument()
    expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument()
  })
})

describe("Route states", () => {
  it("renders an unavailable state with retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const retry = vi.fn()
    const user = userEvent.setup()
    render(<WorkspaceError error={Object.assign(new Error("x"), { digest: "abc123" })} retry={retry} />)

    expect(screen.getByRole("alert")).toHaveTextContent("Workspace data unavailable")
    expect(screen.getByText("abc123")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it.each([
    ["pulse", PulseLoading],
    ["events", EventsLoading],
    ["watchlists", WatchlistsLoading],
  ])("renders a loading state for %s", (_route, Loading) => {
    const { unmount } = render(<Loading />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading the book…")
    unmount()
  })

  it("keeps loading boundaries off the event detail path so notFound returns a 404", () => {
    const workspace = path.resolve(__dirname)
    for (const dir of [".", "events", "events/[id]"]) {
      expect(existsSync(path.join(workspace, dir, "loading.tsx"))).toBe(false)
    }
  })
})
