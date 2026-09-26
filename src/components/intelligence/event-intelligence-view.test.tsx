import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import "@/test/next-navigation"

import { EventIntelligenceView } from "@/components/intelligence/event-intelligence-view"
import { AppShell } from "@/components/layout/app-shell"
import { MockIntelligenceRepository } from "@/lib/data/mock-repository"
import { groupIntoSeries } from "@/lib/domain/probability-history"
import { testEvent } from "@/test/fake-repository"
import type { AionEvent, ProbabilitySeries, StoredForecast } from "@/types/event"

const repository = new MockIntelligenceRepository()

async function loadEvent(id: string) {
  const event = await repository.getEvent(id)
  if (!event) throw new Error("fixture missing")
  return { event, related: await repository.getRelatedEvents(id) }
}

function renderView(event: AionEvent, related: AionEvent[] = []) {
  const user = userEvent.setup()
  render(
    <AppShell>
      <EventIntelligenceView event={event} related={related} />
    </AppShell>,
  )
  return { user }
}

function sourcedSeries(
  probabilityType: ProbabilitySeries["probabilityType"],
  points: Array<[string, number]>,
  sourceName = "Exchange A",
): ProbabilitySeries[] {
  return groupIntoSeries(
    points.map(([observedAt, probability]) => ({
      sourceKind: probabilityType === "market_implied" ? "provider" : "author",
      sourceName,
      probabilityType,
      provenance: "sourced",
      observedAt,
      capturedAt: new Date(new Date(observedAt).getTime() + 60_000).toISOString(),
      probability,
    })),
  )
}

const tableRows = () => within(screen.getByTestId("observation-table")).getAllByRole("row").slice(1)

describe("EventIntelligenceView", () => {
  it("answers the core questions from recorded observations", async () => {
    const { event, related } = await loadEvent("evt-boc-cut")
    renderView(event, related)

    expect(screen.getByRole("heading", { name: event.title })).toBeInTheDocument()
    for (const label of ["What changed?", "When did it change?", "What is this probability?", "What likely caused it?"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText("Current probability").nextSibling).toHaveTextContent("73.8%")
    expect(screen.getByText("Previous observation").nextSibling).toHaveTextContent("61.2%")
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("+12.6 pp")
    expect(screen.getByTestId("event-record")).toHaveTextContent(
      "61.2% at 01 Sept, 12:00 UTC → 73.8% at 04 Sept, 18:42 UTC, 3 d 6 h 42 min apart, in the same series.",
    )
  })

  it("filters the chart and point table by the selected time range", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    const { user } = renderView(event)

    expect(screen.getByRole("button", { name: "ALL" })).toHaveAttribute("aria-pressed", "true")
    expect(tableRows()).toHaveLength(4)
    expect(screen.getAllByTestId("chart-point")).toHaveLength(4)
    expect(screen.getByTestId("range-summary")).toHaveTextContent("48.0% → 73.8%, +25.8 pp")

    await user.click(screen.getByRole("button", { name: "1W" }))
    expect(tableRows()).toHaveLength(2)
    expect(screen.getAllByTestId("chart-point")).toHaveLength(2)
    expect(screen.getByTestId("range-summary")).toHaveTextContent("61.2% → 73.8%, +12.6 pp")
    expect(screen.getByTestId("range-summary")).toHaveTextContent("ends at the latest recorded observation")

    await user.click(screen.getByRole("button", { name: "1D" }))
    expect(tableRows()).toHaveLength(1)
    expect(screen.getAllByTestId("chart-point")).toHaveLength(1)
    expect(screen.getByTestId("range-summary")).toHaveTextContent("Only one observation falls in this range")
    expect(screen.getByTestId("range-summary")).toHaveTextContent("The previous observation, 61.2%")
    expect(within(tableRows()[0]!).getByText("+12.6 pp")).toBeInTheDocument()
  })

  it("marks the part of a range with no recorded history", async () => {
    const event = testEvent({
      id: "evt-short",
      title: "Short history",
      probabilitySeries: sourcedSeries("market_implied", [
        ["2026-09-03T00:00:00.000Z", 40],
        ["2026-09-04T00:00:00.000Z", 43],
      ]),
    })
    const { user } = renderView(event)
    expect(screen.queryByTestId("chart-missing-history")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "1W" }))
    expect(screen.getByTestId("chart-missing-history")).toHaveTextContent("No recorded observations")
    expect(screen.getAllByTestId("chart-point")).toHaveLength(2)
  })

  it("says so when no observations are recorded instead of drawing a chart", () => {
    const event = testEvent({ id: "evt-empty", title: "Empty history", probabilitySeries: [], expectationHistory: [] })
    renderView(event)
    expect(screen.getByTestId("history-empty")).toHaveTextContent("No probability observations are recorded")
    expect(screen.queryByTestId("probability-chart")).not.toBeInTheDocument()
    expect(screen.getByText("Current probability").nextSibling).toHaveTextContent("Not recorded")
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("Not computable")
  })

  it("does not compute a change from a single observation", () => {
    const event = testEvent({
      id: "evt-single",
      title: "Single observation",
      probabilitySeries: sourcedSeries("market_implied", [["2026-09-04T00:00:00.000Z", 41]]),
    })
    renderView(event)
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("Not computable")
    expect(screen.getByText("Previous observation").nextSibling).toHaveTextContent("None recorded")
    expect(screen.getAllByTestId("chart-point")).toHaveLength(1)
  })

  it("shows no fabricated estimate, attribution percentage or unsupported chart mode", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    renderView(event)

    expect(screen.queryByText(/OMEN estimate/i)).not.toBeInTheDocument()
    expect(screen.queryByText("OMEN forecast", { selector: ".aion-event-figure-label" })).not.toBeInTheDocument()
    expect(screen.getByTestId("event-record")).toHaveTextContent("No OMEN forecast has been recorded for this event.")
    for (const label of [/Identification confidence/, /Coverage of move/, /Data quality/, /Similarity/, /σ/]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
    for (const mode of ["Volume", "Spread", "Related"]) {
      expect(screen.queryByRole("button", { name: mode })).not.toBeInTheDocument()
    }
    expect(screen.getByTestId("event-record")).toHaveTextContent("not a live feed")
    expect(document.body.textContent?.replace(/not a live feed/gi, "")).not.toMatch(/\b(live|real-time|streaming)\b/i)
  })

  it("shows an OMEN forecast only when a complete stored forecast exists", () => {
    const forecast: StoredForecast = {
      id: "fc-1",
      author: "OMEN research",
      model: "omen-baseline-v0",
      probability: 66,
      issuedAt: "2026-09-04T01:00:00.000Z",
      method: "Base rate from prior decisions.",
      evidenceCutoff: "2026-09-04T00:30:00.000Z",
      provenance: "sourced",
    }
    const base = {
      probabilitySeries: sourcedSeries("market_implied", [
        ["2026-09-03T00:00:00.000Z", 40],
        ["2026-09-04T00:00:00.000Z", 43],
      ]),
    }
    const { unmount } = render(
      <AppShell>
        <EventIntelligenceView
          event={testEvent({ id: "evt-incomplete", title: "Incomplete", ...base, forecasts: [{ ...forecast, method: "" }] })}
          related={[]}
        />
      </AppShell>,
    )
    expect(screen.queryByText("OMEN forecast", { selector: ".aion-event-figure-label" })).not.toBeInTheDocument()
    expect(screen.getByTestId("event-record")).toHaveTextContent("No OMEN forecast has been recorded")
    unmount()

    renderView(testEvent({ id: "evt-forecast", title: "Forecasted", ...base, forecasts: [forecast] }))
    expect(screen.getByText("OMEN forecast", { selector: ".aion-event-figure-label" }).nextSibling).toHaveTextContent("66.0%")
    const record = screen.getByTestId("event-record")
    expect(record).toHaveTextContent("by OMEN research · omen-baseline-v0")
    expect(record).toHaveTextContent("method: Base rate from prior decisions.")
    expect(record).toHaveTextContent("evidence cutoff 04 Sept, 00:30 UTC")
  })

  it("labels demo probabilities illustrative, never market-implied", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    renderView(event)
    expect(screen.getByTestId("probability-basis")).toHaveTextContent("Illustrative probability")
    expect(screen.queryByText(/Market-implied/)).not.toBeInTheDocument()
    expect(screen.getByTestId("event-record")).toHaveTextContent("Not observed from a market or stated by a forecaster.")
  })

  it("labels sourced market-implied and authored series accurately and charts them separately", async () => {
    const event = testEvent({
      id: "evt-mixed",
      title: "Mixed series",
      provenance: "sourced",
      probabilitySeries: [
        ...sourcedSeries("market_implied", [
          ["2026-09-03T00:00:00.000Z", 40],
          ["2026-09-04T00:00:00.000Z", 43],
        ]),
        ...sourcedSeries("forecaster_estimate", [["2026-09-04T06:00:00.000Z", 70]], "Forecaster B"),
      ],
    })
    const { user } = renderView(event)
    expect(screen.getByTestId("probability-basis")).toHaveTextContent("Market-implied probability")
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("+3.0 pp")

    const select = screen.getByRole("combobox", { name: "Series" })
    await user.selectOptions(select, screen.getByRole("option", { name: "Authored forecast · Forecaster B" }))
    expect(tableRows()).toHaveLength(1)
    expect(within(tableRows()[0]!).getByText("70.0%")).toBeInTheDocument()
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("+3.0 pp")
  })

  it("separates observed facts, interpretation and open questions", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    renderView(event)
    const observed = screen.getByRole("region", { name: "Observed" })
    expect(observed).toHaveTextContent("Statistics Canada CPI, August 2026")
    expect(observed).toHaveTextContent("Published 04 Sept, 18:30 UTC")
    const interpretation = screen.getByRole("region", { name: "Interpretation" })
    expect(interpretation).toHaveTextContent("No move log has been published")
    expect(interpretation).toHaveTextContent("Illustrative demo text.")
    expect(interpretation).toHaveTextContent("Statistics Canada CPI release")
    const unknown = screen.getByRole("region", { name: "Still unknown" })
    expect(unknown).toHaveTextContent("Canadian housing did not reprice with the rate shock")
  })

  it("builds the change timeline only from recorded times", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    renderView(event)
    const chronology = screen.getByTestId("recorded-chronology")
    expect(chronology.querySelectorAll('[data-kind="observation"]')).toHaveLength(4)
    expect(chronology).not.toHaveTextContent("OMEN detects abnormal movement")
    expect(chronology).not.toHaveTextContent("+4.2")
  })

  it("puts Inspect evidence first and offers no prediction entry", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    const { user } = renderView(event)
    const actions = screen.getByRole("button", { name: "Inspect evidence" }).parentElement!
    expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Inspect evidence",
      "Follow",
    ])
    expect(screen.queryByRole("button", { name: "Make a call" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Record" }))
    await user.click(screen.getByRole("button", { name: "Inspect evidence" }))
    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getAllByTestId("evidence-item")).toHaveLength(event.evidence.length)
    expect(screen.getByRole("complementary", { name: "Evidence inspector" })).toHaveFocus()
  })

  it("scrolls to and focuses the evidence inspector when scrolling is supported", async () => {
    const { event } = await loadEvent("evt-boc-cut")
    const { user } = renderView(event)
    const inspector = screen.getByRole("complementary", { name: "Evidence inspector" })
    const scrollIntoView = vi.fn()
    Object.defineProperty(inspector, "scrollIntoView", { value: scrollIntoView, configurable: true })

    await user.click(screen.getByRole("tab", { name: "Record" }))
    await user.click(screen.getByRole("button", { name: "Inspect evidence" }))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })
    expect(inspector).toHaveFocus()
    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("aria-selected", "true")
  })

  it("shows evidence publication, first-observed and capture times", () => {
    const event = testEvent({
      id: "evt-evidence",
      title: "Evidence times",
      evidence: [
        {
          id: "ev-1",
          name: "Agency release",
          publishedAt: "2026-09-04T10:00:00.000Z",
          firstObservedAt: "2026-09-04T10:02:00.000Z",
          capturedAt: "2026-09-04T10:03:00.000Z",
          summary: "Release text.",
          stance: "supports",
          reliability: 0.9,
        },
      ],
    })
    renderView(event)
    const item = screen.getByTestId("evidence-item")
    expect(within(item).getByText("Source published").nextSibling).toHaveTextContent("04 Sept, 10:00 UTC")
    expect(within(item).getByText("First observed by OMEN").nextSibling).toHaveTextContent("04 Sept, 10:02 UTC")
    expect(within(item).getByText("Captured by OMEN").nextSibling).toHaveTextContent("04 Sept, 10:03 UTC")
  })

  it("toggles the watchlist from the intelligence view", async () => {
    const { event, related } = await loadEvent("evt-gpu-export")
    const { user } = renderView(event, related)
    await user.click(screen.getByRole("button", { name: `Follow ${event.title}` }))
    expect(screen.getByRole("button", { name: `Unfollow ${event.title}` })).toBeInTheDocument()
  })

  it("links only the related events it is given", async () => {
    const { event, related } = await loadEvent("evt-boc-cut")

    const { unmount } = render(
      <AppShell>
        <EventIntelligenceView event={event} related={related} />
      </AppShell>,
    )
    for (const item of related) {
      expect(screen.getByRole("link", { name: new RegExp(item.title) })).toHaveAttribute(
        "href",
        `/events/${item.id}`,
      )
    }
    unmount()

    render(
      <AppShell>
        <EventIntelligenceView event={event} related={[]} />
      </AppShell>,
    )
    expect(screen.getByText("No linked events in the current book.")).toBeInTheDocument()
  })
})
