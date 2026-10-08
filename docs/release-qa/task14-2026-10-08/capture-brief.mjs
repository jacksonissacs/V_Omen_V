/**
 * Task 14 evidence capture.
 *
 * Renders the normal event route in demo mode after a temporary
 * resolutionCriteria field is added to the demo event evt-boc-cut.
 * The field is restored before the process exits. Screenshots are taken
 * with no DOM edits and no screenshot CSS.
 *
 * Requires a demo server:
 *   OMEN_STORAGE_MODE=demo npx next dev --hostname 127.0.0.1 --port 3314
 *
 *   node docs/release-qa/task14-2026-10-08/capture-brief.mjs
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import puppeteer from "puppeteer-core"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const eventsPath = join(root, "src/data/events.ts")
const outDir = join(root, "docs/release-qa/task14-2026-10-08")
const baseUrl = process.env.TASK14_BASE_URL ?? "http://127.0.0.1:3314"
const eventUrl = `${baseUrl}/events/evt-boc-cut`
const storageKey = "omen-v0-following/v1/demo"
const marker = "END DEMO FIXTURE TASK14."

const anchor = `    tags: ["BoC", "CPI", "rates"],
    resolvesAt: "Oct 29 2026",
    entities: ["Canada", "CPI", "Bank of Canada"],`

const rule = buildRule()
const replacement = `    tags: ["BoC", "CPI", "rates"],
    resolvesAt: "Oct 29 2026",
    resolutionCriteria: ${JSON.stringify(rule)},
    entities: ["Canada", "CPI", "Bank of Canada"],`

const original = readFileSync(eventsPath, "utf8")
const beforeHash = sha256(original)
let restored = false

function buildRule() {
  const prefix =
    "DEMO FIXTURE TASK14. This resolution rule is fixture input for the event brief layout check. It is not a source claim and it is not a production claim. "
  const sentence =
    "The recorded rule continues so the full criteria stay in the resolutionCriteria prop and render below the action row. "
  let text = prefix
  while (text.length < 1299) text += sentence
  text += marker
  if (text.length < 1299) throw new Error(`fixture rule is ${text.length} characters`)
  return text
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
}

function restoreEvents() {
  writeFileSync(eventsPath, original)
  restored = readFileSync(eventsPath, "utf8") === original
}

async function waitForMarker(page, present) {
  const deadline = Date.now() + 90_000
  let last = ""
  while (Date.now() < deadline) {
    await page.goto(eventUrl, { waitUntil: "networkidle0", timeout: 60_000 })
    last = await page.evaluate(() => document.body?.innerText ?? "")
    if (present ? last.includes(marker) : !last.includes(marker)) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(present ? "demo fixture did not render" : "demo fixture was still rendered after restore")
}

function visible(box, viewport) {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x >= -1 &&
    box.y >= -1 &&
    box.x + box.width <= viewport.width + 1 &&
    box.y + box.height <= viewport.height + 1
  )
}

async function readBrief(page, viewport) {
  return page.evaluate((expectedRule) => {
    const main = document.querySelector(".aion-main")
    const actions = document.querySelector('[data-testid="event-actions"]')
    const criteria = document.querySelector('[data-testid="resolution-criteria"]')
    const question = document.querySelector(".aion-event-question")
    const archive = document.querySelector('[data-testid="event-archive-link"]')
    const controls = actions
      ? [...actions.querySelectorAll("a, button")].map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            text: element.textContent?.trim() ?? "",
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        })
      : []
    const criteriaText = criteria?.textContent ?? ""
    const renderedRule = criteriaText.startsWith("Resolution criteria ")
      ? criteriaText.slice("Resolution criteria ".length)
      : null
    return {
      title: document.querySelector("h1")?.textContent ?? "",
      question: question?.textContent ?? "",
      scrollTop: main instanceof HTMLElement ? main.scrollTop : null,
      questionBeforeActions: Boolean(
        question && actions && question.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      actionsBeforeCriteria: Boolean(
        actions && criteria && actions.compareDocumentPosition(criteria) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      renderedRule,
      ruleMatches: renderedRule === expectedRule,
      archiveHref: archive?.getAttribute("href") ?? "",
      controls,
    }
  }, rule)
}

async function keyboardEvidence(page) {
  const record = await page.evaluateHandle(() =>
    [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.trim() === "Record"),
  )
  await record.asElement().click()
  const button = await page.waitForSelector('[data-testid="event-actions"] button[data-primary="true"]')
  await button.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Evidence inspector",
  )
  return page.evaluate(() => {
    const evidence = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.trim() === "Evidence")
    return {
      activeElementLabel: document.activeElement?.getAttribute("aria-label") ?? "",
      evidenceTabSelected: evidence?.getAttribute("aria-selected") ?? "",
    }
  })
}

function storedIds(raw) {
  if (!raw) return null
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.eventIds)) return parsed.eventIds
  return null
}

async function followReload(page) {
  const read = () => page.evaluate((key) => localStorage.getItem(key), storageKey)
  const before = await read()
  await page.click('[data-testid="event-actions"] button[aria-pressed]')
  await page.waitForFunction(
    (key) => {
      const raw = localStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      const ids = Array.isArray(parsed) ? parsed : parsed.eventIds
      return Array.isArray(ids) && parsed.userSaved === true && !ids.includes("evt-boc-cut")
    },
    {},
    storageKey,
  )
  const afterToggle = await read()
  await page.reload({ waitUntil: "networkidle0", timeout: 60_000 })
  const afterReload = await read()
  const label = await page.$eval(
    '[data-testid="event-actions"] button[aria-pressed]',
    (element) => element.textContent?.trim() ?? "",
  )
  const ids = storedIds(afterReload)
  return {
    before,
    afterToggle,
    afterReload,
    survivedReload: afterToggle === afterReload && ids !== null && !ids.includes("evt-boc-cut"),
    labelAfterReload: label,
  }
}

async function capture(browser, viewport) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 })
  await waitForMarker(page, true)
  const brief = await readBrief(page, viewport)
  const checks = {
    demoTitle: brief.title === "Bank of Canada cuts rates in October",
    scrollTopZero: brief.scrollTop === 0,
    order: brief.questionBeforeActions && brief.actionsBeforeCriteria,
    fullRule: brief.ruleMatches && (brief.renderedRule?.length ?? 0) >= 1299,
    actionsVisible: brief.controls.length === 3 && brief.controls.every((control) => visible(control, viewport)),
    archiveHref: brief.archiveHref === "/archive?event=evt-boc-cut",
    mobileTargets: viewport.width !== 390 || brief.controls.every((control) => control.height >= 44),
  }
  const screenshot = join(outDir, `evt-boc-cut-${viewport.width}x${viewport.height}.png`)
  await page.screenshot({ path: screenshot, type: "png" })
  const keyboard = await keyboardEvidence(page)
  const follow = await followReload(page)
  await context.close()
  return {
    viewport,
    brief: { ...brief, renderedRule: undefined, renderedRuleLength: brief.renderedRule?.length ?? 0 },
    checks: {
      ...checks,
      keyboardFocus: keyboard.activeElementLabel === "Evidence inspector" && keyboard.evidenceTabSelected === "true",
      followPersisted: follow.survivedReload && follow.labelAfterReload === "Follow",
    },
    keyboard,
    follow,
    screenshot: screenshot.replace(`${root}/`, ""),
  }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})

try {
  if (!original.includes(anchor) || original.includes("resolutionCriteria")) {
    throw new Error("evt-boc-cut anchor missing, or events.ts already has resolutionCriteria")
  }
  writeFileSync(eventsPath, original.replace(anchor, replacement))
  if (readFileSync(eventsPath, "utf8") === original) throw new Error("fixture patch did not apply")

  const results = []
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    results.push(await capture(browser, viewport))
  }

  restoreEvents()
  const probe = await browser.newPage()
  await waitForMarker(probe, false)
  await probe.close()

  const sourceDiff = git([
    "diff",
    "--",
    "src/data/events.ts",
    "src/components/intelligence/event-intelligence-view.tsx",
    "src/app/aion-workspace.css",
  ])
  const report = {
    task: 14,
    superseded:
      "The DOM-inserted long-rule probe from the d37a716 review is superseded. It was not committed. This capture renders the resolutionCriteria prop through the normal event route.",
    separation:
      "Demo fixture evt-boc-cut only. This report makes no claim about the PR #34 sourced Gemini event or a production database.",
    productHead: git(["rev-parse", "HEAD"]),
    procedure:
      "Temporary resolutionCriteria on demo event evt-boc-cut in src/data/events.ts, then the normal /events/evt-boc-cut route. No DOM insertion, no screenshot CSS, no production route. Source restored before exit.",
    fixture: {
      eventId: "evt-boc-cut",
      label: "DEMO FIXTURE TASK14",
      ruleCharacters: rule.length,
      ruleSha256: sha256(rule),
    },
    source: {
      file: "src/data/events.ts",
      sha256Before: beforeHash,
      sha256AfterRestore: sha256(readFileSync(eventsPath)),
      restored,
      gitDiffAfterRestore: sourceDiff,
    },
    patch: replacement,
    results,
    passed: results.every((result) => Object.values(result.checks).every(Boolean)) && restored && sourceDiff === "",
  }
  writeFileSync(join(outDir, "fixture-rule.txt"), `${rule}\n`)
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
  if (!report.passed) {
    console.error(JSON.stringify(report, null, 2))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify({ passed: true, ruleCharacters: rule.length, screenshots: results.map((result) => result.screenshot) }, null, 2))
  }
} finally {
  if (!restored) restoreEvents()
  await browser.close()
}
