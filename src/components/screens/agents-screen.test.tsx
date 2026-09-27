/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AgentsScreen } from "@/components/screens/agents-screen"

describe("AgentsScreen honesty", () => {
  it("labels calibration and ranking figures as illustrative", () => {
    render(<AgentsScreen />)
    expect(screen.getByTestId("agents-illustrative-banner")).toHaveTextContent(/Illustrative demo figures/i)
    expect(screen.getByText(/Forecast model rankings \(illustrative\)/i)).toBeInTheDocument()
    expect(screen.getByText(/not computed on identical resolved questions/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Overall calibration \(illustrative\)/i).length).toBeGreaterThan(0)
  })
})
