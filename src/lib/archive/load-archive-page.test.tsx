import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import "@/test/next-navigation"

import { ArchiveView } from "@/components/archive/archive-view"
import { loadArchivePageData } from "@/lib/archive/load-archive-page"
import type { HistoryCheckpointSummary, ReconstructionOutcome } from "@/lib/domain/historical-reconstruction"
import { fakeRepository, testEvent } from "@/test/fake-repository"
import { mockSearchParams } from "@/test/next-navigation"

const { getRepository } = vi.hoisted(() => ({
  getRepository: vi.fn(),
}))

vi.mock("@/lib/data/repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data/repository")>()
  return { ...original, getRepository }
})

describe("loadArchivePageData", () => {
  it("loads neighbors for a deep-linked checkpoint outside the first page", async () => {
    const queries: Array<{ limit?: number; beforeSequence?: number } | undefined> = []
    const checkpoints = catalog(30)
    getRepository.mockReturnValue(
      fakeRepository([testEvent({ id: "evt-a", title: "Alpha" })], {
        listHistoryCheckpoints: async (_eventId, query) => {
          queries.push(query)
          return page(checkpoints, query)
        },
        reconstructEvent: async () => replay("id-1005", 5),
      }),
    )

    const loaded = await loadArchivePageData({ event: "evt-a", checkpoint: "id-1005" })
    expect(loaded.initialStatus).toBe("ok")
    expect(loaded.initialHasMore).toBe(false)
    expect(queries.map((query) => query?.beforeSequence)).toEqual([undefined, 7])
    const ids = loaded.initialCheckpoints.map((item) => item.id)
    expect(ids).toContain("id-1030")
    expect(ids).toContain("id-1011")
    expect(ids).toContain("id-1006")
    expect(ids).toContain("id-1005")
    expect(ids).toContain("id-1004")
    expect(ids).toContain("id-1001")
    expect(new Set(ids).size).toBe(ids.length)

    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=id-1005"))
    const html = renderToStaticMarkup(
      <ArchiveView
        events={loaded.events}
        storage={loaded.storage}
        provenance={loaded.provenance}
        initialEventId={loaded.initialEventId}
        initialCheckpoint={loaded.initialCheckpoint}
        initialReconstruction={loaded.initialReconstruction}
        initialCheckpoints={loaded.initialCheckpoints}
        initialHasMore={loaded.initialHasMore}
        initialStatus={loaded.initialStatus}
      />,
    )
    expect(buttonTag(html, "Previous checkpoint")).not.toContain("disabled")
    expect(buttonTag(html, "Next checkpoint")).not.toContain("disabled")
    expect(html).not.toContain("Load older checkpoints")
    expect(html).toContain("id-1006")
    expect(html).toContain("id-1004")
  })

  it("keeps the first page when a neighbor read fails and does not call that the end", async () => {
    const checkpoints = catalog(30)
    getRepository.mockReturnValue(
      fakeRepository([testEvent({ id: "evt-a", title: "Alpha" })], {
        listHistoryCheckpoints: async (_eventId, query) => {
          if (query?.beforeSequence !== undefined) throw new Error("neighbor unavailable")
          return page(checkpoints, query)
        },
        reconstructEvent: async () => replay("id-1005", 5),
      }),
    )

    const loaded = await loadArchivePageData({ event: "evt-a", checkpoint: "id-1005" })
    expect(loaded.initialStatus).toBe("ok")
    expect(loaded.initialReconstruction?.checkpoint.id).toBe("id-1005")
    expect(loaded.initialHasMore).toBe(true)
    const ids = loaded.initialCheckpoints.map((item) => item.id)
    expect(ids).toContain("id-1030")
    expect(ids).toContain("id-1005")
    expect(ids).not.toContain("id-1006")

    mockSearchParams.mockReturnValue(new URLSearchParams("event=evt-a&checkpoint=id-1005"))
    const html = renderToStaticMarkup(
      <ArchiveView
        events={loaded.events}
        storage={loaded.storage}
        provenance={loaded.provenance}
        initialEventId={loaded.initialEventId}
        initialCheckpoint={loaded.initialCheckpoint}
        initialReconstruction={loaded.initialReconstruction}
        initialCheckpoints={loaded.initialCheckpoints}
        initialHasMore={loaded.initialHasMore}
        initialStatus={loaded.initialStatus}
      />,
    )
    expect(buttonTag(html, "Next checkpoint")).toContain("disabled")
    expect(buttonTag(html, "Previous checkpoint")).toContain("disabled")
    expect(html).toContain("Load older checkpoints")
  })

  it("preserves listed checkpoints when replay alone fails", async () => {
    getRepository.mockReturnValue(
      fakeRepository([testEvent({ id: "evt-a", title: "Alpha" })], {
        listHistoryCheckpoints: async () => ({
          outcome: "checkpoints",
          eventId: "evt-a",
          limit: 20,
          hasMore: false,
          checkpoints: [
            {
              id: "12",
              sequence: 2,
              contentMd5: "ab".repeat(16),
              memberCount: 1,
              semanticHistory: "recorded",
            },
          ],
        }),
        reconstructEvent: async () => {
          throw new Error("replay unavailable")
        },
      }),
    )

    const loaded = await loadArchivePageData({ event: "evt-a", checkpoint: "12" })
    expect(loaded.initialStatus).toBe("unavailable")
    expect(loaded.initialReconstruction).toBeNull()
    expect(loaded.initialHasMore).toBe(false)
    expect(loaded.initialCheckpoints).toEqual([
      {
        id: "12",
        sequence: 2,
        contentMd5: "ab".repeat(16),
        memberCount: 1,
        semanticHistory: "recorded",
      },
    ])
  })

  it("keeps hasMore when replay fails before the first page reaches sequence 1", async () => {
    getRepository.mockReturnValue(
      fakeRepository([testEvent({ id: "evt-a", title: "Alpha" })], {
        listHistoryCheckpoints: async () => page(catalog(30)),
        reconstructEvent: async () => {
          throw new Error("replay unavailable")
        },
      }),
    )

    const loaded = await loadArchivePageData({ event: "evt-a", checkpoint: "id-1005" })
    expect(loaded.initialStatus).toBe("unavailable")
    expect(loaded.initialReconstruction).toBeNull()
    expect(loaded.initialHasMore).toBe(true)
    expect(loaded.initialCheckpoints.map((item) => item.sequence)).toEqual(
      Array.from({ length: 20 }, (_, index) => 30 - index),
    )
  })
})

function catalog(count: number): HistoryCheckpointSummary[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = count - index
    return {
      id: `id-${1000 + sequence}`,
      sequence,
      contentMd5: "ab".repeat(16),
      memberCount: 1,
      semanticHistory: "recorded" as const,
    }
  })
}

function page(checkpoints: HistoryCheckpointSummary[], query?: { limit?: number; beforeSequence?: number }) {
  const limit = query?.limit ?? 20
  const filtered =
    query?.beforeSequence === undefined
      ? checkpoints
      : checkpoints.filter((item) => item.sequence < query.beforeSequence!)
  const slice = filtered.slice(0, limit)
  return {
    outcome: "checkpoints" as const,
    eventId: "evt-a",
    limit,
    hasMore: filtered.length > slice.length,
    checkpoints: slice,
  }
}

function replay(id: string, sequence: number): ReconstructionOutcome {
  return {
    outcome: "reconstruction",
    reconstruction: {
      eventId: "evt-a",
      checkpoint: { id, sequence, contentMd5: "ab".repeat(16), memberCount: 1 },
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
    },
  }
}

function buttonTag(html: string, label: string): string {
  const match = html.match(new RegExp(`<button\\b[^>]*>${label}</button>`))
  expect(match).not.toBeNull()
  return match![0]
}
