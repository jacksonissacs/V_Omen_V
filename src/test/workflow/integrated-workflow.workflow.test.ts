import { writeFileSync } from "node:fs"
import path from "node:path"

import type { Browser, Page } from "puppeteer-core"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { parseEventBundle } from "@/lib/db/event-bundle"
import { CHECKPOINT_NOT_FOUND } from "@/lib/domain/historical-reconstruction"
import { followingStorageKey } from "@/lib/following/persistence"
import type { DisposableDatabase } from "@/test/postgres-harness"
import {
  attachBrowserDiagnostics,
  chromePath,
  clickThrough,
  gotoMarketingHome,
  gotoWorkspacePath,
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
  parseCheckpointId,
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
const UNKNOWN_CHECKPOINT = "00000000-0000-4000-8000-000000000000"

let database: DisposableDatabase
let server: RunningServer
let outage: RunningServer
let browser: Browser
let page: Page
let earlyCheckpoint = ""
let laterCheckpoint = ""
let laterWriteApplied = false

beforeAll(async () => {
  chromePath()
  database = await createWorkflowDatabase()
  const temporalSeed = await upsert(database.url, TEMPORAL)
  earlyCheckpoint = parseCheckpointId(temporalSeed.stdout)
  const seed = await Promise.all([upsert(database.url, SINGLE), upsert(database.url, SOURCED)])
  for (const result of [temporalSeed, ...seed]) {
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
  attachBrowserDiagnostics(page)
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

  it("reconstructs a published checkpoint and refuses unknown or invalid history ids", async () => {
    const ok = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(ok.status).toBe(200)
    expect(ok.body.outcome).toBe("reconstruction")
    const semantics = (ok.body.semantics ?? {}) as { title?: string; status?: string }
    expect(semantics.title).toBe(CURRENT_TITLE)
    expect(semantics.status).toBe("active")
    expect(JSON.stringify(ok.body)).not.toContain(LATER_TITLE)
    expect(ok.body.event).toBeUndefined()

    const missing = await fetchJson(server, `/api/events/evt-test-temporal/history/${UNKNOWN_CHECKPOINT}`)
    expect(missing.status).toBe(422)
    expect(missing.body.error).toBe(CHECKPOINT_NOT_FOUND)
    expect(missing.body.event).toBeUndefined()

    const invalid = await fetchJson(server, "/api/events/evt-test-temporal/history/ck-early")
    expect(invalid.status).toBe(400)
    expect(invalid.body.outcome).toBe("invalid_request")
    expect(JSON.stringify(invalid.body)).not.toContain(CURRENT_TITLE)

    const unknownEvent = await fetchJson(server, `/api/events/evt-does-not-exist/history/${earlyCheckpoint}`)
    expect(unknownEvent.status).toBe(404)
    expect(unknownEvent.body.event).toBeUndefined()

    const arbitrary = await fetchJson(
      server,
      `/api/events/evt-test-temporal/history/${earlyCheckpoint}?at=2026-09-01T00:00:00.000Z`,
    )
    expect(arbitrary.status).toBe(422)
    expect(arbitrary.body.outcome).toBe("unsupported_history")
  })

  it("fails visibly on a database outage without serving demo events", async () => {
    const list = await fetchJson(outage, "/api/events")
    expect(list.status).toBe(503)
    expect(list.body).toEqual({ storage: "database", error: "Event storage is unavailable" })
    expect(JSON.stringify(list.body)).not.toContain("evt-boc-cut")

    const one = await fetchJson(outage, "/api/events/evt-test-temporal")
    expect(one.status).toBe(503)
    expect(one.body.event).toBeUndefined()

    const history = await fetchJson(outage, `/api/events/evt-test-temporal/history/${earlyCheckpoint}`)
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

  it("renders shareable checkpoint URLs without current text", async () => {
    const query = await fetchText(server, `/events/evt-test-temporal?checkpoint=${earlyCheckpoint}`)
    const queryText = visibleHtml(query.text)
    expect(queryText).toContain(CURRENT_TITLE)
    expect(queryText).toContain("Historical reconstruction")
    expect(queryText).not.toContain(LATER_TITLE)

    const pathHtml = visibleHtml(
      (await fetchText(server, `/events/evt-test-temporal/history/${earlyCheckpoint}`)).text,
    )
    expect(pathHtml).toContain(CURRENT_TITLE)
    expect(pathHtml).not.toContain("55.3%")
    expect(pathHtml).not.toContain(LATER_TITLE)

    const missing = visibleHtml(
      (await fetchText(server, `/events/evt-test-temporal/history/${UNKNOWN_CHECKPOINT}`)).text,
    )
    expect(missing).toContain(CHECKPOINT_NOT_FOUND)
    expect(missing).not.toContain(CURRENT_TITLE)

    const archive = visibleHtml((await fetchText(server, "/archive?checkpoint=ck-early")).text)
    expect(archive).toContain("Historical view unavailable")
    expect(archive).not.toContain("Show point-in-time demo")
  })
})

describe("browser workflow", () => {
  it("walks Homepage → Pulse → event → evidence → Move Log", async () => {
    await page.setViewport({ width: 1280, height: 800 })
    await gotoMarketingHome(page, server.url)
    expect(await page.$eval("h1", (node) => node.textContent)).toMatch(/Every probability/)

    await clickThrough(page, "a.btn-primary")
    expect(page.url()).toMatch(/\/pulse$/)
    await waitForWorkspaceReady(page)
    expect(await page.evaluate(() => document.body.innerText)).toContain(CURRENT_TITLE)
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(DEMO_TITLE)
    await saveScreenshot(page, "01_pulse_synthetic_book")

    await clickThrough(page, `a[aria-label="Open ${CURRENT_TITLE}"]`)
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

  it("opens a checkpoint URL, keeps later writes out, and returns to present", async () => {
    await gotoWorkspacePath(page, server.url, `/events/evt-test-temporal/history/${earlyCheckpoint}`)
    const historical = await page.evaluate(() => document.body.innerText)
    expect(historical).toContain(CURRENT_TITLE)
    expect(historical).not.toContain(LATER_TITLE)
    expect(historical).not.toContain("SYNTHETIC TEST correction")

    await clickThrough(page, "a.aion-button[data-primary='true']")
    expect(page.url()).toMatch(/\/events\/evt-test-temporal$/)
    expect(await page.evaluate(() => document.body.innerText)).toContain(CURRENT_TITLE)
    await saveScreenshot(page, "03_return_to_present")
  })

  it("keeps mobile layout inside the viewport", async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await gotoWorkspacePath(page, server.url, "/events/evt-test-temporal")
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
    await gotoMarketingHome(page, server.url)
    await page.focus("a.btn-primary")
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.keyboard.press("Enter")])
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
    await gotoWorkspacePath(page, server.url, "/events/evt-does-not-exist")
    const text = await page.evaluate(() => document.body.innerText)
    expect(text).toContain("Event not in the book")
    expect(text).not.toContain(CURRENT_TITLE)
    expect(text).not.toContain(DEMO_TITLE)
  })

  it("honours browser back and forward across the workflow", async () => {
    await gotoMarketingHome(page, server.url)
    await clickThrough(page, "a.btn-primary")
    await waitForWorkspaceReady(page)
    await clickThrough(page, `a[aria-label="Open ${SINGLE_TITLE}"]`)
    expect(page.url()).toMatch(/\/events\/evt-test-single$/)

    await page.goBack({ waitUntil: "domcontentloaded" })
    expect(page.url()).toMatch(/\/pulse$/)
    await waitForWorkspaceReady(page)
    await page.goForward({ waitUntil: "domcontentloaded" })
    expect(page.url()).toMatch(/\/events\/evt-test-single$/)
    expect(await page.evaluate(() => document.body.innerText)).toContain("Not computable")
  })

  it("keeps Following across a hard refresh and preserves an intentionally empty watchlist", async () => {
    await gotoWorkspacePath(page, server.url, "/events/evt-test-single")
    await page.click(`button[aria-label="Follow ${SINGLE_TITLE}"]`)
    await gotoWorkspacePath(page, server.url, "/watchlists")
    const before = await page.evaluate(() => document.body.innerText)
    expect(before).toMatch(/Saved in this browser/)
    expect(before).toContain(SINGLE_TITLE)

    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    expect(await page.evaluate(() => document.body.innerText)).toContain(SINGLE_TITLE)

    await page.evaluate((key) => {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, eventIds: [], userSaved: true }))
    }, followingStorageKey("database"))
    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    expect(await page.evaluate(() => document.body.innerText)).toContain("Nothing followed")
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

  it("updates the current view after a later write without rewriting the earlier checkpoint", async () => {
    const written = await upsert(database.url, TEMPORAL_LATER)
    expect(written.stdout).toMatch(/appended|updated|unchanged/)
    laterCheckpoint = parseCheckpointId(written.stdout)
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

    const historical = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(historical.status).toBe(200)
    expect((historical.body.semantics as { title: string }).title).toBe(CURRENT_TITLE)
    expect(JSON.stringify(historical.body)).not.toContain(LATER_TITLE)
    expect(JSON.stringify(historical.body)).not.toContain("ev-test-temporal-3")
    expect(historical.body.moveLogs).toEqual([
      expect.objectContaining({ version: 1, moveLogId: "ml-test-temporal-1" }),
    ])

    expect(laterCheckpoint).not.toBe(earlyCheckpoint)
    const laterView = await fetchJson(server, `/api/events/evt-test-temporal/history/${laterCheckpoint}`)
    expect(laterView.status).toBe(200)
    expect(JSON.stringify(laterView.body)).toContain(LATER_TITLE)

    await gotoWorkspacePath(page, server.url, `/events/evt-test-temporal?checkpoint=${earlyCheckpoint}`)
    const rendered = await page.evaluate(() => document.body.innerText)
    expect(rendered).toContain(CURRENT_TITLE)
    expect(rendered).not.toContain(LATER_TITLE)
    expect(rendered).not.toContain("SYNTHETIC TEST correction")
    await saveScreenshot(page, "05_earlier_checkpoint_stable")
  })
})

describe("release verification record", () => {
  it("writes verification metadata and unresolved risks", () => {
    expect(laterWriteApplied).toBe(true)
    writeFileSync(
      path.join(ARTIFACTS, "release-verification.json"),
      JSON.stringify(
        {
          baseBranch: "main",
          baseSha: TESTED_MAIN_SHA,
          verificationHead: process.env.GITHUB_SHA ?? "local",
          integrationBranch: "cursor/omen-workflow-integration-40b2",
          ciRunInspected: "36238221811",
          ciJobInspected: "108393816080",
          laterWriteApplied,
          blocked: [
            {
              id: "delayed-commit-excluded-from-earlier-checkpoint",
              reason:
                "Covered by src/lib/db/historical-reconstruction.db.test.ts (transactional late commit). Not duplicated in the browser workflow harness.",
            },
            {
              id: "npm-audit-runtime-exposure",
              reason: "See test-artifacts/npm-audit-report.json for advisory paths and runtime vs dev exposure.",
            },
          ],
        },
        null,
        2,
      ),
    )
  })
})
