import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@/test/next-navigation"

import { AppShell } from "@/components/layout/app-shell"
import { EventsScreen } from "@/components/screens/events-screen"
import { WatchlistsScreen } from "@/components/screens/watchlists-screen"
import { __resetFollowingStoresForTests } from "@/lib/following/following-store"
import {
  followingStorageKey,
  writeBrowserFollowing,
} from "@/lib/following/persistence"
import { toEventSummary } from "@/lib/events"
import { testEvent } from "@/test/fake-repository"

const alpha = testEvent({ id: "evt-alpha", title: "Alpha rate decision" })
const beta = testEvent({ id: "evt-beta", title: "Beta model launch" })

function renderWorkspace(events = [alpha, beta]) {
  return render(
    <AppShell
      data={{
        eventIndex: events.map(toEventSummary),
        followedEventIds: ["evt-alpha"],
        available: true,
        storage: "demo",
        provenance: "demo",
      }}
    >
      <EventsScreen events={events} />
    </AppShell>,
  )
}

afterEach(() => {
  window.localStorage.clear()
  __resetFollowingStoresForTests()
})

describe("browser-local following", () => {
  it("seeds from repository defaults on first visit, then keeps browser saves across a hard refresh", async () => {
    const user = userEvent.setup()
    const first = renderWorkspace()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow Alpha rate decision" })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Follow Beta model launch" }))
    expect(window.localStorage.getItem(followingStorageKey("demo"))).toContain("evt-beta")
    first.unmount()
    __resetFollowingStoresForTests()

    renderWorkspace()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow Beta model launch" })).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "Unfollow Alpha rate decision" })).toBeInTheDocument()
  })

  it("preserves an intentionally empty saved watchlist instead of reapplying defaults", async () => {
    writeBrowserFollowing("demo", { version: 1, eventIds: [], userSaved: true })
    __resetFollowingStoresForTests()

    render(
      <AppShell
        data={{
          eventIndex: [],
          followedEventIds: ["evt-alpha", "evt-beta"],
          available: true,
          storage: "demo",
          provenance: "demo",
        }}
      >
        <WatchlistsScreen events={[]} />
      </AppShell>,
    )

    await waitFor(() => {
      expect(screen.getByText("Nothing followed")).toBeInTheDocument()
    })
    expect(screen.queryByText("Alpha rate decision")).not.toBeInTheDocument()
  })

  it("keeps followed ids that are not in the current catalog", async () => {
    writeBrowserFollowing("demo", {
      version: 1,
      eventIds: ["evt-missing"],
      userSaved: true,
    })
    __resetFollowingStoresForTests()

    render(
      <AppShell
        data={{
          eventIndex: [],
          followedEventIds: [],
          available: false,
          storage: "demo",
          provenance: "none",
        }}
      >
        <WatchlistsScreen events={[]} />
      </AppShell>,
    )

    await waitFor(() => {
      expect(screen.getByText("Event not in the current book")).toBeInTheDocument()
    })
    expect(screen.getByText("evt-missing")).toBeInTheDocument()
  })

  it("syncs following from other tabs through storage events", async () => {
    renderWorkspace()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow Alpha rate decision" })).toBeInTheDocument()
    })

    writeBrowserFollowing("demo", {
      version: 1,
      eventIds: ["evt-beta"],
      userSaved: true,
    })

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: followingStorageKey("demo"),
        newValue: window.localStorage.getItem(followingStorageKey("demo")),
        storageArea: window.localStorage,
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Unfollow Alpha rate decision" })).not.toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "Unfollow Beta model launch" })).toBeInTheDocument()
  })

  it("ignores corrupt saved following and falls back to repository defaults", async () => {
    window.localStorage.setItem(followingStorageKey("demo"), "{")
    __resetFollowingStoresForTests()

    render(
      <AppShell
        data={{
          eventIndex: [toEventSummary(alpha)],
          followedEventIds: ["evt-alpha"],
          available: true,
          storage: "demo",
          provenance: "demo",
        }}
      >
        <WatchlistsScreen events={[alpha]} />
      </AppShell>,
    )
    await waitFor(() => {
      expect(screen.getByText("Alpha rate decision")).toBeInTheDocument()
    })
    expect(screen.getByRole("status")).toHaveTextContent(/unreadable/i)
  })

  it("surfaces save failures without claiming persistence succeeded", async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    })

    renderWorkspace()
    await user.click(screen.getByRole("button", { name: `Follow ${beta.title}` }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Unfollow ${beta.title}` })).toHaveAttribute(
        "title",
        expect.stringMatching(/Could not save following/),
      )
    })
    vi.restoreAllMocks()
  })

  it("keeps demo and database following lists separate", async () => {
    writeBrowserFollowing("demo", { version: 1, eventIds: ["evt-alpha"], userSaved: true })
    writeBrowserFollowing("database", { version: 1, eventIds: ["evt-beta"], userSaved: true })
    __resetFollowingStoresForTests()

    renderWorkspace()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow Alpha rate decision" })).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "Unfollow Beta model launch" })).not.toBeInTheDocument()
  })

  it("labels watchlists as saved in this browser", async () => {
    render(
      <AppShell
        data={{
          eventIndex: [],
          followedEventIds: [],
          available: true,
          storage: "demo",
          provenance: "demo",
        }}
      >
        <WatchlistsScreen events={[]} />
      </AppShell>,
    )

    expect(screen.getByText(/Saved in this browser\./)).toBeInTheDocument()
  })
})
