// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/events/[id]/history/route"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import {
  ARBITRARY_TIME_UNSUPPORTED,
  DEMO_RECONSTRUCTION_UNSUPPORTED,
  type CheckpointListOutcome,
} from "@/lib/domain/historical-reconstruction"
import { failingRepository, fakeRepository, testEvent } from "@/test/fake-repository"

const WIDE = "9007199254740993"
const params = (id: string) => ({ params: Promise.resolve({ id }) })

afterEach(() => {
  __resetRepositoryForTests()
  vi.restoreAllMocks()
})

describe("GET /api/events/:id/history", () => {
  it("returns a bounded checkpoint page and keeps bigint ids as JSON strings", async () => {
    const listHistoryCheckpoints = vi.fn(
      async (): Promise<CheckpointListOutcome> => ({
        outcome: "checkpoints",
        eventId: "evt-replay",
        limit: 2,
        hasMore: true,
        checkpoints: [
          {
            id: WIDE,
            sequence: 3,
            contentMd5: "ab".repeat(16),
            memberCount: 4,
            semanticHistory: "recorded",
          },
        ],
      }),
    )
    __resetRepositoryForTests(
      fakeRepository([testEvent({ id: "evt-replay", title: "CURRENT_TITLE_LEAK" })], {
        storage: "database",
        listHistoryCheckpoints,
      }),
    )
    const response = await GET(
      new Request("http://omen.test/api/events/evt-replay/history?limit=2&beforeSequence=4"),
      params("evt-replay"),
    )
    expect(response.status).toBe(200)
    const text = await response.text()
    const body = JSON.parse(text) as { checkpoints: { id: string }[] }
    expect(body).toMatchObject({
      storage: "database",
      outcome: "checkpoints",
      eventId: "evt-replay",
      limit: 2,
      hasMore: true,
    })
    expect(body.checkpoints[0]?.id).toBe(WIDE)
    expect(text).toContain(`"id":"${WIDE}"`)
    expect(text).not.toContain("9007199254740992")
    expect(text).not.toContain("CURRENT_TITLE_LEAK")
    expect(text).not.toContain("contentSha256")
    expect(listHistoryCheckpoints).toHaveBeenCalledWith("evt-replay", { limit: 2, beforeSequence: 4 })
  })

  it("rejects an unbounded limit and a wall-clock cutoff without reading storage", async () => {
    const listHistoryCheckpoints = vi.fn(async (): Promise<CheckpointListOutcome> => {
      throw new Error("storage should not be read")
    })
    __resetRepositoryForTests(fakeRepository([testEvent({ id: "evt-replay", title: "Demo decision" })], { listHistoryCheckpoints }))

    const limited = await GET(new Request("http://omen.test/api/events/evt-replay/history?limit=1000"), params("evt-replay"))
    expect(limited.status).toBe(400)
    expect(await limited.json()).toMatchObject({ outcome: "invalid_request" })

    const cutoff = await GET(
      new Request("http://omen.test/api/events/evt-replay/history?cutoff=2026-09-01T00:00:00Z"),
      params("evt-replay"),
    )
    expect(cutoff.status).toBe(422)
    expect(await cutoff.json()).toEqual({
      storage: "demo",
      outcome: "unsupported_history",
      error: ARBITRARY_TIME_UNSUPPORTED,
    })
    expect(listHistoryCheckpoints).not.toHaveBeenCalled()
  })

  it("keeps demo storage, unknown events and database failure distinct", async () => {
    __resetRepositoryForTests(fakeRepository([testEvent({ id: "evt-boc-cut", title: "Bank of Canada cuts rates in October" })]))
    const demo = await GET(new Request("http://omen.test/api/events/evt-boc-cut/history"), params("evt-boc-cut"))
    expect(demo.status).toBe(422)
    expect(await demo.json()).toEqual({
      storage: "demo",
      outcome: "unsupported_history",
      error: DEMO_RECONSTRUCTION_UNSUPPORTED,
    })

    __resetRepositoryForTests(
      fakeRepository([], {
        storage: "database",
        listHistoryCheckpoints: async () => ({ outcome: "unknown_event" }),
      }),
    )
    const unknown = await GET(new Request("http://omen.test/api/events/evt-missing/history"), params("evt-missing"))
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({ outcome: "unknown_event" })

    vi.spyOn(console, "error").mockImplementation(() => undefined)
    __resetRepositoryForTests(failingRepository("connection refused", "database"))
    const unavailable = await GET(new Request("http://omen.test/api/events/evt-replay/history"), params("evt-replay"))
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toEqual({
      storage: "database",
      outcome: "unavailable",
      error: "Event storage is unavailable",
    })
  })
})
