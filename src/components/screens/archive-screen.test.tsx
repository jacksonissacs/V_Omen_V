import "@/test/next-navigation"

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArchiveView, type ArchiveViewProps } from "@/components/archive/archive-view"
import type { HistoricalReconstruction, HistoryCheckpointSummary } from "@/lib/domain/historical-reconstruction"
import { mockPush, mockSearchParams } from "@/test/next-navigation"

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

  it("opens another event without keeping the previous checkpoint id", async () => {
    mockPush.mockClear()
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=11"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ outcome: "checkpoints", eventId: "evt-a", checkpoints: [], hasMore: false })),
    )
    const user = userEvent.setup()
    render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint="11"
        initialStatus="ok"
        initialReconstruction={reconstruction("evt-a", "11", "Alpha historical title")}
      />,
    )
    await user.selectOptions(screen.getByLabelText("Event"), "evt-b")
    expect(mockPush).toHaveBeenCalledWith("/archive?event=evt-b", { scroll: false })
  })

  it("does not keep an earlier checkpoint on screen after a newer selection resolves", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<Response>>>()
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=11"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        const replay = url.match(/\/history\/(\d+)/)
        if (replay) {
          const gate = deferred<Response>()
          pending.set(replay[1]!, gate)
          return gate.promise
        }
        return json({
          outcome: "checkpoints",
          eventId: "evt-a",
          hasMore: false,
          checkpoints: [summary("12", 2), summary("11", 1)],
        })
      }),
    )
    const view = render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint="11"
        initialStatus="ok"
        initialReconstruction={reconstruction("evt-a", "11", "EARLY_ONLY")}
      />,
    )
    expect(screen.getByText("EARLY_ONLY")).toBeInTheDocument()

    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=12"))
    view.rerender(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint="11"
        initialStatus="ok"
        initialReconstruction={reconstruction("evt-a", "11", "EARLY_ONLY")}
      />,
    )
    expect(screen.queryByText("EARLY_ONLY")).not.toBeInTheDocument()
    expect(screen.getByTestId("archive-checkpoint-loading")).toBeInTheDocument()

    await waitFor(() => {
      expect(pending.has("12")).toBe(true)
    })
    pending.get("12")!.resolve(json(replayBody("evt-a", "12", "LATER_ONLY")))
    await waitFor(() => {
      expect(screen.getByText("LATER_ONLY")).toBeInTheDocument()
    })
    if (pending.has("11")) pending.get("11")!.resolve(json(replayBody("evt-a", "11", "EARLY_ONLY")))
    await waitFor(() => {
      expect(screen.getByText("LATER_ONLY")).toBeInTheDocument()
    })
    expect(screen.queryByText("EARLY_ONLY")).not.toBeInTheDocument()
  })

  it("keeps a successful checkpoint list when replay alone fails", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=11"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/history/11")) {
          return json({ outcome: "unavailable", error: "Event storage is unavailable" }, 503)
        }
        return json({
          outcome: "checkpoints",
          eventId: "evt-a",
          hasMore: false,
          checkpoints: [summary("12", 2), summary("11", 1)],
        })
      }),
    )
    render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint="11"
        initialStatus="ok"
        initialReconstruction={reconstruction("evt-a", "11", "STALE_REPLAY_TITLE")}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId("archive-replay-retry")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /id 11/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /id 12/ })).toBeInTheDocument()
    expect(screen.queryByTestId("archive-unavailable")).not.toBeInTheDocument()
    expect(screen.queryByText("STALE_REPLAY_TITLE")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry replay" })).toBeEnabled()
  })

  it("deep-links a checkpoint outside the first discovery page for navigation", async () => {
    mockPush.mockClear()
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=21"))
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => archiveFetch(input)))
    const user = userEvent.setup()
    render(<ArchiveView {...archiveProps()} />)
    const firstDiscoveryPage = checkpointPageFromQuery(
      "/api/events/evt-a/history?limit=20",
    ).checkpoints
    expect(firstDiscoveryPage.some((item) => item.id === "21")).toBe(false)
    await waitFor(() => {
      expect(screen.getByText("DEEP_LINK_TITLE")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /#100 · id 100/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /#21 · id 21/ })).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /#20 · id 20/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /#22 · id 22/ })).toBeInTheDocument()
    const previous = screen.getByRole("button", { name: "Previous checkpoint" })
    const next = screen.getByRole("button", { name: "Next checkpoint" })
    expect(previous).toBeEnabled()
    expect(next).toBeEnabled()
    await user.click(previous)
    expect(mockPush).toHaveBeenCalledWith("/archive?event=evt-a&checkpoint=20", { scroll: false })
    await user.click(next)
    expect(mockPush).toHaveBeenLastCalledWith("/archive?event=evt-a&checkpoint=22", { scroll: false })
  })

  it("keeps replay when neighbor discovery requests fail", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=21"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.match(/\/history\/21$/)) {
          return json(replayBody("evt-a", "21", "REPLAY_OK_NEIGHBORS_FAIL"))
        }
        if (url.includes("beforeSequence=")) {
          return json({ outcome: "unavailable", error: "Event storage is unavailable" }, 503)
        }
        return archiveFetch(input)
      }),
    )
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("REPLAY_OK_NEIGHBORS_FAIL")).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId("archive-neighbor-retry")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /#21 · id 21/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeDisabled()
    expect(screen.queryByTestId("archive-replay-unavailable")).not.toBeInTheDocument()
  })

  it("keeps replay when neighbor discovery returns malformed JSON", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=21"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.match(/\/history\/21$/)) {
          return json(replayBody("evt-a", "21", "REPLAY_OK_NEIGHBORS_JSON"))
        }
        if (url.includes("beforeSequence=")) {
          return new Response("not-json", { status: 200, headers: { "content-type": "application/json" } })
        }
        return archiveFetch(input)
      }),
    )
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("REPLAY_OK_NEIGHBORS_JSON")).toBeInTheDocument()
    })
    expect(screen.getByTestId("archive-neighbor-retry")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /#21 · id 21/ })).toBeInTheDocument()
  })

  it("drops late neighbor augmentation after the operator changes checkpoints", async () => {
    const neighborGate = deferred<Response>()
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=21"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.match(/\/history\/21$/)) {
          return json(replayBody("evt-a", "21", "CHECKPOINT_21"))
        }
        if (url.match(/\/history\/22$/)) {
          return json(replayBody("evt-a", "22", "CHECKPOINT_22"))
        }
        if (url.includes("beforeSequence=23")) {
          return neighborGate.promise
        }
        return archiveFetch(input)
      }),
    )
    const view = render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("CHECKPOINT_21")).toBeInTheDocument()
    })

    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=22"))
    view.rerender(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("CHECKPOINT_22")).toBeInTheDocument()
    })

    neighborGate.resolve(
      json({
        outcome: "checkpoints",
        eventId: "evt-a",
        hasMore: false,
        checkpoints: [summary("999", 999)],
      }),
    )
    await waitFor(() => {
      expect(screen.getByText("CHECKPOINT_22")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /id 999/ })).not.toBeInTheDocument()
  })

  it("drops late neighbor augmentation after the operator changes events", async () => {
    const neighborGate = deferred<Response>()
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=21"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.match(/\/history\/21$/)) {
          return json(replayBody("evt-a", "21", "EVENT_A_REPLAY"))
        }
        if (url.includes("/api/events/evt-b/")) {
          return json({
            outcome: "checkpoints",
            eventId: "evt-b",
            hasMore: false,
            checkpoints: [summary("300", 1)],
          })
        }
        if (url.includes("beforeSequence=23")) {
          return neighborGate.promise
        }
        return archiveFetch(input)
      }),
    )
    const user = userEvent.setup()
    const view = render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("EVENT_A_REPLAY")).toBeInTheDocument()
    })

    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-b"))
    view.rerender(<ArchiveView {...archiveProps()} />)
    await user.selectOptions(screen.getByLabelText("Event"), "evt-b")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /id 300/ })).toBeInTheDocument()
    })

    neighborGate.resolve(
      json({
        outcome: "checkpoints",
        eventId: "evt-a",
        hasMore: false,
        checkpoints: [summary("999", 999)],
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /id 300/ })).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /id 999/ })).not.toBeInTheDocument()
  })

  it("drops a late older-page response after the operator changes events", async () => {
    const older = deferred<Response>()
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("beforeSequence=")) return older.promise
        if (url.includes("/api/events/evt-b/")) {
          return json({
            outcome: "checkpoints",
            eventId: "evt-b",
            hasMore: false,
            checkpoints: [summary("200", 1)],
          })
        }
        return json({
          outcome: "checkpoints",
          eventId: "evt-a",
          hasMore: true,
          checkpoints: [summary("100", 20)],
        })
      }),
    )
    const user = userEvent.setup()
    const view = render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /id 100/ })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: "Load older checkpoints" }))

    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-b"))
    view.rerender(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /id 200/ })).toBeInTheDocument()
    })
    older.resolve(
      json({
        outcome: "checkpoints",
        eventId: "evt-a",
        hasMore: false,
        checkpoints: [summary("999", 1)],
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /id 200/ })).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /id 999/ })).not.toBeInTheDocument()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function summary(id: string, sequence: number): HistoryCheckpointSummary {
  return {
    id,
    sequence,
    contentMd5: "ab".repeat(16),
    memberCount: 1,
    semanticHistory: "recorded",
  }
}

function reconstruction(eventId: string, checkpointId: string, title: string): HistoricalReconstruction {
  return {
    eventId,
    checkpoint: { id: checkpointId, sequence: Number(checkpointId), contentMd5: "ab".repeat(16), memberCount: 1 },
    coverage: {
      semanticEventFieldsFrom: "2026-09-26T00:00:00.000Z",
      recordAvailabilityRealignedAt: "2026-09-26T00:00:00.000Z",
      semanticHistory: "recorded",
      preBaselineEventRevisions: "not_recorded",
    },
    provenance: "demo",
    semantics: {
      version: 1,
      title,
      question: "Will this checkpoint keep its own title?",
      status: "active",
      deadline: "2026-12-01T00:00:00.000Z",
      resolutionCriteria: "SYNTHETIC TEST resolution criteria for archive navigation.",
      category: "Economics",
      significance: "low",
      region: "Test",
      summary: `Summary for ${title}`,
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
}

function replayBody(eventId: string, checkpointId: string, title: string) {
  const view = reconstruction(eventId, checkpointId, title)
  return {
    outcome: "reconstruction",
    eventId: view.eventId,
    checkpoint: view.checkpoint,
    coverage: view.coverage,
    provenance: view.provenance,
    semantics: view.semantics,
    observations: view.observations,
    evidence: view.evidence,
    moveLogs: view.moveLogs,
  }
}

function archiveProps(): ArchiveViewProps {
  return {
    events: [
      { id: "evt-a", title: "Alpha navigation title" },
      { id: "evt-b", title: "Beta navigation title" },
    ],
    storage: "database",
    provenance: "demo",
    initialEventId: "evt-a",
  }
}

const OFF_PAGE_NEWEST_SEQUENCE = 100
const OFF_PAGE_PAGE_SIZE = 20

function checkpointPageFromQuery(url: string): { checkpoints: HistoryCheckpointSummary[]; hasMore: boolean } {
  const parsed = new URL(url, "http://omen.test")
  const limit = Number(parsed.searchParams.get("limit") ?? OFF_PAGE_PAGE_SIZE)
  const beforeRaw = parsed.searchParams.get("beforeSequence")
  const upper = beforeRaw === null ? OFF_PAGE_NEWEST_SEQUENCE : Number(beforeRaw) - 1
  const checkpoints: HistoryCheckpointSummary[] = []
  for (let sequence = upper; checkpoints.length < limit && sequence >= 1; sequence -= 1) {
    checkpoints.push(summary(String(sequence), sequence))
  }
  const lowestListed = checkpoints.at(-1)?.sequence ?? upper
  return { checkpoints, hasMore: lowestListed > 1 }
}

async function archiveFetch(input: RequestInfo): Promise<Response> {
  const url = String(input)
  if (url.match(/\/history\/21$/)) {
    return json(replayBody("evt-a", "21", "DEEP_LINK_TITLE"))
  }
  if (url.match(/\/history\/22$/)) {
    return json(replayBody("evt-a", "22", "NEWER_CHECKPOINT_TITLE"))
  }
  if (url.includes("/history?")) {
    const page = checkpointPageFromQuery(url)
    return json({
      outcome: "checkpoints",
      eventId: "evt-a",
      hasMore: page.hasMore,
      checkpoints: page.checkpoints,
    })
  }
  throw new Error(`Unexpected fetch: ${url}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
  mockPush.mockClear()
  mockSearchParams.mockReturnValue(new URLSearchParams())
})
