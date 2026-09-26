// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET as getEventHistory } from "@/app/api/events/[id]/history/[checkpointId]/route"
import { GET as getEvent } from "@/app/api/events/[id]/route"
import { GET as listEvents } from "@/app/api/events/route"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import { failingRepository, fakeRepository, testEvent } from "@/test/fake-repository"

const demo = testEvent({ id: "evt-demo", title: "Demo decision" })
const sourced = { ...testEvent({ id: "evt-sourced", title: "Sourced decision" }), provenance: "sourced" as const }

const params = (id: string) => ({ params: Promise.resolve({ id }) })

afterEach(() => {
  __resetRepositoryForTests()
  vi.restoreAllMocks()
})

describe("GET /api/events", () => {
  it("reports storage and provenance separately", async () => {
    __resetRepositoryForTests(fakeRepository([demo], { storage: "database" }))
    const body = await (await listEvents(new Request("http://omen.test/api/events"))).json()
    expect(body.storage).toBe("database")
    expect(body.provenance).toBe("demo")
    expect(body.events[0].provenance).toBe("demo")
  })

  it("reports a mixed book as mixed", async () => {
    __resetRepositoryForTests(fakeRepository([demo, sourced]))
    const body = await (await listEvents(new Request("http://omen.test/api/events"))).json()
    expect(body.storage).toBe("demo")
    expect(body.provenance).toBe("mixed")
  })

  it("returns 503 without any events when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    __resetRepositoryForTests(failingRepository("connection refused", "database"))
    const response = await listEvents(new Request("http://omen.test/api/events"))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ storage: "database", error: "Event storage is unavailable" })
  })
})

describe("GET /api/events/:id", () => {
  it("returns the event with its provenance", async () => {
    __resetRepositoryForTests(fakeRepository([sourced], { storage: "database" }))
    const body = await (await getEvent(new Request("http://omen.test"), params("evt-sourced"))).json()
    expect(body).toMatchObject({ storage: "database", provenance: "sourced", event: { id: "evt-sourced" } })
  })

  it("returns 404 for an unknown id and 503 when storage fails", async () => {
    __resetRepositoryForTests(fakeRepository([demo]))
    expect((await getEvent(new Request("http://omen.test"), params("evt-nope"))).status).toBe(404)

    vi.spyOn(console, "error").mockImplementation(() => undefined)
    __resetRepositoryForTests(failingRepository())
    expect((await getEvent(new Request("http://omen.test"), params("evt-demo"))).status).toBe(503)
  })

  it("returns 422 without the current event when a checkpoint is requested", async () => {
    __resetRepositoryForTests(fakeRepository([sourced], { storage: "database" }))
    const response = await getEvent(
      new Request("http://omen.test/api/events/evt-sourced?checkpoint=ck-early"),
      params("evt-sourced"),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      storage: "database",
      error: "Checkpoint ck-early cannot be reconstructed. This build has no recorded history checkpoints.",
      historical: { available: false, kind: "checkpoint", value: "ck-early", eventId: "evt-sourced" },
    })
  })
})

describe("GET /api/events/:id/history/:checkpointId", () => {
  const historyParams = (id: string, checkpointId: string) => ({
    params: Promise.resolve({ id, checkpointId }),
  })

  it("returns 404 for an unknown event and 422 without current text for a known event", async () => {
    __resetRepositoryForTests(fakeRepository([demo], { storage: "database" }))
    expect(
      (await getEventHistory(new Request("http://omen.test"), historyParams("evt-nope", "ck-1"))).status,
    ).toBe(404)

    const response = await getEventHistory(
      new Request("http://omen.test"),
      historyParams("evt-demo", "ck-1"),
    )
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.event).toBeUndefined()
    expect(body.error).toMatch(/Checkpoint ck-1 cannot be reconstructed/)
  })

  it("returns 503 without demo data when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    __resetRepositoryForTests(failingRepository("connection refused", "database"))
    const response = await getEventHistory(
      new Request("http://omen.test"),
      historyParams("evt-demo", "ck-1"),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ storage: "database", error: "Event storage is unavailable" })
  })
})
