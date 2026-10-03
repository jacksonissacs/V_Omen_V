// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET as getEvent } from "@/app/api/events/[id]/route"
import { GET as listEvents } from "@/app/api/events/route"
import { __resetRepositoryForTests } from "@/lib/data/repository"
import { failingRepository, fakeRepository, testEvent } from "@/test/fake-repository"

const demo = testEvent({ id: "evt-demo", title: "Demo decision" })
const sourced = { ...testEvent({ id: "evt-sourced", title: "Sourced decision" }), provenance: "sourced" as const }

const params = (id: string) => ({ params: Promise.resolve({ id }) })

afterEach(() => {
  __resetRepositoryForTests()
  vi.unstubAllEnvs()
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

  it("does not serve the demo book when production requests demo mode or omits the mode", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("OMEN_STORAGE_MODE", "demo")
    __resetRepositoryForTests()
    const demoMode = await listEvents(new Request("http://omen.test/api/events"))
    expect(demoMode.status).toBe(503)
    const demoBody = await demoMode.json()
    expect(demoBody).toEqual({ storage: "misconfigured", error: "Event storage is unavailable" })
    expect(JSON.stringify(demoBody)).not.toContain("evt-boc-cut")

    vi.stubEnv("OMEN_STORAGE_MODE", "")
    __resetRepositoryForTests()
    const missing = await listEvents(new Request("http://omen.test/api/events"))
    expect(missing.status).toBe(503)
    expect(await missing.json()).toEqual({ storage: "misconfigured", error: "Event storage is unavailable" })

    const event = await getEvent(new Request("http://omen.test"), params("evt-boc-cut"))
    expect(event.status).toBe(503)
    expect(await event.json()).toEqual({ storage: "misconfigured", error: "Event storage is unavailable" })
  })

  it("still serves the labeled demo book when development explicitly selects demo mode", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("OMEN_STORAGE_MODE", "demo")
    __resetRepositoryForTests()
    const response = await listEvents(new Request("http://omen.test/api/events"))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.storage).toBe("demo")
    expect(body.provenance).toBe("demo")
    expect(body.events.some((event: { id: string }) => event.id === "evt-boc-cut")).toBe(true)
    expect(body.events.every((event: { provenance: string }) => event.provenance === "demo")).toBe(true)
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
