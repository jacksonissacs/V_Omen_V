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

  it("returns 422 without current text for unknown checkpoint ids and historical queries", async () => {
    const query = await fetchJson(server, "/api/events/evt-test-temporal?checkpoint=ck-early")
    expect(query.status).toBe(422)
    expect(query.body.event).toBeUndefined()
    expect(JSON.stringify(query.body)).not.toContain(CURRENT_TITLE)
    expect(query.body.error).toMatch(/Checkpoint ck-early cannot be reconstructed/)

    const path = await fetchJson(server, "/api/events/evt-test-temporal/history/ck-early")
    expect(path.status).toBe(422)
    expect(path.body.event).toBeUndefined()
    expect(JSON.stringify(path.body)).not.toContain("55.25")

    const unknownEvent = await fetchJson(server, "/api/events/evt-does-not-exist/history/ck-early")
    expect(unknownEvent.status).toBe(404)
    expect(unknownEvent.body.event).toBeUndefined()
  })

  it("fails visibly on a database outage without serving demo events", async () => {
    const list = await fetchJson(outage, "/api/events")
    expect(list.status).toBe(503)
    expect(list.body).toEqual({ storage: "database", error: "Event storage is unavailable" })
    expect(JSON.stringify(list.body)).not.toContain("evt-boc-cut")

    const one = await fetchJson(outage, "/api/events/evt-test-temporal")
    expect(one.status).toBe(503)
    expect(one.body.event).toBeUndefined()

    const history = await fetchJson(outage, "/api/events/evt-test-temporal/history/ck-early")
    expect(history.status).toBe(503)
    expect(history.body.event).toBeUndefined()

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

  it("does not fall back to current text on shareable historical URLs", async () => {
    const query = await fetchText(server, "/events/evt-test-temporal?checkpoint=ck-early")
    const queryText = visibleHtml(query.text)
    expect(queryText).toContain("Historical view unavailable")
    expect(queryText).not.toContain(CURRENT_TITLE)
    expect(queryText).toContain("Return to present")

    const path = await fetchText(server, "/events/evt-test-temporal/history/ck-early")
    const pathText = visibleHtml(path.text)
    expect(pathText).toContain("Checkpoint ck-early cannot be reconstructed")
    expect(pathText).not.toContain("55.3%")
    expect(pathText).not.toContain(LATER_TITLE)

    const archive = await fetchText(server, "/archive?checkpoint=ck-early")
    const archiveText = visibleHtml(archive.text)
    expect(archiveText).toContain("Historical view unavailable")
    expect(archiveText).not.toContain("Show point-in-time demo")
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
    await page.goto(new URL("/events/evt-test-temporal/history/ck-early", server.url).toString(), {
      waitUntil: "networkidle0",
    })
    const unavailable = await page.evaluate(() => document.body.innerText)
    expect(unavailable).toContain("Historical view unavailable")
    expect(unavailable).not.toContain(CURRENT_TITLE)
    expect(unavailable).not.toContain(LATER_TITLE)

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("a.aion-button[data-primary='true']"),
    ])
    expect(page.url()).toMatch(/\/events\/evt-test-temporal$/)
    expect(await page.evaluate(() => document.body.innerText)).toContain(CURRENT_TITLE)
    await saveScreenshot(page, "03_return_to_present")
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

    const historical = await fetchJson(server, "/api/events/evt-test-temporal?checkpoint=ck-early")
    expect(historical.status).toBe(422)
    expect(JSON.stringify(historical.body)).not.toContain(LATER_TITLE)
    expect(JSON.stringify(historical.body)).not.toContain(CURRENT_TITLE)
    expect(historical.body.event).toBeUndefined()

    await page.goto(new URL("/events/evt-test-temporal?checkpoint=ck-early", server.url).toString(), {
      waitUntil: "networkidle0",
    })
    const rendered = await page.evaluate(() => document.body.innerText)
    expect(rendered).toContain("Historical view unavailable")
    expect(rendered).not.toContain(LATER_TITLE)
    expect(rendered).not.toContain("SYNTHETIC TEST correction")
    await saveScreenshot(page, "05_later_write_checkpoint_refused")
  })
})

describe("blocked reconstruction claims on this SHA", () => {
  it("records that verified earlier-snapshot membership is not stored on this SHA", () => {
    expect(laterWriteApplied).toBe(true)
    writeFileSync(
      path.join(ARTIFACTS, "blocked-checks.json"),
      JSON.stringify(
        {
          testedMainSha: TESTED_MAIN_SHA,
          laterWriteApplied,
          blocked: [
            {
              id: "earlier-checkpoint-excludes-later-members",
              reason:
                "main has no history_checkpoints table or observed-snapshot publisher (draft PR #8 / #11). The suite proves historical URLs omit current text, not that a stored ck-early contains only v1 members.",
            },
            {
              id: "title-status-preserved-on-older-checkpoint",
              reason:
                "Event title and status are overwritten in place. There is no event_revisions history on this SHA, so an older checkpoint cannot replay the earlier title.",
            },
            {
              id: "delayed-commit-excluded-from-earlier-checkpoint",
              reason:
                "No checkpoint visibility contract is stored on this SHA, so a delayed commit cannot be shown to stay out of an earlier observed snapshot.",
            },
            {
              id: "shareable-checkpoint-replays-same-historical-members",
              reason:
                "Shareable checkpoint URLs consistently refuse reconstruction. They do not replay a stored historical member set.",
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
