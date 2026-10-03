import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SettingsScreen } from "@/components/screens/settings-screen"

describe("SettingsScreen", () => {
  it("does not describe the workspace as a local mock repository", () => {
    render(<SettingsScreen />)

    expect(screen.queryByText(/local mock repository/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/no api keys are stored in this application/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/storage is selected by the server environment/i),
    ).toBeInTheDocument()
  })
})
