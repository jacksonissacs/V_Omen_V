import "@/test/next-navigation"

import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import EventCheckpointPage, { generateMetadata } from "@/app/(workspace)/events/[id]/history/[checkpointId]/page"
import type { HistoricalReconstruction } from "@/lib/domain/historical-reconstruction"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import { fakeRepository, testEvent } from "@/test/fake-repository"

const CURRENT_TITLE = "CURRENT_TITLE_LEAK"
const RECORDED_TITLE = "Original recorded title"

const recorded: HistoricalReconstruction = {
  eventId: "evt-replay",
  checkpoint: { id: "11", sequence: 1, contentMd5: "ab".repeat(16), memberCount: 1 },
  coverage: {
    semanticEventFieldsFrom: "2026-09-26T00:00:00.000Z",
    recordAvailabilityRealignedAt: "2026-09-26T00:00:00.000Z",
    semanticHistory: "recorded",
    preBaselineEventRevisions: "not_recorded",
  },
  provenance: "demo",
  semantics: {
    version: 1,
    title: RECORDED_TITLE,
    question: "Will the recorded question stay in this checkpoint?",
    status: "active",
    deadline: "2026-12-01T00:00:00.000Z",
    resolutionCriteria: "SYNTHETIC TEST resolution criteria for the recorded revision.",
    category: "Economics",
    significance: "low",
    region: "Test",
    summary: "Recorded summary only.",
    tags: [],
    relatedEventIds: [],
    provenance: "demo",
    correctionNote: null,
    recordedAt: "2026-09-01T00:00:00.000Z",
  },
  observations: [],
  evidence: [],
  moveLogs: [],
}

afterEach(() => {
  __resetRepositoryForTests()
})

describe("event checkpoint page", () => {
  it("does not render a checkpoint when the URL also asks for an arbitrary time", async () => {
    const reconstructEvent = vi.fn(async () => ({ outcome: "reconstruction" as const, reconstruction: recorded }))
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: CURRENT_TITLE })], { reconstructEvent }),
    )

    const props = {
      params: Promise.resolve({ id: "evt-replay", checkpointId: "11" }),
      searchParams: Promise.resolve({ at: "2026-09-01T00:00:00.000Z" }),
    }
    expect(await generateMetadata(props)).toEqual({ title: "Historical view unavailable" })
    render(await EventCheckpointPage(props))

    expect(screen.getByRole("heading", { name: "Historical view unavailable" })).toBeInTheDocument()
    expect(screen.queryByText(RECORDED_TITLE)).not.toBeInTheDocument()
    expect(screen.queryByText(CURRENT_TITLE)).not.toBeInTheDocument()
    expect(reconstructEvent).not.toHaveBeenCalled()
  })

  it("renders recorded semantics and not the current event title", async () => {
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: CURRENT_TITLE })], {
        reconstructEvent: async () => ({ outcome: "reconstruction", reconstruction: recorded }),
      }),
    )
    const props = {
      params: Promise.resolve({ id: "evt-replay", checkpointId: "11" }),
    }
    expect(await generateMetadata(props)).toEqual({ title: "Checkpoint 11" })
    render(await EventCheckpointPage(props))
    expect(screen.getByText(RECORDED_TITLE)).toBeInTheDocument()
    expect(screen.queryByText(CURRENT_TITLE)).not.toBeInTheDocument()
  })
})
