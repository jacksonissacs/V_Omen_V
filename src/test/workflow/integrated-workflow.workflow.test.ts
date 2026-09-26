import { writeFileSync } from "node:fs"
import path from "node:path"

import type { Browser, Page } from "puppeteer-core"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { parseEventBundle } from "@/lib/db/event-bundle"
import type { DisposableDatabase } from "@/test/postgres-harness"
import {
  chromePath,
  launchWorkflowBrowser,
  noHorizontalOverflow,
  saveFailureTrace,
  saveScreenshot,
  waitForWorkspaceReady,
} from "@/test/workflow/browser"
import {
  ARTIFACTS,
  FIXTURES,
  TESTED_MAIN_SHA,
  artifactDir,
  createWorkflowDatabase,
  fetchJson,
  fetchText,
  startProductionServer,
  upsert,
  upsertExit,
  visibleHtml,
  type RunningServer,
} from "@/test/workflow/harness"

const TEMPORAL = path.join(FIXTURES, "evt-temporal.json")
const TEMPORAL_LATER = path.join(FIXTURES, "evt-temporal.later.json")
const SINGLE = path.join(FIXTURES, "evt-single.json")
const SOURCED = path.join(FIXTURES, "evt-sourced.json")

const CURRENT_TITLE = "[SYNTHETIC TEST] Example agency publishes the 2026 bulletin"
const LATER_TITLE = "[SYNTHETIC TEST] Example agency published the 2026 bulletin (updated)"
const SINGLE_TITLE = "[SYNTHETIC TEST] Single observation event"
const DEMO_TITLE = "Bank of Canada cuts rates in October"

let database: DisposableDatabase
let server: RunningServer
let outage: RunningServer
let browser: Browser
let page: Page
let laterWriteApplied = false
let earlyCheckpointId = ""
let latestCheckpointId = ""

async function syncTemporalCheckpoints(): Promise<void> {
  const { status, body } = await fetchJson(server, "/api/events/evt-test-temporal/history?limit=50")
  expect(status).toBe(200)
  const checkpoints = body.checkpoints as Array<{ id: string; sequence: number }>
  expect(checkpoints.length).toBeGreaterThan(0)
  latestCheckpointId = checkpoints[0]!.id
  earlyCheckpointId = checkpoints[checkpoints.length - 1]!.id
}

beforeAll(async () => {
  chromePath()
  database = await createWorkflowDatabase()
  const seed = await Promise.all([
    upsert(database.url, TEMPORAL),
    upsert(database.url, SINGLE),
    upsert(database.url, SOURCED),
  ])
  for (const result of seed) {
    expect(result.stderr).toBe("")
    expect(result.stdout).not.toContain(database.url)
  }

  server = await startProductionServer({
    OMEN_STORAGE_MODE: "database",
    DATABASE_URL: database.url,
  })
  outage = await startProductionServer({
    OMEN_STORAGE_MODE: "database",
    DATABASE_URL: "postgresql://omen_test:local_ci_only@127.0.0.1:5432/omen_workflow_missing",
  })
  browser = await launchWorkflowBrowser()
  page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await syncTemporalCheckpoints()

  writeFileSync(
    path.join(artifactDir(), "tested-sha.txt"),
    [`testedMainSha=${TESTED_MAIN_SHA}`, `verificationHead=${process.env.GITHUB_SHA ?? "local"}`, ""].join("\n"),
  )
}, 120_000)

afterEach(async (context) => {
  if (context.task.result?.state === "fail" && page && page.url().startsWith("http")) {
    await saveFailureTrace(page, context.task.name).catch(() => undefined)
  }
})

afterAll(async () => {
  await browser?.close().catch(() => undefined)
  await server?.stop().catch(() => undefined)
  await outage?.stop().catch(() => undefined)
  await database?.drop().catch(() => undefined)
})

describe("production HTTP payloads", () => {
  it("lists only the synthetic book and never the in-process demo catalog", async () => {
    const { status, body } = await fetchJson(server, "/api/events")
    expect(status).toBe(200)
    expect(body.storage).toBe("database")
    expect(body.provenance).toBe("mixed")
    const events = body.events as Array<{ id: string; title: string; provenance: string }>
    expect(events.map((event) => event.id).sort()).toEqual([
      "evt-test-single",
      "evt-test-sourced",
      "evt-test-temporal",
    ])
    expect(events.some((event) => event.title === DEMO_TITLE)).toBe(false)
    expect(events.find((event) => event.id === "evt-test-sourced")?.provenance).toBe("sourced")
  })

  it("returns the written temporal event, evidence URLs and published Move Log", async () => {
    const { status, body } = await fetchJson(server, "/api/events/evt-test-temporal")
    expect(status).toBe(200)
    expect(body.storage).toBe("database")
    expect(body.provenance).toBe("demo")
    const event = body.event as {
      title: string
      status: string
      probability: number
      previousProbability: number
      evidence: Array<{ id: string; url?: string; publishedAt: string | null; name: string }>
      moveLog?: { id: string; version: number; correctionNote?: string }
    }
    expect(event.title).toBe(CURRENT_TITLE)
    expect(event.status).toBe("active")
    expect(event.probability).toBe(55.25)
    expect(event.previousProbability).toBe(41.5)
    expect(event.evidence.map((item) => item.id)).toEqual(["ev-test-temporal-1", "ev-test-temporal-2"])
    expect(event.evidence[0]?.url).toBe("https://example.test/synthetic/agency-bulletin-2026")
    expect(event.evidence[1]?.publishedAt).toBeNull()
    expect(event.moveLog).toMatchObject({ id: "ml-test-temporal-1", version: 1 })
    expect(event.moveLog?.correctionNote).toBeUndefined()
  })

  it("returns 404 for an unknown event id without a body event", async () => {
    const { status, body } = await fetchJson(server, "/api/events/evt-does-not-exist")
    expect(status).toBe(404)
    expect(body.error).toBe("Event not found")
    expect(body.event).toBeUndefined()
  })

  it("refuses malformed checkpoint ids and unknown checkpoints without current text", async () => {
    const query = await fetchJson(server, "/api/events/evt-test-temporal?checkpoint=ck-early")
    expect(query.status).toBe(422)
    expect(query.body.event).toBeUndefined()
    expect(JSON.stringify(query.body)).not.toContain(CURRENT_TITLE)

    const malformed = await fetchJson(server, `/api/events/evt-test-temporal/history/ck-early`)
    expect(malformed.status).toBe(400)
    expect(malformed.body.outcome).toBe("invalid_request")
    expect(JSON.stringify(malformed.body)).not.toContain("55.25")

    const missing = await fetchJson(server, "/api/events/evt-test-temporal/history/999999999999")
    expect(missing.status).toBe(422)
    expect(missing.body.outcome).toBe("missing_checkpoint")
    expect(missing.body.event).toBeUndefined()

    const unknownEvent = await fetchJson(server, "/api/events/evt-does-not-exist/history/1")
    expect(unknownEvent.status).toBe(404)
    expect(unknownEvent.body.event).toBeUndefined()
  })

  it("replays a stored checkpoint without returning the current AionEvent projection", async () => {
    const replay = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpointId}`)
    expect(replay.status).toBe(200)
    expect(replay.body.outcome).toBe("reconstruction")
    expect(replay.body.event).toBeUndefined()
    expect(JSON.stringify(replay.body)).not.toContain(LATER_TITLE)
    expect((replay.body.moveLogs as Array<{ version: number }> | undefined)?.[0]?.version).toBe(1)
  })

  it("fails visibly on a database outage without serving demo events", async () => {
    const list = await fetchJson(outage, "/api/events")
    expect(list.status).toBe(503)
    expect(list.body).toEqual({ storage: "database", error: "Event storage is unavailable" })
    expect(JSON.stringify(list.body)).not.toContain("evt-boc-cut")

    const one = await fetchJson(outage, "/api/events/evt-test-temporal")
    expect(one.status).toBe(503)
    expect(one.body.event).toBeUndefined()

    const history = await fetchJson(outage, `/api/events/evt-test-temporal/history/${earlyCheckpointId}`)
    expect(history.status).toBe(503)
    expect(history.body.event).toBeUndefined()

    const archive = visibleHtml((await fetchText(outage, `/archive?event=evt-test-temporal&checkpoint=${earlyCheckpointId}`)).text)
    expect(archive).toContain("Archive storage is unavailable")

    const html = visibleHtml((await fetchText(outage, "/pulse")).text)
    expect(html).toMatch(/Workspace data unavailable|Data unavailable/)
    expect(html).not.toContain(DEMO_TITLE)
    expect(html).not.toContain(CURRENT_TITLE)
  })
})

describe("production rendered content", () => {
  it("renders Pulse from the write-path book, not the demo catalog", async () => {
    const { status, text } = await fetchText(server, "/pulse")
    expect(status).toBe(200)
    const html = visibleHtml(text)
    expect(html).toContain("Pulse")
    expect(html).toContain(CURRENT_TITLE)
    expect(html).toContain(SINGLE_TITLE)
    expect(html).toContain("PostgreSQL")
    expect(html).toContain("Demo + sourced data")
    expect(html).not.toContain(DEMO_TITLE)
  })

  it("renders event detail, evidence times, source link and Move Log v1", async () => {
    const { status, text } = await fetchText(server, "/events/evt-test-temporal")
    expect(status).toBe(200)
    const html = visibleHtml(text)
    expect(html).toContain(CURRENT_TITLE)
    expect(html).toContain("ml-test-temporal-1")
    expect(html).toMatch(/version\s*1/)
    expect(html).toContain("SYNTHETIC TEST agency notice")
    expect(text).toContain('href="https://example.test/synthetic/agency-bulletin-2026"')
    expect(html).toContain("Open source")
    expect(html).toContain("Not stated by source")
    expect(html).toContain("55.3%")
    expect(html).toContain("41.5%")
    expect(html).toContain("+13.8 pp")
    expect(html).not.toContain(LATER_TITLE)
    expect(html).not.toContain("SYNTHETIC TEST correction")
  })

  it("renders the one-observation case without inventing a change", async () => {
    const html = visibleHtml((await fetchText(server, "/events/evt-test-single")).text)
    expect(html).toContain(SINGLE_TITLE)
    expect(html).toContain("Not computable")
    expect(html).toContain("Only one observation is recorded, so no change can be computed.")
    expect(html).toContain("Single observation at")
    expect(html).toContain("No evidence is recorded for this event.")
  })

  it("keeps sourced provenance and the cited URL on the sourced fixture", async () => {
    const api = await fetchJson(server, "/api/events/evt-test-sourced")
    expect(api.body.provenance).toBe("sourced")
    const { text } = await fetchText(server, "/events/evt-test-sourced")
    const html = visibleHtml(text)
    expect(html).toContain("Demo + sourced data")
    expect(text).toContain('href="https://example.test/synthetic/sourced-filing"')
    expect(html).toContain("Open source")
    expect(html).toContain("Market-implied")
    expect(html.replace(/not a live [a-z]+/gi, "")).not.toMatch(/\b(live|real-time|streaming)\b/i)
  })

  it("serves shareable checkpoint URLs from archive and the event history route", async () => {
    const path = await fetchText(server, `/events/evt-test-temporal/history/${earlyCheckpointId}`)
    const pathText = visibleHtml(path.text)
    expect(pathText).toContain("Historical checkpoint view")
    expect(pathText).toContain("Move Log revisions in this checkpoint")
    expect(pathText).not.toContain(LATER_TITLE)

    const archive = await fetchText(
      server,
      `/archive?event=evt-test-temporal&checkpoint=${earlyCheckpointId}`,
    )
    const archiveText = visibleHtml(archive.text)
    expect(archiveText).toContain("Historical checkpoint view")
    expect(archiveText).not.toContain("Show point-in-time demo")
    expect(archiveText).not.toContain(LATER_TITLE)

    const malformedArchive = visibleHtml(
      (await fetchText(server, "/archive?event=evt-test-temporal&checkpoint=ck-early")).text,
    )
    expect(malformedArchive).toContain("not valid")
  })
})

describe("browser workflow", () => {
  it("walks Homepage → Pulse → event → evidence → Move Log", async () => {
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(new URL("/", server.url).toString(), { waitUntil: "networkidle0" })
    expect(await page.$eval("h1", (node) => node.textContent)).toMatch(/Every probability/)

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("a.btn-primary"),
    ])
    expect(page.url()).toMatch(/\/pulse$/)
    await waitForWorkspaceReady(page)
    expect(await page.evaluate(() => document.body.innerText)).toContain(CURRENT_TITLE)
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(DEMO_TITLE)
    await saveScreenshot(page, "01_pulse_synthetic_book")

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click(`a[aria-label="Open ${CURRENT_TITLE}"]`),
    ])
    expect(page.url()).toMatch(/\/events\/evt-test-temporal$/)
    await page.waitForSelector("h1")
    const detail = await page.evaluate(() => document.body.innerText)
    expect(detail).toContain(CURRENT_TITLE)
    expect(detail).toContain("Move log ml-test-temporal-1")
    expect(detail).toContain("version 1")
    expect(detail).toContain("SYNTHETIC TEST agency notice")

    await page.click("button[data-primary='true']")
    const evidence = await page.evaluate(() => document.querySelector("#event-evidence")?.textContent ?? "")
    expect(evidence).toContain("Evidence on record")
    expect(evidence).toContain("SYNTHETIC TEST agency notice")
    expect(evidence).toContain("Not stated by source")
    const source = await page.$("a.aion-evidence-link")
    expect(source).not.toBeNull()
    expect(await source!.evaluate((node) => node.getAttribute("href"))).toBe(
      "https://example.test/synthetic/agency-bulletin-2026",
    )
    await saveScreenshot(page, "02_event_evidence_move_log")
  })

  it("opens a checkpoint URL, keeps current text out, and returns to present", async () => {
    await page.goto(
      new URL(`/events/evt-test-temporal/history/${earlyCheckpointId}`, server.url).toString(),
      { waitUntil: "networkidle0" },
    )
    const historical = await page.evaluate(() => document.body.innerText)
    expect(historical).toContain("Stored reconstruction")
    expect(historical).not.toContain(LATER_TITLE)
    expect(historical).toContain("version 1")

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("a.aion-button[data-primary='true']"),
    ])
    expect(page.url()).toMatch(/\/events\/evt-test-temporal$/)
    expect(await page.evaluate(() => document.body.innerText)).toContain(CURRENT_TITLE)
    await saveScreenshot(page, "03_return_to_present")
  })

  it("reloads archive checkpoint URLs and navigates checkpoints with the URL", async () => {
    const archiveUrl = new URL(
      `/archive?event=evt-test-temporal&checkpoint=${earlyCheckpointId}`,
      server.url,
    )
    await page.goto(archiveUrl.toString(), { waitUntil: "networkidle0" })
    expect(await page.evaluate(() => document.body.innerText)).toContain("Historical checkpoint view")

    await page.reload({ waitUntil: "networkidle0" })
    expect(page.url()).toBe(archiveUrl.toString())
    expect(await page.evaluate(() => document.body.innerText)).toContain("Historical checkpoint view")

  })

  it("keeps mobile layout inside the viewport", async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await page.goto(new URL("/events/evt-test-temporal", server.url).toString(), { waitUntil: "networkidle0" })
    expect(await noHorizontalOverflow(page)).toBe(true)
    const layout = await page.evaluate(() => {
      const main = document.querySelector(".aion-event-layout")
      const inspector = document.querySelector(".aion-inspector")
      if (!main || !inspector) return { stacked: false }
      const mainBox = main.getBoundingClientRect()
      const inspectorBox = inspector.getBoundingClientRect()
      return { stacked: inspectorBox.top >= mainBox.top && inspectorBox.width >= mainBox.width * 0.8 }
    })
    expect(layout.stacked).toBe(true)
    await saveScreenshot(page, "04_event_detail_mobile")
    await page.setViewport({ width: 1280, height: 800, isMobile: false, hasTouch: false })
  })

  it("supports keyboard navigation from the homepage CTA and ⌘K", async () => {
    await page.goto(new URL("/", server.url).toString(), { waitUntil: "networkidle0" })
    await page.focus("a.btn-primary")
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.keyboard.press("Enter")])
    expect(page.url()).toMatch(/\/pulse$/)
    await waitForWorkspaceReady(page)

    await page.keyboard.down("Control")
    await page.keyboard.press("k")
    await page.keyboard.up("Control")
    await page.waitForSelector("[role='dialog']")
    expect(await page.$("[role='dialog']")).not.toBeNull()
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => !document.querySelector("[role='dialog']"))
  })

  it("shows the unknown-event page instead of current book text", async () => {
    await page.goto(new URL("/events/evt-does-not-exist", server.url).toString(), { waitUntil: "networkidle0" })
    const text = await page.evaluate(() => document.body.innerText)
    expect(text).toContain("Event not in the book")
    expect(text).not.toContain(CURRENT_TITLE)
    expect(text).not.toContain(DEMO_TITLE)
  })

  it("honours browser back and forward across the workflow", async () => {
    await page.goto(new URL("/", server.url).toString(), { waitUntil: "networkidle0" })
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("a.btn-primary"),
    ])
    await waitForWorkspaceReady(page)
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click(`a[aria-label="Open ${SINGLE_TITLE}"]`),
    ])
    expect(page.url()).toMatch(/\/events\/evt-test-single$/)

    await page.goBack({ waitUntil: "networkidle0" })
    expect(page.url()).toMatch(/\/pulse$/)
    await waitForWorkspaceReady(page)
    await page.goForward({ waitUntil: "networkidle0" })
    expect(page.url()).toMatch(/\/events\/evt-test-single$/)
    expect(await page.evaluate(() => document.body.innerText)).toContain("Not computable")
  })
})

describe("validated write path and later current state", () => {
  it("rejects a zero-observation bundle on the normal write path", async () => {
    const empty = path.join(ARTIFACTS, "evt-zero-rejected.json")
    writeFileSync(
      empty,
      JSON.stringify({
        event: {
          id: "evt-test-zero",
          title: "[SYNTHETIC TEST] Zero observation rejected",
          question: "Will a zero-observation bundle be refused by the write path?",
          status: "watch",
          deadline: "2026-12-01T00:00:00.000Z",
          resolutionCriteria: "SYNTHETIC TEST: this bundle must be refused because it has no observations.",
          category: "Science",
          significance: "low",
          region: "Test",
          summary: "SYNTHETIC TEST FIXTURE with no observations.",
          provenance: "demo",
        },
        observations: [],
      }),
    )
    const raw = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(empty, "utf8")))
    expect(() => parseEventBundle(raw)).toThrow(/at least one observation/)
    const cli = await upsertExit(database.url, empty)
    expect(cli.code).not.toBe(0)
    expect(`${cli.stdout}\n${cli.stderr}`).toMatch(/at least one observation/)
    const missing = await fetchJson(server, "/api/events/evt-test-zero")
    expect(missing.status).toBe(404)
  })

  it("updates the current view after a later write, and still refuses historical fallback", async () => {
    const written = await upsert(database.url, TEMPORAL_LATER)
    expect(written.stdout).toMatch(/appended|updated|unchanged/)
    laterWriteApplied = true
    await syncTemporalCheckpoints()

    const { body } = await fetchJson(server, "/api/events/evt-test-temporal")
    const event = body.event as {
      title: string
      status: string
      evidence: Array<{ id: string }>
      moveLog?: { version: number; correctionNote?: string }
    }
    expect(event.title).toBe(LATER_TITLE)
    expect(event.status).toBe("resolved")
    expect(event.evidence.map((item) => item.id)).toEqual([
      "ev-test-temporal-1",
      "ev-test-temporal-2",
      "ev-test-temporal-3",
    ])
    expect(event.moveLog).toMatchObject({
      version: 2,
      correctionNote: "SYNTHETIC TEST correction: coverage revised from 60% to 45% after later evidence.",
    })

    const html = visibleHtml((await fetchText(server, "/events/evt-test-temporal")).text)
    expect(html).toContain(LATER_TITLE)
    expect(html).toMatch(/version\s*2/)
    expect(html).toContain("SYNTHETIC TEST correction")
    expect(html).toContain("SYNTHETIC TEST later correction note")
    expect(html).toContain("3 evidence records")

    const earlyReplay = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpointId}`)
    expect(earlyReplay.status).toBe(200)
    expect(JSON.stringify(earlyReplay.body)).not.toContain(LATER_TITLE)
    expect(JSON.stringify(earlyReplay.body)).not.toContain("SYNTHETIC TEST correction")
    expect((earlyReplay.body.moveLogs as Array<{ version: number }> | undefined)?.[0]?.version).toBe(1)

    const latestReplay = await fetchJson(server, `/api/events/evt-test-temporal/history/${latestCheckpointId}`)
    expect(latestReplay.status).toBe(200)
    expect(JSON.stringify(latestReplay.body)).toContain(LATER_TITLE)
    expect((latestReplay.body.moveLogs as Array<{ version: number }> | undefined)?.[0]?.version).toBe(2)

    await page.goto(
      new URL(`/archive?event=evt-test-temporal&checkpoint=${earlyCheckpointId}`, server.url).toString(),
      { waitUntil: "networkidle0" },
    )
    const rendered = await page.evaluate(() => document.body.innerText)
    expect(rendered).toContain("Historical checkpoint view")
    expect(rendered).not.toContain(LATER_TITLE)
    expect(rendered).not.toContain("SYNTHETIC TEST correction")
    await saveScreenshot(page, "05_earlier_checkpoint_after_later_write")
  })
})

describe("stored reconstruction coverage notes", () => {
  it("records remaining blocked checks that need dedicated fixtures", () => {
    expect(laterWriteApplied).toBe(true)
    writeFileSync(
      path.join(ARTIFACTS, "blocked-checks.json"),
      JSON.stringify(
        {
          testedMainSha: TESTED_MAIN_SHA,
          laterWriteApplied,
          blocked: [
            {
              id: "delayed-commit-excluded-from-earlier-checkpoint",
              reason:
                "Needs a dedicated delayed-commit fixture in the workflow harness; temporal db tests cover the visibility contract.",
            },
            {
              id: "zero-observation-database-row",
              reason:
                "The validated write path refuses events with zero observations, so a database-backed empty history cannot be constructed. Display is covered by component tests and the one-observation fixture.",
            },
          ],
        },
        null,
        2,
      ),
    )
  })
})
