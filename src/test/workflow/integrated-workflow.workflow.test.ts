import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { Client } from "pg"
import type { Browser, Page } from "puppeteer-core"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { publishHistoryCheckpoint } from "@/lib/db/history-checkpoint"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { CHECKPOINT_NOT_FOUND } from "@/lib/domain/historical-reconstruction"
import { followingStorageKey } from "@/lib/following/persistence"
import type { DisposableDatabase } from "@/test/postgres-harness"
import {
  attachBrowserDiagnostics,
  bodyText,
  chromePath,
  clickControl,
  clickEnabledControl,
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
  createWorkflowDatabase,
  fetchJson,
  fetchText,
  gitRev,
  operator,
  parseOperatorCheckpointId,
  parseUpsertCheckpointId,
  queryCount,
  queryRows,
  startProductionServer,
  upsert,
  upsertExit,
  visibleHtml,
  writeArtifact,
  type RunningServer,
} from "@/test/workflow/harness"

const TEMPORAL = path.join(FIXTURES, "evt-temporal.json")
const TEMPORAL_LATER = path.join(FIXTURES, "evt-temporal.later.json")
const SINGLE = path.join(FIXTURES, "evt-single.json")
const SOURCED = path.join(FIXTURES, "evt-sourced.json")
const LATE = path.join(FIXTURES, "evt-late.json")

const CURRENT_TITLE = "[SYNTHETIC TEST] Example agency publishes the 2026 bulletin"
const LATER_TITLE = "[SYNTHETIC TEST] Example agency published the 2026 bulletin (updated)"
const SINGLE_TITLE = "[SYNTHETIC TEST] Single observation event"
const LATE_TITLE = "[SYNTHETIC TEST] Late commit subject"
const DEMO_TITLE = "Bank of Canada cuts rates in October"
const INTAKE_ID = "cisa-kev-cve-2026-9001-v1"
const INTAKE_EVIDENCE_ID = `ev-${INTAKE_ID}`
const INTAKE_EXCERPT = "SYNTHETIC TEST catalog excerpt for workflow intake. No probability is stated."
const INTAKE_KEY = "workflow-intake-evidence"
const LATE_LEAK = "LATE_COMMIT_LEAK"
const UNKNOWN_CHECKPOINT = "9007199254740993"
const CORRECTION_NOTE = "SYNTHETIC TEST correction: coverage revised from 60% to 45% after later evidence."

let database: DisposableDatabase
let server: RunningServer
let outage: RunningServer
let browser: Browser
let page: Page
let earlyCheckpoint = ""
let laterCheckpoint = ""
let lateCheckpoint = ""
let intakeCheckpoint = ""
let laterWriteApplied = false
let intakePublished = false
let headSha = ""

beforeAll(async () => {
  chromePath()
  headSha = gitRev("HEAD")
  database = await createWorkflowDatabase()
  const temporalSeed = await upsert(database.url, TEMPORAL)
  earlyCheckpoint = parseUpsertCheckpointId(temporalSeed.stdout)
  const lateSeed = await upsert(database.url, LATE)
  lateCheckpoint = parseUpsertCheckpointId(lateSeed.stdout)
  const seed = await Promise.all([upsert(database.url, SINGLE), upsert(database.url, SOURCED)])
  for (const result of [temporalSeed, lateSeed, ...seed]) {
    expect(result.stderr).toBe("")
    expect(result.stdout).not.toContain(database.url)
    expect(result.stdout).not.toContain("content_sha256")
  }
  expect(earlyCheckpoint).toMatch(/^[1-9]\d{0,18}$/)
  expect(lateCheckpoint).toMatch(/^[1-9]\d{0,18}$/)

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

  writeArtifact(
    "tested-sha.txt",
    [
      `testedMainSha=${TESTED_MAIN_SHA}`,
      `originMainSha=${gitRev("origin/main")}`,
      `headSha=${headSha}`,
      `verificationHead=${process.env.GITHUB_SHA ?? headSha}`,
      "",
    ].join("\n"),
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

function urlSelectsCheckpoint(url: string, checkpointId: string): boolean {
  const parsed = new URL(url)
  if (parsed.searchParams.get("checkpoint") === checkpointId) return true
  return parsed.pathname.endsWith(`/history/${checkpointId}`)
}

function intakeQueueDir(): string {
  const dir = path.join(ARTIFACTS, "intake-queue")
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "queue.json"),
    JSON.stringify(
      {
        schema: 1,
        sourceId: "cisa-kev",
        lastRequestAt: "2026-09-02T12:00:00.000Z",
        versions: [
          {
            id: INTAKE_ID,
            sourceId: "cisa-kev",
            sourceItemId: "CVE-2026-9001",
            version: 1,
            canonicalUrl:
              "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json#CVE-2026-9001",
            title: "SYNTHETIC TEST catalog entry",
            excerpt: INTAKE_EXCERPT,
            sourcePublishedAt: null,
            sourcePublishedDate: "2026-09-01",
            firstFetchedAt: "2026-09-02T12:00:00.000Z",
            contentIdentity: "ab".repeat(32),
            vendorProject: "Synthetic",
            product: "Fixture",
            candidateEventId: "evt-test-temporal",
            association: "operator",
            reviewState: "selected",
            priorVersionId: null,
          },
        ],
      },
      null,
      2,
    ),
  )
  return dir
}

async function evidenceCount(id: string): Promise<number> {
  return queryCount(database.url, "SELECT count(*)::int AS count FROM evidence WHERE id = $1", [id])
}

async function checkpointCount(eventId: string): Promise<number> {
  return queryCount(database.url, "SELECT count(*)::int AS count FROM history_checkpoints WHERE event_id = $1", [
    eventId,
  ])
}

async function openHistory(eventId: string, checkpointId: string): Promise<string> {
  await gotoWorkspacePath(page, server.url, `/events/${eventId}/history/${checkpointId}`)
  return bodyText(page)
}

async function openArchive(eventId: string, checkpointId?: string): Promise<string> {
  const query = new URLSearchParams({ event: eventId })
  if (checkpointId) query.set("checkpoint", checkpointId)
  await gotoWorkspacePath(page, server.url, `/archive?${query.toString()}`)
  return bodyText(page)
}

/** Historical facts, separate from the current-title option used for navigation. */
async function reconstructionText(): Promise<string> {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll("h2")].filter((node) =>
      /semantics|Evidence in this checkpoint|Move Log revisions in this checkpoint|Observations in this checkpoint|Headline probability/i.test(
        node.textContent ?? "",
      ),
    )
    if (headings.length === 0) return document.body.innerText
    return headings.map((heading) => heading.parentElement?.innerText ?? "").join("\n")
  })
}

async function tamperCheckpointDigest(checkpointId: string, digest: string): Promise<void> {
  const client = new Client({ connectionString: database.url, application_name: "omen-workflow-tamper" })
  await client.connect()
  try {
    await client.query("BEGIN")
    await client.query("ALTER TABLE history_checkpoints DISABLE TRIGGER history_checkpoints_append_only")
    await client.query("UPDATE history_checkpoints SET content_md5 = $2 WHERE id = $1::bigint", [checkpointId, digest])
    await client.query("ALTER TABLE history_checkpoints ENABLE TRIGGER history_checkpoints_append_only")
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

describe("production HTTP payloads", () => {
  it("lists only the synthetic book and never the in-process demo catalog", async () => {
    const { status, body } = await fetchJson(server, "/api/events")
    expect(status).toBe(200)
    expect(body.storage).toBe("database")
    expect(body.provenance).toBe("mixed")
    const events = body.events as Array<{ id: string; title: string; provenance: string }>
    expect(events.map((event) => event.id).sort()).toEqual([
      "evt-test-late",
      "evt-test-single",
      "evt-test-sourced",
      "evt-test-temporal",
    ])
    expect(events.some((event) => event.title === DEMO_TITLE)).toBe(false)
    expect(events.find((event) => event.id === "evt-test-sourced")?.provenance).toBe("sourced")
    expect(JSON.stringify(body)).not.toContain("contentSha256")
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
      previousProbability: number | null
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
    expect(JSON.stringify(body)).not.toContain(INTAKE_EXCERPT)
  })

  it("returns 404 for an unknown event id without a body event", async () => {
    const { status, body } = await fetchJson(server, "/api/events/evt-does-not-exist")
    expect(status).toBe(404)
    expect(body.error).toBe("Event not found")
    expect(body.event).toBeUndefined()
  })

  it("reconstructs a published checkpoint by decimal id and content_md5", async () => {
    const ok = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(ok.status).toBe(200)
    expect(ok.body.outcome).toBe("reconstruction")
    const checkpoint = ok.body.checkpoint as { id: string; contentMd5: string }
    expect(checkpoint.id).toBe(earlyCheckpoint)
    expect(checkpoint.contentMd5).toMatch(/^[0-9a-f]{32}$/)
    const semantics = (ok.body.semantics ?? {}) as { title?: string; status?: string }
    expect(semantics.title).toBe(CURRENT_TITLE)
    expect(semantics.status).toBe("active")
    const serialized = JSON.stringify(ok.body)
    expect(serialized).not.toContain(LATER_TITLE)
    expect(serialized).not.toContain(INTAKE_EXCERPT)
    expect(serialized).not.toContain("contentSha256")
    expect(serialized).not.toContain("content_sha256")
    expect(ok.body.event).toBeUndefined()
    const evidence = ok.body.evidence as Array<{ id: string; sourcePublishedAt: string | null }>
    expect(evidence.map((item) => item.id)).toEqual(["ev-test-temporal-1", "ev-test-temporal-2"])
    expect(evidence.find((item) => item.id === "ev-test-temporal-2")?.sourcePublishedAt).toBeNull()
    expect(ok.body.moveLogs).toEqual([
      expect.objectContaining({ version: 1, moveLogId: "ml-test-temporal-1", correctionNote: null }),
    ])
  })

  it("fails honestly for unknown, invalid, cross-event and arbitrary-time history", async () => {
    const missing = await fetchJson(server, `/api/events/evt-test-temporal/history/${UNKNOWN_CHECKPOINT}`)
    expect(missing.status).toBe(422)
    expect(missing.body.outcome).toBe("missing_checkpoint")
    expect(missing.body.error).toBe(CHECKPOINT_NOT_FOUND)
    expect(missing.body.event).toBeUndefined()
    expect(JSON.stringify(missing.body)).not.toContain(CURRENT_TITLE)

    const invalid = await fetchJson(server, "/api/events/evt-test-temporal/history/ck-early")
    expect(invalid.status).toBe(400)
    expect(invalid.body.outcome).toBe("invalid_request")
    expect(JSON.stringify(invalid.body)).not.toContain(CURRENT_TITLE)

    const crossed = await fetchJson(server, `/api/events/evt-test-temporal/history/${lateCheckpoint}`)
    expect(crossed.status).toBe(422)
    expect(crossed.body.outcome).toBe("missing_checkpoint")
    expect(JSON.stringify(crossed.body)).not.toContain(LATE_TITLE)

    const unknownEvent = await fetchJson(server, `/api/events/evt-does-not-exist/history/${earlyCheckpoint}`)
    expect(unknownEvent.status).toBe(404)
    expect(unknownEvent.body.outcome).toBe("unknown_event")
    expect(unknownEvent.body.event).toBeUndefined()

    const arbitrary = await fetchJson(
      server,
      `/api/events/evt-test-temporal/history/${earlyCheckpoint}?at=2026-09-01T00:00:00.000Z`,
    )
    expect(arbitrary.status).toBe(422)
    expect(arbitrary.body.outcome).toBe("unsupported_history")
    expect(JSON.stringify(arbitrary.body)).not.toContain(CURRENT_TITLE)

    const arbitraryPage = await fetchText(
      server,
      `/events/evt-test-temporal/history/${earlyCheckpoint}?at=2026-09-01T00:00:00.000Z`,
    )
    expect(arbitraryPage.status).toBe(200)
    expect(arbitraryPage.text).toContain("<title>Historical view unavailable · OMEN</title>")
    const arbitraryHtml = visibleHtml(arbitraryPage.text)
    expect(arbitraryHtml).toContain("Historical view unavailable")
    expect(arbitraryHtml).not.toContain("Event semantics in this checkpoint")
    expect(arbitraryHtml).not.toContain(CURRENT_TITLE)
    expect(arbitraryHtml).not.toContain(DEMO_TITLE)
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
    expect(history.body.outcome).toBe("unavailable")
    expect(history.body.event).toBeUndefined()
    expect(JSON.stringify(history.body)).not.toContain(CURRENT_TITLE)

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
    expect(html).not.toContain(CORRECTION_NOTE)
    expect(html).not.toContain(INTAKE_EXCERPT)
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
    expect(text).toContain('href="https://example.test/synthetic/sourced-filing"')
    expect(visibleHtml(text)).toContain("[SYNTHETIC TEST] Sourced bulletin citation")
  })
})

describe("browser workspace", () => {
  it("opens Pulse from the homepage with a real click", async () => {
    await gotoMarketingHome(page, server.url)
    await clickThrough(page, "a.btn-primary")
    expect(page.url()).toMatch(/\/pulse$/)
    const text = await bodyText(page)
    expect(text).toContain(CURRENT_TITLE)
    expect(text).not.toContain(DEMO_TITLE)
    await saveScreenshot(page, "01_pulse")
  })

  it("opens event evidence and the published Move Log from the card", async () => {
    await gotoWorkspacePath(page, server.url, "/pulse")
    await clickThrough(page, `a[aria-label="Open ${CURRENT_TITLE}"]`)
    expect(page.url()).toMatch(/\/events\/evt-test-temporal$/)
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
    expect(await bodyText(page)).toContain("ml-test-temporal-1")
    await saveScreenshot(page, "02_event_evidence_move_log")
  })

  it("reconstructs a checkpoint from the shareable history URL and returns to present", async () => {
    const historical = await openHistory("evt-test-temporal", earlyCheckpoint)
    expect(page.url()).toContain(`/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(await page.title()).toContain(`Checkpoint ${earlyCheckpoint}`)
    expect(await page.title()).not.toContain(DEMO_TITLE)
    expect(historical).toContain(CURRENT_TITLE)
    expect(historical).toContain("ml-test-temporal-1")
    expect(historical).toContain("SYNTHETIC TEST agency notice")
    expect(historical).not.toContain(LATER_TITLE)
    expect(historical).not.toContain(CORRECTION_NOTE)
    expect(historical).not.toContain(INTAKE_EXCERPT)
    expect(historical).not.toContain(DEMO_TITLE)
    expect(historical).not.toMatch(/58\.4/)

    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    expect(page.url()).toContain(earlyCheckpoint)
    expect(await bodyText(page)).toContain(CURRENT_TITLE)

    await clickControl(page, "Return to present")
    await page.waitForFunction(
      () => /\/events\/evt-test-temporal$/.test(window.location.pathname),
      { timeout: 20_000 },
    )
    await waitForWorkspaceReady(page)
    expect(await bodyText(page)).toContain(CURRENT_TITLE)
    await saveScreenshot(page, "03_return_to_present")
  })

  it("reaches the same checkpoint from Archive and keeps the URL shareable", async () => {
    await gotoWorkspacePath(page, server.url, "/events/evt-test-temporal")
    await clickThrough(page, "a[data-testid='event-archive-link']")
    expect(new URL(page.url()).searchParams.get("event")).toBe("evt-test-temporal")
    await page.waitForFunction(
      (id) => document.body.innerText.includes(`id ${id}`),
      { timeout: 20_000 },
      earlyCheckpoint,
    )
    if (!urlSelectsCheckpoint(page.url(), earlyCheckpoint)) {
      await page.evaluate((id) => {
        const control = [...document.querySelectorAll("a, button")].find((node) =>
          node.textContent?.includes(`id ${id}`),
        ) as HTMLElement | undefined
        if (!control) throw new Error(`No checkpoint control for id ${id}`)
        control.click()
      }, earlyCheckpoint)
      await page.waitForFunction(
        (id) => {
          const url = new URL(window.location.href)
          return url.searchParams.get("checkpoint") === id || url.pathname.endsWith(`/history/${id}`)
        },
        { timeout: 20_000 },
        earlyCheckpoint,
      )
      await waitForWorkspaceReady(page)
    }
    await page.waitForFunction(
      () => document.body.innerText.includes("Event semantics in this checkpoint"),
      { timeout: 20_000 },
    )
    const historical = await reconstructionText()
    expect(historical).toContain(CURRENT_TITLE)
    expect(historical).not.toContain(LATER_TITLE)
    expect(urlSelectsCheckpoint(page.url(), earlyCheckpoint)).toBe(true)
    const archivePage = await bodyText(page)
    expect(archivePage).toContain("Historical checkpoint view")
    expect(archivePage).not.toContain("Historical view unavailable")

    const shared = page.url()
    await page.goto("about:blank")
    await page.goto(shared, { waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    await page.waitForFunction(
      () => document.body.innerText.includes("Event semantics in this checkpoint"),
      { timeout: 20_000 },
    )
    expect(await reconstructionText()).toContain(CURRENT_TITLE)
    const reloaded = await bodyText(page)
    expect(reloaded).not.toContain(DEMO_TITLE)
    expect(reloaded).toContain("Historical checkpoint view")
    expect(reloaded).not.toContain("Historical view unavailable")
    await saveScreenshot(page, "03b_archive_checkpoint")
  })

  it("changes events without carrying a checkpoint and walks that navigation with back and forward", async () => {
    await openArchive("evt-test-temporal", earlyCheckpoint)
    await page.waitForFunction(
      () => document.body.innerText.includes("Event semantics in this checkpoint"),
      { timeout: 20_000 },
    )
    await page.select('select[aria-label="Event"]', "evt-test-single")
    await page.waitForFunction(
      () => {
        const url = new URL(window.location.href)
        return url.searchParams.get("event") === "evt-test-single" && url.searchParams.get("checkpoint") === null
      },
      { timeout: 20_000 },
    )
    await waitForWorkspaceReady(page)
    const panel = await page.evaluate(
      () => document.querySelector("[data-testid='historical-reconstruction']")?.textContent ?? "",
    )
    expect(panel).toBe("")
    expect(new URL(page.url()).searchParams.get("checkpoint")).toBeNull()

    await page.goBack({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    await page.waitForFunction(
      (id) => {
        const url = new URL(window.location.href)
        return (
          url.searchParams.get("checkpoint") === id &&
          document.body.innerText.includes("Event semantics in this checkpoint")
        )
      },
      { timeout: 20_000 },
      earlyCheckpoint,
    )
    expect(await reconstructionText()).toContain(CURRENT_TITLE)

    await page.goForward({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("event") === "evt-test-single",
      { timeout: 20_000 },
    )
    expect(new URL(page.url()).searchParams.get("checkpoint")).toBeNull()
  })

  it("opens a shared checkpoint URL in a fresh browser session", async () => {
    const context = await browser.createBrowserContext()
    const fresh = await context.newPage()
    try {
      attachBrowserDiagnostics(fresh)
      await fresh.setViewport({ width: 1280, height: 800 })
      await gotoWorkspacePath(fresh, server.url, `/events/evt-test-temporal/history/${earlyCheckpoint}`)
      expect(await fresh.title()).toContain(`Checkpoint ${earlyCheckpoint}`)
      expect(await fresh.title()).not.toContain(DEMO_TITLE)
      const text = await bodyText(fresh)
      expect(text).toContain("Historical checkpoint view")
      expect(text).toContain(CURRENT_TITLE)
      expect(text).not.toContain(DEMO_TITLE)
      await saveScreenshot(fresh, "07_fresh_session_checkpoint")
    } finally {
      await fresh.close().catch(() => undefined)
      await context.close().catch(() => undefined)
    }
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
    await openArchive("evt-test-temporal", earlyCheckpoint)
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await bodyText(page)).toContain(CURRENT_TITLE)
    await saveScreenshot(page, "04_event_detail_mobile")
    await page.setViewport({ width: 1280, height: 800, isMobile: false, hasTouch: false })
  })

  it("supports keyboard navigation from the homepage CTA, command palette and checkpoint list", async () => {
    await gotoMarketingHome(page, server.url)
    await page.focus("a.btn-primary")
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => window.location.pathname === "/pulse", { timeout: 20_000 })
    await waitForWorkspaceReady(page)

    await page.keyboard.down("Control")
    await page.keyboard.press("k")
    await page.keyboard.up("Control")
    await page.waitForSelector("[role='dialog']", { timeout: 20_000 })
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => !document.querySelector("[role='dialog']"), { timeout: 20_000 })

    await openArchive("evt-test-temporal", earlyCheckpoint)
    await page.waitForSelector('[aria-label="Recorded checkpoints"]', { timeout: 20_000 })
    await page.focus('[aria-label="Recorded checkpoints"]')
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await page.waitForFunction(
      (id) =>
        document.body.innerText.includes(`id ${id}`) &&
        document.body.innerText.includes("Historical checkpoint view"),
      { timeout: 20_000 },
      earlyCheckpoint,
    )
    const selected = await bodyText(page)
    expect(selected).toContain(`id ${earlyCheckpoint}`)
    expect(selected).toContain("Historical checkpoint view")
    expect(selected).not.toContain("Historical view unavailable")
  })

  it("shows the unknown-event page instead of current book text", async () => {
    await gotoWorkspacePath(page, server.url, "/events/evt-does-not-exist")
    const text = await bodyText(page)
    expect(text).toContain("Event not in the book")
    expect(text).not.toContain(CURRENT_TITLE)
    expect(text).not.toContain(DEMO_TITLE)
  })

  it("shows honest failures for unknown, invalid and unsupported history in the UI", async () => {
    const missing = await openHistory("evt-test-temporal", UNKNOWN_CHECKPOINT)
    expect(missing).toMatch(/No verified history checkpoint|Historical view unavailable/)
    expect(missing).not.toContain(CURRENT_TITLE)
    expect(missing).not.toContain(DEMO_TITLE)

    const invalid = await openHistory("evt-test-temporal", "ck-early")
    expect(invalid).toMatch(/positive decimal|not valid|Historical view unavailable/)
    expect(invalid).not.toContain(CURRENT_TITLE)

    await page.goto(new URL("/archive?event=evt-test-temporal&at=2026-09-01T00:00:00.000Z", server.url).toString(), {
      waitUntil: "domcontentloaded",
    })
    await waitForWorkspaceReady(page)
    const unsupported = await bodyText(page)
    expect(unsupported).toMatch(/Arbitrary-time|not a verified visibility|unsupported|Historical view unavailable/)
    expect(unsupported).not.toContain(CURRENT_TITLE)
  })

  it("honours browser back and forward across the workflow", async () => {
    await gotoMarketingHome(page, server.url)
    await clickThrough(page, "a.btn-primary")
    await clickThrough(page, `a[aria-label="Open ${SINGLE_TITLE}"]`)
    expect(page.url()).toMatch(/\/events\/evt-test-single$/)

    await page.goBack({ waitUntil: "domcontentloaded" })
    expect(page.url()).toMatch(/\/pulse$/)
    await waitForWorkspaceReady(page)
    await page.goForward({ waitUntil: "domcontentloaded" })
    expect(page.url()).toMatch(/\/events\/evt-test-single$/)
    expect(await bodyText(page)).toContain("Not computable")
  })

  it("keeps Following across a hard refresh and preserves an intentionally empty watchlist", async () => {
    await gotoWorkspacePath(page, server.url, "/events/evt-test-single")
    await page.click(`button[aria-label="Follow ${SINGLE_TITLE}"]`)
    await gotoWorkspacePath(page, server.url, "/watchlists")
    const before = await bodyText(page)
    expect(before).toMatch(/Saved in this browser/)
    expect(before).toContain(SINGLE_TITLE)

    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    expect(await bodyText(page)).toContain(SINGLE_TITLE)

    await page.evaluate((key) => {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, eventIds: [], userSaved: true }))
    }, followingStorageKey("database"))
    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForWorkspaceReady(page)
    expect(await bodyText(page)).toContain("Nothing followed")
  })

  it("renders the outage workspace without demo fallback", async () => {
    await gotoWorkspacePath(page, outage.url, "/pulse")
    const text = await bodyText(page)
    expect(text).toMatch(/Workspace data unavailable|Data unavailable/)
    expect(text).not.toContain(DEMO_TITLE)
    expect(text).not.toContain(CURRENT_TITLE)
    await gotoWorkspacePath(page, outage.url, `/events/evt-test-temporal/history/${earlyCheckpoint}`)
    const history = await bodyText(page)
    expect(history).toMatch(/unavailable|Data unavailable/)
    expect(history).not.toContain(CURRENT_TITLE)
    expect(history).not.toContain(DEMO_TITLE)
  })
})

describe("intake review publication and checkpoint stability", () => {
  it("stages an intake import without publishing evidence", async () => {
    const queue = intakeQueueDir()
    const imported = await operator(database.url, [
      "intake",
      "import",
      "--queue",
      path.join(queue, "queue.json"),
      "--item",
      INTAKE_ID,
      "--by",
      "workflow.operator",
    ])
    expect(imported.code).toBe(0)
    expect(imported.stdout).toContain("Import did not approve or publish the capture.")
    expect(imported.stdout).toContain('"status": "staged"')
    expect(imported.stdout).not.toContain(database.url)

    const again = await operator(database.url, [
      "intake",
      "import",
      "--queue",
      path.join(queue, "queue.json"),
      "--item",
      INTAKE_ID,
      "--by",
      "workflow.operator",
    ])
    expect(again.code).toBe(0)
    expect(again.stdout).toContain('"action": "unchanged"')
    expect(await evidenceCount(INTAKE_EVIDENCE_ID)).toBe(0)
    expect(await queryCount(database.url, "SELECT count(*)::int AS count FROM source_review_items")).toBe(1)

    const html = visibleHtml((await fetchText(server, "/events/evt-test-temporal")).text)
    expect(html).not.toContain(INTAKE_EXCERPT)
    expect(html).not.toContain("CISA Known Exploited Vulnerabilities")
  })

  it("requires an explicit review before publication", async () => {
    const premature = await operator(database.url, [
      "publish",
      "approved",
      "--review-item",
      INTAKE_ID,
      "--idempotency-key",
      INTAKE_KEY,
    ])
    expect(premature.code).not.toBe(0)
    expect(`${premature.stdout}\n${premature.stderr}`).toMatch(/must be approved before publication/)
    expect(await evidenceCount(INTAKE_EVIDENCE_ID)).toBe(0)

    const incomplete = await operator(database.url, ["review", "approve", INTAKE_ID, "--by", "workflow.reviewer"])
    expect(incomplete.code).not.toBe(0)
    expect(`${incomplete.stdout}\n${incomplete.stderr}`).toMatch(/stance and reliability/)
    expect(await evidenceCount(INTAKE_EVIDENCE_ID)).toBe(0)

    const approved = await operator(database.url, [
      "review",
      "approve",
      INTAKE_ID,
      "--by",
      "workflow.reviewer",
      "--note",
      "Catalog entry checked.",
      "--stance",
      "contextual",
      "--reliability",
      "0.4",
    ])
    expect(approved.code).toBe(0)
    expect(approved.stdout).toContain('"status": "approved"')
    expect(await evidenceCount(INTAKE_EVIDENCE_ID)).toBe(0)

    const published = await operator(database.url, [
      "publish",
      "approved",
      "--review-item",
      INTAKE_ID,
      "--idempotency-key",
      INTAKE_KEY,
    ])
    expect(published.code).toBe(0)
    intakeCheckpoint = parseOperatorCheckpointId(published.stdout)
    expect(intakeCheckpoint).not.toBe(earlyCheckpoint)
    intakePublished = true
    expect(await evidenceCount(INTAKE_EVIDENCE_ID)).toBe(1)

    const { body } = await fetchJson(server, "/api/events/evt-test-temporal")
    const event = body.event as {
      evidence: Array<{ id: string; publishedAt: string | null; name: string }>
      moveLog?: { id: string; version: number }
    }
    expect(event.evidence.map((item) => item.id)).toContain(INTAKE_EVIDENCE_ID)
    expect(event.evidence.find((item) => item.id === INTAKE_EVIDENCE_ID)?.publishedAt).toBeNull()
    expect(event.moveLog).toMatchObject({ id: "ml-test-temporal-1", version: 1 })

    await gotoWorkspacePath(page, server.url, "/events/evt-test-temporal")
    const rendered = await bodyText(page)
    expect(rendered).toContain(INTAKE_EXCERPT)
    expect(rendered).toContain("CISA Known Exploited Vulnerabilities")
    expect(rendered).toContain("Not stated by source")
    expect(rendered).toContain("ml-test-temporal-1")
    await saveScreenshot(page, "06_published_intake_evidence")
  })

  it("does not duplicate evidence, Move Logs or checkpoints when publication is retried", async () => {
    expect(intakePublished).toBe(true)
    const evidenceBefore = await evidenceCount(INTAKE_EVIDENCE_ID)
    const checkpointsBefore = await checkpointCount("evt-test-temporal")
    const revisionsBefore = await queryCount(
      database.url,
      "SELECT count(*)::int AS count FROM move_log_revisions WHERE move_log_id = 'ml-test-temporal-1'",
    )

    const repeat = await operator(database.url, ["publish", "retry", "--idempotency-key", INTAKE_KEY])
    expect(repeat.code, `${repeat.stdout}\n${repeat.stderr}`).toBe(0)
    expect(parseOperatorCheckpointId(repeat.stdout)).toBe(intakeCheckpoint)

    await queryRows(
      database.url,
      `UPDATE publication_operations
          SET status = 'checkpoint_pending', last_error = 'workflow simulated checkpoint pending'
        WHERE idempotency_key = $1`,
      [INTAKE_KEY],
    )
    const retried = await operator(database.url, ["publish", "retry", "--idempotency-key", INTAKE_KEY])
    expect(retried.code).toBe(0)
    expect(parseOperatorCheckpointId(retried.stdout)).toBe(intakeCheckpoint)
    const status = await queryRows<{ status: string }>(
      database.url,
      "SELECT status FROM publication_operations WHERE idempotency_key = $1",
      [INTAKE_KEY],
    )
    expect(status[0]?.status).toBe("completed")
    expect(await evidenceCount(INTAKE_EVIDENCE_ID)).toBe(evidenceBefore)
    expect(await checkpointCount("evt-test-temporal")).toBe(checkpointsBefore)
    expect(
      await queryCount(
        database.url,
        "SELECT count(*)::int AS count FROM move_log_revisions WHERE move_log_id = 'ml-test-temporal-1'",
      ),
    ).toBe(revisionsBefore)

    const early = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(JSON.stringify(early.body)).not.toContain(INTAKE_EXCERPT)
    expect(JSON.stringify(early.body)).not.toContain(INTAKE_EVIDENCE_ID)
  })

  it("keeps the earlier checkpoint stable after later evidence, metadata edits and corrections", async () => {
    const written = await upsert(database.url, TEMPORAL_LATER)
    laterCheckpoint = parseUpsertCheckpointId(written.stdout)
    laterWriteApplied = true
    expect(laterCheckpoint).not.toBe(earlyCheckpoint)
    expect(laterCheckpoint).not.toBe(intakeCheckpoint)

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
      INTAKE_EVIDENCE_ID,
      "ev-test-temporal-1",
      "ev-test-temporal-2",
      "ev-test-temporal-3",
    ])
    expect(event.moveLog).toMatchObject({ version: 2, correctionNote: CORRECTION_NOTE })

    const html = visibleHtml((await fetchText(server, "/events/evt-test-temporal")).text)
    expect(html).toContain(LATER_TITLE)
    expect(html).toMatch(/version\s*2/)
    expect(html).toContain(CORRECTION_NOTE)

    const historical = await fetchJson(server, `/api/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(historical.status).toBe(200)
    expect((historical.body.semantics as { title: string; status: string }).title).toBe(CURRENT_TITLE)
    expect((historical.body.semantics as { status: string }).status).toBe("active")
    const frozen = JSON.stringify(historical.body)
    expect(frozen).not.toContain(LATER_TITLE)
    expect(frozen).not.toContain("ev-test-temporal-3")
    expect(frozen).not.toContain(INTAKE_EVIDENCE_ID)
    expect(frozen).not.toContain(CORRECTION_NOTE)
    expect(historical.body.moveLogs).toEqual([
      expect.objectContaining({ version: 1, moveLogId: "ml-test-temporal-1" }),
    ])

    await openHistory("evt-test-temporal", earlyCheckpoint)
    const historyPage = await fetchText(server, `/events/evt-test-temporal/history/${earlyCheckpoint}`)
    expect(historyPage.text).toContain(`<title>Checkpoint ${earlyCheckpoint} · OMEN</title>`)
    expect(historyPage.text).not.toContain(`<title>${LATER_TITLE}`)
    const historyVisible = visibleHtml(historyPage.text)
    expect(historyVisible).toContain(CURRENT_TITLE)
    expect(historyVisible).not.toContain(LATER_TITLE)
    const historySurface = await reconstructionText()
    expect(historySurface).toContain(CURRENT_TITLE)
    expect(historySurface).not.toContain(LATER_TITLE)
    expect(historySurface).not.toContain(CORRECTION_NOTE)
    expect(historySurface).not.toContain("SYNTHETIC TEST later correction note")
    expect(historySurface).not.toContain("CISA Known Exploited Vulnerabilities")

    await openArchive("evt-test-temporal", laterCheckpoint)
    expect(urlSelectsCheckpoint(page.url(), laterCheckpoint)).toBe(true)
    let steps = 0
    while (!urlSelectsCheckpoint(page.url(), earlyCheckpoint) && steps < 6) {
      const before = page.url()
      await clickEnabledControl(page, "Previous checkpoint")
      await page.waitForFunction((previous) => window.location.href !== previous, { timeout: 20_000 }, before)
      await waitForWorkspaceReady(page)
      steps += 1
    }
    expect(urlSelectsCheckpoint(page.url(), earlyCheckpoint)).toBe(true)
    const archived = await reconstructionText()
    expect(archived).toContain(CURRENT_TITLE)
    expect(archived).not.toContain(LATER_TITLE)
    expect(archived).not.toContain(CORRECTION_NOTE)
    const beforeNext = page.url()
    await clickEnabledControl(page, "Next checkpoint")
    await page.waitForFunction((previous) => window.location.href !== previous, { timeout: 20_000 }, beforeNext)
    await waitForWorkspaceReady(page)
    expect(urlSelectsCheckpoint(page.url(), earlyCheckpoint)).toBe(false)
    await saveScreenshot(page, "05_earlier_checkpoint_stable")
  })

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

  it("keeps a delayed commit out of the earlier checkpoint", async () => {
    const writer = new Client({ connectionString: database.url, application_name: "omen-workflow-late-writer" })
    const publisher = new Client({ connectionString: database.url, application_name: "omen-workflow-late-publisher" })
    await writer.connect()
    await publisher.connect()
    try {
      await writer.query("BEGIN")
      await writer.query(
        `INSERT INTO evidence (
           id, event_id, source_name, source_published_at, first_observed_at, captured_at,
           summary, stance, reliability, recorded_by, provenance
         ) VALUES (
           'ev-test-late-delayed', 'evt-test-late', 'late source', '2020-01-01T00:00:00Z', '2026-09-02T00:00:00Z',
           '2026-09-02T00:01:00Z', $1, 'contextual', 0.40, 'workflow', 'demo'
         )`,
        [LATE_LEAK],
      )
      await publisher.query("SET lock_timeout = '3s'")
      const during = await publishHistoryCheckpoint(publisher, "evt-test-late")
      expect(during).toMatchObject({ id: lateCheckpoint, created: false })
      await writer.query("COMMIT")

      const historical = await fetchJson(server, `/api/events/evt-test-late/history/${lateCheckpoint}`)
      expect(historical.status).toBe(200)
      expect(JSON.stringify(historical.body)).not.toContain(LATE_LEAK)
      expect((historical.body.evidence as Array<{ id: string }>).map((item) => item.id)).toEqual(["ev-test-late-base"])

      const rendered = await openHistory("evt-test-late", lateCheckpoint)
      expect(rendered).toContain(LATE_TITLE)
      expect(rendered).toContain("SYNTHETIC TEST late base note")
      expect(rendered).not.toContain(LATE_LEAK)

      const after = await publishHistoryCheckpoint(publisher, "evt-test-late")
      expect(after.created).toBe(true)
      expect(after.id).not.toBe(lateCheckpoint)
      const included = await fetchJson(server, `/api/events/evt-test-late/history/${after.id}`)
      expect(JSON.stringify(included.body)).toContain(LATE_LEAK)
      const stillEarly = await openHistory("evt-test-late", lateCheckpoint)
      expect(stillEarly).not.toContain(LATE_LEAK)
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined)
      await writer.end()
      await publisher.end()
    }
  })

  it("refuses an unverifiable checkpoint without substituting current text", async () => {
    const original = await queryRows<{ content_md5: string }>(
      database.url,
      "SELECT content_md5 FROM history_checkpoints WHERE id = $1::bigint",
      [lateCheckpoint],
    )
    await tamperCheckpointDigest(lateCheckpoint, "ab".repeat(16))
    const failed = await fetchJson(server, `/api/events/evt-test-late/history/${lateCheckpoint}`)
    expect(failed.status).toBe(422)
    expect(failed.body.outcome).toBe("verification_failed")
    expect(String(failed.body.error)).toContain("digest-mismatch")
    expect(JSON.stringify(failed.body)).not.toContain(LATE_TITLE)
    expect(JSON.stringify(failed.body)).not.toContain(LATE_LEAK)

    const rendered = await openHistory("evt-test-late", lateCheckpoint)
    expect(rendered).toMatch(/failed verification|Historical view unavailable/)
    expect(rendered).not.toContain(LATE_TITLE)
    expect(rendered).not.toContain(LATE_LEAK)
    expect(rendered).not.toContain(DEMO_TITLE)

    const current = await fetchJson(server, "/api/events/evt-test-late")
    expect(current.status).toBe(200)
    expect((current.body.event as { title: string }).title).toBe(LATE_TITLE)

    await tamperCheckpointDigest(lateCheckpoint, original[0]!.content_md5)
  })
})

describe("release verification record", () => {
  it("writes verification metadata for this integration head", () => {
    expect(laterWriteApplied).toBe(true)
    expect(intakePublished).toBe(true)
    writeArtifact(
      "release-verification.json",
      JSON.stringify(
        {
          baseBranch: "main",
          baseSha: TESTED_MAIN_SHA,
          originMainSha: gitRev("origin/main"),
          headSha,
          verificationHead: process.env.GITHUB_SHA ?? headSha,
          integrationBranch: "release/omen-v0-integration",
          checkpointIdentity: "checkpoint_id/content_md5",
          laterWriteApplied,
          intakePublished,
          earlyCheckpoint,
          laterCheckpoint,
          intakeCheckpoint,
          externalSourceSmoke: "separate from this deterministic suite; see CI job external-source-smoke",
        },
        null,
        2,
      ),
    )
  })
})
