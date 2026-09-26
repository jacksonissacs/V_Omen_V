import "@/test/next-navigation"

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArchiveView, type ArchiveViewProps } from "@/components/archive/archive-view"
import type { HistoricalReconstruction, HistoryCheckpointSummary } from "@/lib/domain/historical-reconstruction"
import { mockPush, mockSearchParams } from "@/test/next-navigation"

const COUNT = 30

describe("archive checkpoint navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockPush.mockClear()
    mockSearchParams.mockReturnValue(new URLSearchParams())
  })

  it("keeps the first page and steps by sequence across page boundaries", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    const seen: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        seen.push(url)
        return historyResponse(url)
      }),
    )
    const user = userEvent.setup()
    const view = render(<ArchiveView {...archiveProps()} />)

    await waitFor(() => {
      expect(screen.getByText("TITLE_5")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeEnabled()
      expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeEnabled()
    })
    expect(listedSequences()).toEqual(expect.arrayContaining([30, 11, 6, 5, 4, 1]))
    expect(listedSequences()).not.toContain(7)
    expectNewestFirst(listedSequences())
    expect(screen.queryByRole("button", { name: "Load older checkpoints" })).not.toBeInTheDocument()
    expect(seen.some((url) => url.includes("beforeSequence=7"))).toBe(true)
    expect(seen.some((url) => url.includes("beforeSequence=5"))).toBe(false)

    for (let sequence = 5; sequence < COUNT; sequence += 1) {
      const href = await clickCheckpoint(user, view, "Next checkpoint")
      expect(href).toBe(`/archive?event=evt-a&checkpoint=${checkpointId(sequence + 1)}`)
      await settle(sequence + 1)
    }
    expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeEnabled()

    for (let sequence = COUNT; sequence > 1; sequence -= 1) {
      const href = await clickCheckpoint(user, view, "Previous checkpoint")
      expect(href).toBe(`/archive?event=evt-a&checkpoint=${checkpointId(sequence - 1)}`)
      await settle(sequence - 1)
    }
    expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeEnabled()
    const sequences = listedSequences()
    expect(sequences).toContain(COUNT)
    expect(sequences).toContain(1)
    expectNewestFirst(sequences)
    expect(screen.queryByRole("button", { name: "Load older checkpoints" })).not.toBeInTheDocument()
  }, 20_000)

  it("requests the older neighbor when the newer one is already on the first page", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(10)}`))
    const seen: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        seen.push(String(input))
        return historyResponse(String(input))
      }),
    )
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("TITLE_10")).toBeInTheDocument()
    })
    expect(seen.some((url) => url.includes("beforeSequence=10"))).toBe(true)
    expect(seen.some((url) => url.includes("beforeSequence=12"))).toBe(false)
    expect(listedSequences()).toEqual(expect.arrayContaining([30, 11, 10, 9, 1]))
    expectNewestFirst(listedSequences())
    expect(screen.queryByRole("button", { name: "Load older checkpoints" })).not.toBeInTheDocument()
  })

  it("does not let a middle neighbor page hide older checkpoints", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=id-1025"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/history/id-1025")) return json(replayAt("evt-a", "id-1025", 25, "TITLE_25"))
        if (url.includes("beforeSequence=27")) {
          return json({
            outcome: "checkpoints",
            eventId: "evt-a",
            hasMore: false,
            checkpoints: Array.from({ length: 20 }, (_, index) => summary(checkpointId(26 - index), 26 - index)),
          })
        }
        if (url.includes("/history?")) return json(listedPage(50))
        throw new Error(url)
      }),
    )
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("TITLE_25")).toBeInTheDocument()
    })
    expect(listedSequences()).toEqual(expect.arrayContaining([50, 31, 26, 25, 7]))
    expect(listedSequences()).not.toContain(1)
    expect(screen.getByRole("button", { name: "Load older checkpoints" })).toBeEnabled()
  })

  it("keeps a loaded older page when the neighbor read resolves later", async () => {
    const newer = deferred<Response>()
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("beforeSequence=7")) return newer.promise
        return historyResponse(url, 30, { olderLimit: 1 })
      }),
    )
    const user = userEvent.setup()
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load older checkpoints" })).toBeEnabled()
    })
    await user.click(screen.getByRole("button", { name: "Load older checkpoints" }))
    await waitFor(() => {
      expect(listedSequences()).toContain(10)
    })
    newer.resolve(json(listedPage(30, 7)))
    await waitFor(() => {
      expect(screen.getByText("TITLE_5")).toBeInTheDocument()
      expect(listedSequences()).toEqual(expect.arrayContaining([30, 10, 6, 5, 1]))
    })
    expectNewestFirst(listedSequences())
    expect(screen.queryByRole("button", { name: "Load older checkpoints" })).not.toBeInTheDocument()
  })

  it("keeps a successful replay when the neighbor read throws", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("beforeSequence=")) throw new Error("neighbor failed")
        return historyResponse(url)
      }),
    )
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("TITLE_5")).toBeInTheDocument()
    })
    expect(screen.queryByTestId("archive-replay-retry")).not.toBeInTheDocument()
    expect(screen.queryByTestId("archive-replay-unavailable")).not.toBeInTheDocument()
    expect(listedSequences()).toEqual(expect.arrayContaining([30, 11, 5]))
    expect(listedSequences()).not.toContain(6)
    expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Load older checkpoints" })).toBeEnabled()
  })

  it("names a list failure without calling the replay a failure", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/history?")) throw new Error("list failed")
        return historyResponse(url)
      }),
    )
    render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("TITLE_5")).toBeInTheDocument()
    })
    expect(screen.getByTestId("archive-unavailable")).toHaveTextContent("The checkpoint list could not be loaded.")
    expect(screen.getByTestId("archive-unavailable")).not.toHaveTextContent("Historical reconstruction cannot be loaded")
    expect(screen.queryByTestId("archive-replay-unavailable")).not.toBeInTheDocument()
    expect(screen.queryByTestId("archive-replay-retry")).not.toBeInTheDocument()
  })

  it("keeps server-rendered checkpoints and hasMore when the client list refetch throws", async () => {
    const firstPage = catalog(30).slice(0, 20)
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/history?")) throw new Error("list failed")
        return historyResponse(url)
      }),
    )
    render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint={checkpointId(5)}
        initialStatus="ok"
        initialHasMore
        initialReconstruction={reconstructionAt("evt-a", checkpointId(5), 5, "SSR_REPLAY")}
        initialCheckpoints={[...firstPage, summary(checkpointId(5), 5)]}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText("TITLE_5")).toBeInTheDocument()
      expect(screen.getByTestId("archive-unavailable")).toBeInTheDocument()
    })
    expect(listedSequences()).toEqual(expect.arrayContaining([30, 11, 5]))
    expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Load older checkpoints" })).toBeEnabled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows the checkpoint after replay retry succeeds", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=id-1002"))
    let replayAttempts = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/history/id-1002")) {
          replayAttempts += 1
          if (replayAttempts === 1) return json({ outcome: "unavailable", error: "Event storage is unavailable" }, 503)
          return json(replayAt("evt-a", "id-1002", 2, "RECOVERED_TITLE"))
        }
        return json({
          outcome: "checkpoints",
          eventId: "evt-a",
          hasMore: false,
          checkpoints: [summary("id-1002", 2), summary("id-1001", 1)],
        })
      }),
    )
    const user = userEvent.setup()
    render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint="id-1002"
        initialStatus="ok"
        initialReconstruction={reconstructionAt("evt-a", "id-1002", 2, "STALE_REPLAY_TITLE")}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId("archive-replay-retry")).toBeInTheDocument()
    })
    expect(screen.queryByText("STALE_REPLAY_TITLE")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Retry replay" }))
    await waitFor(() => {
      expect(screen.getByText("RECOVERED_TITLE")).toBeInTheDocument()
    })
    expect(screen.queryByTestId("archive-replay-retry")).not.toBeInTheDocument()
    expect(screen.queryByTestId("archive-replay-unavailable")).not.toBeInTheDocument()
    expect(listedSequences()).toEqual([2, 1])
  })

  it("reports list and replay failures separately and drops a stale reconstruction", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(11)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/history?")) throw new Error("list failed")
        return json({ outcome: "unavailable", error: "Event storage is unavailable" }, 503)
      }),
    )
    render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint={checkpointId(11)}
        initialStatus="ok"
        initialHasMore
        initialReconstruction={reconstructionAt("evt-a", checkpointId(11), 11, "STALE_REPLAY_TITLE")}
        initialCheckpoints={[summary(checkpointId(11), 11)]}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId("archive-replay-unavailable")).toHaveTextContent(
        "Historical reconstruction cannot be loaded",
      )
    })
    expect(screen.getByTestId("archive-unavailable")).toHaveTextContent("The checkpoint list could not be loaded.")
    expect(screen.queryByText("STALE_REPLAY_TITLE")).not.toBeInTheDocument()
    expect(listedSequences()).toEqual([11])
    expect(screen.getByRole("button", { name: "Load older checkpoints" })).toBeEnabled()
  })

  it("drops a replay that resolves after the operator switches events", async () => {
    const pending = deferred<Response>()
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes(`/history/${checkpointId(5)}`)) return pending.promise
        if (url.includes("/api/events/evt-b/")) {
          return json({
            outcome: "checkpoints",
            eventId: "evt-b",
            hasMore: false,
            checkpoints: [summary("id-2001", 1)],
          })
        }
        return historyResponse(url)
      }),
    )
    const view = render(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint={checkpointId(5)}
        initialStatus="ok"
        initialReconstruction={reconstructionAt("evt-a", checkpointId(5), 5, "OLD_EVENT_TITLE")}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText("OLD_EVENT_TITLE")).toBeInTheDocument()
    })
    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-b"))
    view.rerender(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /id id-2001/ })).toBeInTheDocument()
    })
    pending.resolve(json(replayAt("evt-a", checkpointId(5), 5, "LATE_REPLAY_TITLE")))
    await waitFor(() => {
      expect(screen.queryByText("OLD_EVENT_TITLE")).not.toBeInTheDocument()
    })
    expect(screen.queryByText("LATE_REPLAY_TITLE")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /id id-1005/ })).not.toBeInTheDocument()
  })

  it("drops a neighbor page that resolves after the checkpoint changes", async () => {
    const newer = deferred<Response>()
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("beforeSequence=7")) return newer.promise
        return historyResponse(url)
      }),
    )
    const view = render(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("TITLE_5")).toBeInTheDocument()
    })
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(30)}`))
    view.rerender(<ArchiveView {...archiveProps()} />)
    await waitFor(() => {
      expect(screen.getByText("TITLE_30")).toBeInTheDocument()
    })
    newer.resolve(
      json({
        outcome: "checkpoints",
        eventId: "evt-a",
        hasMore: false,
        checkpoints: [summary("id-9999", 999)],
      }),
    )
    await waitFor(() => {
      expect(screen.getByText("TITLE_30")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /id id-9999/ })).not.toBeInTheDocument()
  })

  it("disables sequence steps on a gapped first paint", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(`event=evt-a&checkpoint=${checkpointId(5)}`))
    const html = renderToStaticMarkup(
      <ArchiveView
        {...archiveProps()}
        initialCheckpoint={checkpointId(5)}
        initialStatus="ok"
        initialHasMore={false}
        initialReconstruction={reconstructionAt("evt-a", checkpointId(5), 5, "SSR_TITLE")}
        initialCheckpoints={[...catalog(30).slice(0, 20), summary(checkpointId(5), 5)]}
      />,
    )
    expect(buttonTag(html, "Next checkpoint")).toContain("disabled")
    expect(buttonTag(html, "Previous checkpoint")).toContain("disabled")
    expect(html).toContain("id-1005")
    expect(html).toContain("id-1011")
    expect(html).not.toContain("id-1006")
    expect(html).not.toContain("id-1004")
  })
})

function checkpointId(sequence: number): string {
  return `id-${1000 + sequence}`
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

function catalog(count: number): HistoryCheckpointSummary[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = count - index
    return summary(checkpointId(sequence), sequence)
  })
}

function listedPage(count: number, beforeSequence?: number, limit = 20) {
  const filtered =
    beforeSequence === undefined ? catalog(count) : catalog(count).filter((item) => item.sequence < beforeSequence)
  const checkpoints = filtered.slice(0, limit)
  return {
    outcome: "checkpoints" as const,
    eventId: "evt-a",
    hasMore: filtered.length > checkpoints.length,
    checkpoints,
  }
}

function historyResponse(url: string, count = COUNT, options?: { olderLimit?: number }): Response {
  const replay = url.match(/\/history\/(id-\d+)$/)
  if (replay) {
    const sequence = Number(replay[1]!.slice(3)) - 1000
    return json(replayAt("evt-a", replay[1]!, sequence, `TITLE_${sequence}`))
  }
  const before = new URL(url, "http://omen.test").searchParams.get("beforeSequence")
  const beforeSequence = before === null ? undefined : Number(before)
  const limit = options?.olderLimit && beforeSequence !== undefined && beforeSequence !== count + 2 ? options.olderLimit : 20
  return json(listedPage(count, beforeSequence, limit))
}

function listedSequences(): number[] {
  const list = screen.getByRole("listbox", { name: "Recorded checkpoints" })
  return within(list)
    .getAllByRole("option")
    .map((option) => Number(option.textContent?.match(/#(\d+)/)?.[1]))
}

function expectNewestFirst(sequences: number[]) {
  expect(new Set(sequences).size).toBe(sequences.length)
  for (let index = 1; index < sequences.length; index += 1) {
    expect(sequences[index]).toBeLessThan(sequences[index - 1]!)
  }
}

async function settle(sequence: number) {
  await waitFor(() => {
    expect(screen.getByText(`TITLE_${sequence}`)).toBeInTheDocument()
    if (sequence === 1) {
      expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeEnabled()
    } else if (sequence === COUNT) {
      expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeEnabled()
    } else {
      expect(screen.getByRole("button", { name: "Next checkpoint" })).toBeEnabled()
      expect(screen.getByRole("button", { name: "Previous checkpoint" })).toBeEnabled()
    }
  })
}

async function clickCheckpoint(
  user: ReturnType<typeof userEvent.setup>,
  view: ReturnType<typeof render>,
  name: "Next checkpoint" | "Previous checkpoint",
) {
  const button = screen.getByRole("button", { name })
  await waitFor(() => expect(button).toBeEnabled())
  mockPush.mockClear()
  await user.click(button)
  const href = String(mockPush.mock.calls.at(-1)?.[0])
  mockSearchParams.mockReturnValue(new URLSearchParams(href.slice(href.indexOf("?") + 1)))
  view.rerender(<ArchiveView {...archiveProps()} />)
  return href
}

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

function reconstructionAt(
  eventId: string,
  checkpointIdValue: string,
  sequence: number,
  title: string,
): HistoricalReconstruction {
  return {
    eventId,
    checkpoint: { id: checkpointIdValue, sequence, contentMd5: "ab".repeat(16), memberCount: 1 },
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

function replayAt(eventId: string, checkpointIdValue: string, sequence: number, title: string) {
  const view = reconstructionAt(eventId, checkpointIdValue, sequence, title)
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

function buttonTag(html: string, label: string): string {
  const match = html.match(new RegExp(`<button\\b[^>]*>${label}</button>`))
  expect(match).not.toBeNull()
  return match![0]
}
