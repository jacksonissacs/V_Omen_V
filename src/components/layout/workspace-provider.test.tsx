import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import "@/test/next-navigation"

import { WatchlistsScreen } from "@/components/screens/watchlists-screen"
import { AppShell } from "@/components/layout/app-shell"
import { FOLLOWING_STORAGE_KEY } from "@/lib/following-storage"
import { testEvent } from "@/test/fake-repository"

const alpha = testEvent({ id: "evt-alpha", title: "Alpha rate decision" })
const beta = testEvent({ id: "evt-beta", title: "Beta model launch", category: "AI" })

describe("device-local Following", () => {
  it("restores a stored follow list instead of the server default", async () => {
    window.localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(["evt-beta"]))
    render(
      <AppShell data={{ eventIndex: [], followedEventIds: ["evt-alpha"], available: true, storage: "demo", provenance: "demo" }}>
        <WatchlistsScreen events={[alpha, beta]} />
      </AppShell>,
    )

    expect(await screen.findByText("Beta model launch")).toBeInTheDocument()
    expect(screen.queryByText("Alpha rate decision")).not.toBeInTheDocument()
    expect(screen.getByTestId("following-storage-note")).toHaveTextContent("stored in this browser only")
  })

  it("writes follows back to this device", async () => {
    const user = userEvent.setup()
    render(
      <AppShell data={{ eventIndex: [], followedEventIds: ["evt-alpha"], available: true, storage: "demo", provenance: "demo" }}>
        <WatchlistsScreen events={[alpha, beta]} />
      </AppShell>,
    )

    expect(await screen.findByText("Alpha rate decision")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Unfollow" }))
    expect(JSON.parse(window.localStorage.getItem(FOLLOWING_STORAGE_KEY) ?? "[]")).toEqual([])
  })
})
