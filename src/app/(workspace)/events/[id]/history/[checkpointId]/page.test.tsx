import "@/test/next-navigation"

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import EventCheckpointPage, { generateMetadata } from "@/app/(workspace)/events/[id]/history/[checkpointId]/page"
import { invalidCheckpointId, type HistoricalReconstruction } from "@/lib/domain/historical-reconstruction"
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
  window.history.pushState(null, "", "/")
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

  it("copies the checkpoint URL that reconstructs this view, including a deep-link hash", async () => {
    window.history.pushState(null, "", "/events/evt-replay/history/11#semantics")
    const webShare = vi.fn()
    Object.defineProperty(navigator, "share", { configurable: true, value: webShare })
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: CURRENT_TITLE })], {
        reconstructEvent: async () => ({ outcome: "reconstruction", reconstruction: recorded }),
      }),
    )
    const user = userEvent.setup()
    render(
      await EventCheckpointPage({
        params: Promise.resolve({ id: "evt-replay", checkpointId: "11" }),
      }),
    )

    expect(screen.getByTestId("historical-reconstruction")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Share" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Share" }))

    expect(await screen.findByText("Link copied")).toBeInTheDocument()
    const copied = await navigator.clipboard.readText()
    expect(copied).toBe(window.location.href)
    const url = new URL(copied)
    expect(url.pathname).toBe("/events/evt-replay/history/11")
    expect(url.hash).toBe("#semantics")
    expect(invalidCheckpointId("11")).toBeUndefined()
    expect(url.searchParams.has("at")).toBe(false)
    expect(url.searchParams.has("cutoff")).toBe(false)
    expect(url.searchParams.has("checkpoint")).toBe(false)
    expect(copied).not.toContain(CURRENT_TITLE)
    expect(webShare).not.toHaveBeenCalled()
  })

  it("keeps an arbitrary-time checkpoint URL intact instead of inventing a replayable one", async () => {
    const asked = "/events/evt-replay/history/11?at=2026-09-01T00:00:00.000Z"
    window.history.pushState(null, "", asked)
    const reconstructEvent = vi.fn(async () => ({ outcome: "reconstruction" as const, reconstruction: recorded }))
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: CURRENT_TITLE })], { reconstructEvent }),
    )
    const user = userEvent.setup()
    render(
      await EventCheckpointPage({
        params: Promise.resolve({ id: "evt-replay", checkpointId: "11" }),
        searchParams: Promise.resolve({ at: "2026-09-01T00:00:00.000Z" }),
      }),
    )

    expect(screen.queryByText(RECORDED_TITLE)).not.toBeInTheDocument()
    expect(screen.queryByText(CURRENT_TITLE)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Share" }))
    expect(await screen.findByText("Link copied")).toBeInTheDocument()
    const copied = await navigator.clipboard.readText()
    expect(copied).toBe(window.location.href)
    expect(new URL(copied).searchParams.get("at")).toBe("2026-09-01T00:00:00.000Z")
    expect(reconstructEvent).not.toHaveBeenCalled()
  })

  it("offers share on a pre-coverage checkpoint without substituting the current title", async () => {
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: CURRENT_TITLE })], {
        reconstructEvent: async () => ({ outcome: "pre_coverage", reconstruction: recorded }),
      }),
    )
    render(
      await EventCheckpointPage({
        params: Promise.resolve({ id: "evt-replay", checkpointId: "11" }),
      }),
    )
    expect(screen.getByRole("heading", { name: "Semantic history not yet recorded" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Share" })).toBeVisible()
    expect(screen.queryByText(CURRENT_TITLE)).not.toBeInTheDocument()
  })
})
