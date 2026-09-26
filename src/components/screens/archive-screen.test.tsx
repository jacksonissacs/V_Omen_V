import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import ArchivePage from "@/app/(workspace)/archive/page"
import { ArchiveScreen } from "@/components/screens/archive-screen"

describe("ArchiveScreen", () => {
  it("labels point-in-time reconstruction as a demo that does not query stored history", async () => {
    const user = userEvent.setup()
    render(<ArchiveScreen />)

    expect(screen.getByTestId("archive-demo-notice")).toHaveTextContent(
      "Historical reconstruction is not available yet",
    )
    expect(screen.getByTestId("archive-demo-notice")).toHaveTextContent("do not query stored records")

    await user.click(screen.getByRole("button", { name: "Show point-in-time demo" }))
    expect(screen.getByRole("slider", { name: "Illustrative replay position (demo)" })).toBeInTheDocument()
    expect(screen.getByText(/The slider does not read stored history/)).toBeInTheDocument()
    expect(screen.getByText(/scripted, not recorded/)).toBeInTheDocument()
    expect(screen.queryByText(/reflects only information available then/)).not.toBeInTheDocument()
  })
})

describe("Archive page historical queries", () => {
  it("does not present the demo rewind as a stored checkpoint", async () => {
    render(
      await ArchivePage({
        searchParams: Promise.resolve({ checkpoint: "ck-early" }),
      }),
    )
    expect(screen.getByTestId("historical-unavailable")).toHaveTextContent(
      "Checkpoint ck-early cannot be reconstructed",
    )
    expect(screen.queryByTestId("archive-demo-notice")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Show point-in-time demo" })).not.toBeInTheDocument()
  })
})
