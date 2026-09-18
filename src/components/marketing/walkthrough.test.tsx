import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Walkthrough } from "@/components/marketing/walkthrough"

describe("Walkthrough", () => {
  it("shows the latest observation in steps 1–2 with future evidence dimmed, not hidden", () => {
    render(<Walkthrough />)
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByText("Sep 10 2026 · 15:00:00 EDT")).toBeInTheDocument()
    expect(within(panel).getByText("Move reaches full size")).toBeInTheDocument()
    expect(within(panel).queryByRole("slider")).not.toBeInTheDocument()
    expect(within(panel).getByText("69%")).toBeInTheDocument()
  })

  it("rewinds with the slider and keeps probability, cutoff, evidence and headlines in sync", async () => {
    const user = userEvent.setup()
    render(<Walkthrough />)
    await user.click(screen.getByRole("tab", { name: /rewind/i }))
    const panel = screen.getByRole("tabpanel")
    const slider = within(panel).getByRole("slider")

    fireEvent.change(slider, { target: { value: "30" } })
    expect(slider).toHaveAttribute("aria-valuetext", "14:30, 61.2 percent")
    expect(within(panel).getByText("Sep 10 2026 · 14:30:00 EDT")).toBeInTheDocument()
    // Only the catalyst stamped exactly at 14:30:00 is known.
    expect(within(panel).getByText("Statistics Canada CPI release")).toBeInTheDocument()
    expect(within(panel).queryByText("CAD begins repricing")).not.toBeInTheDocument()
    expect(within(panel).getByText("CPI print released: headline below expectations")).toBeInTheDocument()
    expect(within(panel).getByText("move in progress")).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: "10" } })
    expect(within(panel).getByText("Sep 10 2026 · 14:10:00 EDT")).toBeInTheDocument()
    expect(within(panel).queryByText("Statistics Canada CPI release")).not.toBeInTheDocument()
    expect(within(panel).getByText("Nothing yet")).toBeInTheDocument()
    expect(within(panel).getByText("Markets await 14:30 CPI print")).toBeInTheDocument()
    expect(within(panel).getByText("no abnormal movement")).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: "60" } })
    expect(within(panel).getByText("latest observation")).toBeInTheDocument()
    expect(within(panel).getByText("Primary catalyst identified")).toBeInTheDocument()

    // Leaving and returning to the rewind step remembers the scrubbed minute.
    fireEvent.change(slider, { target: { value: "31" } })
    await user.click(screen.getByRole("tab", { name: /observe a move/i }))
    expect(within(panel).getByText("Sep 10 2026 · 15:00:00 EDT")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /rewind/i }))
    expect(within(panel).getByRole("slider")).toHaveValue("31")
  })
})
