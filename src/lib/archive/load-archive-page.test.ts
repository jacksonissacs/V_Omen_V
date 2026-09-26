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
    getRepository.mockReturnValue(
      fakeRepository([testEvent({ id: "evt-a", title: "Alpha" })], {
        listHistoryCheckpoints: async () => ({
          outcome: "checkpoints",
          eventId: "evt-a",
          limit: 20,
          hasMore: true,
          checkpoints: Array.from({ length: 20 }, (_, index) => ({
            id: String(25 - index),
            sequence: 25 - index,
            contentMd5: "ab".repeat(16),
            memberCount: 1,
            semanticHistory: "recorded" as const,
          })),
        }),
        reconstructEvent: async () => replay,
      }),
    )

    const loaded = await loadArchivePageData({ event: "evt-a", checkpoint: "21" })
    expect(loaded.initialStatus).toBe("ok")
    expect(loaded.initialCheckpoints.some((item) => item.id === "21")).toBe(true)
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
