import "@/test/next-navigation"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ArchiveView } from "@/components/archive/archive-view"
import { mockSearchParams } from "@/test/next-navigation"

describe("ArchiveView", () => {
  it("does not render scripted demo probabilities or fixed record counts", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams())
    render(
      <ArchiveView
        events={[{ id: "evt-a", title: "Example event" }]}
        storage="database"
        provenance="demo"
        initialEventId="evt-a"
        initialStatus="present"
      />,
    )
    expect(screen.queryByText(/Illustrative probabilities/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1,204/)).not.toBeInTheDocument()
    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
    expect(screen.getByTestId("archive-present-context")).toBeInTheDocument()
  })

  it("shows checkpoint reconstruction without stale present copy", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=1"))
    render(
      <ArchiveView
        events={[{ id: "evt-a", title: "Example event" }]}
        storage="database"
        provenance="demo"
        initialEventId="evt-a"
        initialCheckpoint="1"
        initialStatus="ok"
        initialReconstruction={{
          eventId: "evt-a",
          checkpoint: { id: "1", sequence: 1, contentMd5: "ab".repeat(16), memberCount: 1 },
          coverage: {
            semanticEventFieldsFrom: "2026-09-26T00:00:00.000Z",
            recordAvailabilityRealignedAt: "2026-09-26T00:00:00.000Z",
            semanticHistory: "recorded",
            preBaselineEventRevisions: "not_recorded",
          },
          provenance: "demo",
          semantics: null,
          observations: [],
          evidence: [],
          moveLogs: [],
        }}
      />,
    )
    expect(screen.getByTestId("historical-context-banner")).toHaveTextContent("not the current record")
    expect(screen.getByTestId("archive-present-context")).toHaveTextContent("Current navigation")
  })
})
