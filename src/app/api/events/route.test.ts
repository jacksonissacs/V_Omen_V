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
const CHECKPOINT = "11111111-1111-4111-8111-111111111111"

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

})

describe("GET /api/events/:id/history/:checkpointId", () => {
  const historyParams = (id: string, checkpointId: string) => ({
    params: Promise.resolve({ id, checkpointId }),
  })

  it("returns 404 for an unknown event and 400 for an invalid checkpoint id", async () => {
    __resetRepositoryForTests(fakeRepository([demo], { storage: "database" }))
    expect(
      (await getEventHistory(new Request("http://omen.test"), historyParams("evt-nope", CHECKPOINT))).status,
    ).toBe(404)

    const response = await getEventHistory(
      new Request("http://omen.test"),
      historyParams("evt-demo", "ck-1"),
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.outcome).toBe("invalid_request")
    expect(body.error).toMatch(/UUID/)
  })

  it("returns 503 without demo data when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    __resetRepositoryForTests(failingRepository("connection refused", "database"))
    const response = await getEventHistory(
      new Request("http://omen.test"),
      historyParams("evt-demo", CHECKPOINT),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      storage: "database",
      outcome: "unavailable",
      error: "Event storage is unavailable",
    })
  })
})
