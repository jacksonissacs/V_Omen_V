import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ShareViewControl } from "@/components/common/share-view-control"

afterEach(() => {
  window.history.pushState(null, "", "/")
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
})

describe("ShareViewControl", () => {
  it("shows the current URL when the clipboard is unavailable", async () => {
    window.history.pushState(null, "", "/events/evt-boc-cut/history/11")
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
    render(<ShareViewControl />)

    await user.click(screen.getByRole("button", { name: "Share" }))

    expect(screen.queryByText("Link copied")).not.toBeInTheDocument()
    expect(screen.getByTestId("share-feedback")).toHaveTextContent(window.location.href)
    expect(screen.getByTestId("share-feedback")).toHaveTextContent("/events/evt-boc-cut/history/11")
  })

  it("shows the current URL when the clipboard rejects the write", async () => {
    window.history.pushState(null, "", "/events/evt-boc-cut")
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<ShareViewControl />)

    await user.click(screen.getByRole("button", { name: "Share" }))

    expect(await screen.findByText(window.location.href)).toBeInTheDocument()
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })
})
