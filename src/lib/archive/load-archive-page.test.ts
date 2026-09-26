import { describe, expect, it, vi } from "vitest"

import { loadArchivePageData } from "@/lib/archive/load-archive-page"
import type { ReconstructionOutcome } from "@/lib/domain/historical-reconstruction"
import { fakeRepository, testEvent } from "@/test/fake-repository"

const { getRepository } = vi.hoisted(() => ({
  getRepository: vi.fn(),
}))

vi.mock("@/lib/data/repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data/repository")>()
  return { ...original, getRepository }
})

describe("loadArchivePageData", () => {
  it("merges a deep-linked checkpoint into the initial discovery page", async () => {
    const reconstruction = {
      eventId: "evt-a",
      checkpoint: { id: "21", sequence: 21, contentMd5: "ab".repeat(16), memberCount: 1 },
      coverage: {
        semanticEventFieldsFrom: "2026-09-26T00:00:00.000Z",
        recordAvailabilityRealignedAt: "2026-09-26T00:00:00.000Z",
        semanticHistory: "recorded" as const,
        preBaselineEventRevisions: "not_recorded" as const,
      },
      provenance: "demo" as const,
      semantics: null,
      observations: [],
      evidence: [],
      moveLogs: [],
    }
    const replay: ReconstructionOutcome = { outcome: "reconstruction", reconstruction }
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      id: String(100 - index),
      sequence: 100 - index,
      contentMd5: "ab".repeat(16),
      memberCount: 1,
      semanticHistory: "recorded" as const,
    }))
    expect(firstPage.some((item) => item.id === "21")).toBe(false)
    getRepository.mockReturnValue(
      fakeRepository([testEvent({ id: "evt-a", title: "Alpha" })], {
        listHistoryCheckpoints: async (_eventId, query) => {
          const limit = query?.limit ?? 20
          const upper = query?.beforeSequence === undefined ? 100 : query.beforeSequence - 1
          const checkpoints = []
          for (let sequence = upper; checkpoints.length < limit && sequence >= 1; sequence -= 1) {
            checkpoints.push({
              id: String(sequence),
              sequence,
              contentMd5: "ab".repeat(16),
              memberCount: 1,
              semanticHistory: "recorded" as const,
            })
          }
          const lowest = checkpoints.at(-1)?.sequence ?? upper
          return {
            outcome: "checkpoints",
            eventId: "evt-a",
            limit,
            hasMore: lowest > 1,
            checkpoints,
          }
        },
        reconstructEvent: async () => replay,
      }),
    )

    const loaded = await loadArchivePageData({ event: "evt-a", checkpoint: "21" })
    expect(loaded.initialStatus).toBe("ok")
    expect(loaded.initialCheckpoints.some((item) => item.id === "21")).toBe(true)
    expect(loaded.initialCheckpoints.some((item) => item.id === "100")).toBe(true)
    expect(loaded.initialReconstruction?.checkpoint.id).toBe("21")
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
})
