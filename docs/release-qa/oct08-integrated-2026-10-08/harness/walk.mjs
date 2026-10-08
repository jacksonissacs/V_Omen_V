/**
 * Continuous production walkthrough of the integrated candidate.
 * Headed Chromium on DISPLAY :1, one ffmpeg recording per viewport.
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"

const require = createRequire("/tmp/omen-oct08-integrated/package.json")
const puppeteer = require("puppeteer-core")

const BASE = "http://127.0.0.1:3310"
const EVENT = "/events/evt-gemini-4-public-2026-10-31"
const OUT = "/tmp/omen-oct08-proof/browser"
const ART = "/opt/cursor/artifacts"
mkdirSync(OUT, { recursive: true })
mkdirSync(ART, { recursive: true })

const QUESTION = "Gemini 4.0 released by October 31, 2026?"
const TITLE = "Gemini 4.0 released by October 31, 2026"
const SEEDED = ["Bank of Canada", "evt-boc-cut", "Will the Bank of Canada"]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function startRecording(file) {
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "x11grab",
      "-draw_mouse",
      "1",
      "-video_size",
      "1920x1200",
      "-framerate",
      "12",
      "-i",
      ":1.0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      file,
    ],
    { stdio: "ignore", env: { ...process.env, DISPLAY: ":1" } },
  )
  return ff
}

async function stopRecording(ff) {
  if (!ff || ff.killed) return
  ff.kill("SIGINT")
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      ff.kill("SIGKILL")
      resolve()
    }, 8000)
    ff.on("exit", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function shot(page, name) {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file })
  return name
}

async function bodyFacts(page) {
  return page.evaluate(() => {
    const question = document.querySelector(".aion-event-question")
    const actions = document.querySelector("[data-testid='event-actions']")
    const criteria = document.querySelector("[data-testid='resolution-criteria']")
    const following = (flag) => (left, right) => (left.compareDocumentPosition(right) & flag) !== 0
    const after = following(Node.DOCUMENT_POSITION_FOLLOWING)
    const buttons = actions
      ? [...actions.querySelectorAll("button, a")].map((node) => {
          const rect = node.getBoundingClientRect()
          const style = getComputedStyle(node)
          return {
            name: node.getAttribute("aria-label") || node.textContent.replace(/\s+/g, " ").trim(),
            width: rect.width,
            height: rect.height,
            top: rect.top,
            transitionDuration: style.transitionDuration,
          }
        })
      : []
    const provenance = document.querySelector("[data-testid='event-provenance']")
    return {
      url: location.href,
      text: document.body.innerText,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      order: question && actions && criteria
        ? {
            questionBeforeActions: after(question, actions),
            actionsBeforeCriteria: after(actions, criteria),
            actionsBottom: actions.getBoundingClientRect().bottom,
            criteriaTop: criteria.getBoundingClientRect().top,
            criteriaStarts: criteria.innerText.slice(0, 220),
          }
        : null,
      buttons,
      provenance: provenance
        ? { text: provenance.textContent.trim(), display: getComputedStyle(provenance).display }
        : null,
      names: [...document.querySelectorAll("[data-testid='evidence-item'] .aion-inspector-section")].map((node) =>
        node.textContent.replace(/\s+/g, " ").trim(),
      ),
    }
  })
}

async function walk(page, label) {
  const notes = { label, steps: [] }
  const note = (step, extra) => notes.steps.push({ step, ...extra })

  await page.goto(`${BASE}/pulse`, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForSelector("[data-testid='event-provenance']", { timeout: 15000 })
  await pause(900)
  const pulse = await bodyFacts(page)
  assert(pulse.text.includes(QUESTION), `${label} pulse does not show the sourced question`)
  assert(pulse.provenance?.text === "Sourced", `${label} pulse provenance is ${pulse.provenance?.text}`)
  assert(pulse.provenance.display !== "none", `${label} provenance chip display is none`)
  for (const banned of SEEDED) assert(!pulse.text.includes(banned), `${label} pulse contains seeded text ${banned}`)
  assert(pulse.text.includes("07 Oct, 14:50"), `${label} pulse hides the 7 October observation time`)
  note("pulse", { file: await shot(page, `${label}-01-pulse.png`), provenance: pulse.provenance })

  await page.click(`a[aria-label="Open brief for ${QUESTION}"]`)
  await page.waitForSelector("[data-testid='event-actions']", { timeout: 15000 })
  await page.waitForSelector("[data-testid='resolution-criteria']")
  await pause(900)
  const brief = await bodyFacts(page)
  assert(brief.order?.questionBeforeActions, `${label} question is not before the action row`)
  assert(brief.order.actionsBeforeCriteria, `${label} action row is not before the resolution rule`)
  assert(brief.order.actionsBottom <= brief.order.criteriaTop + 1, `${label} action row is not visually above the resolution rule`)
  assert(brief.order.criteriaStarts.includes("Resolution criteria"), `${label} resolution rule label missing`)
  assert(brief.order.criteriaStarts.includes("Gemini 4.0"), `${label} resolution rule text missing`)
  const actionNames = brief.buttons.map((button) => button.name)
  assert(actionNames.some((name) => name.includes("Inspect evidence")), `${label} missing Inspect evidence`)
  assert(actionNames.some((name) => name.includes(`Follow ${TITLE}`)), `${label} missing Follow in ${JSON.stringify(actionNames)}`)
  assert(actionNames.some((name) => name.includes("Open recorded history")), `${label} missing archive action`)
  if (label === "phone") {
    for (const button of brief.buttons) {
      assert(button.height >= 44, `${label} ${button.name} height ${button.height} is under 44`)
    }
  }
  assert(brief.text.includes("94.5%"), `${label} brief missing 94.5%`)
  assert(brief.text.includes("not a live feed"), `${label} brief does not say this is not a live feed`)
  assert(brief.text.includes("07 Oct, 14:50"), `${label} brief missing observation time`)
  note("brief-actions", {
    file: await shot(page, `${label}-02-brief-actions.png`),
    order: brief.order,
    buttons: brief.buttons,
  })

  const inspect = await page.$("button[data-primary='true']")
  assert(inspect, "Inspect evidence button missing")
  await inspect.focus()
  await pause(400)
  await page.keyboard.press("Enter")
  await pause(700)
  const focused = await page.evaluate(() => {
    const inspector = document.querySelector("#event-evidence")
    return {
      active: document.activeElement?.getAttribute("aria-label") || document.activeElement?.id || document.activeElement?.tagName,
      evidenceSelected: document.querySelector("[role='tab'][aria-selected='true']")?.textContent?.trim() ?? "",
      inspectorFocused:
        document.activeElement?.getAttribute("aria-label") === "Evidence inspector" ||
        document.activeElement === inspector ||
        Boolean(inspector && document.activeElement && inspector.contains(document.activeElement)),
    }
  })
  assert(focused.evidenceSelected === "Evidence", `${label} Evidence tab not selected after keyboard: ${focused.evidenceSelected}`)
  assert(focused.inspectorFocused, `${label} inspector did not receive focus (${focused.active})`)
  await pause(600)
  const evidence = await bodyFacts(page)
  if (!evidence.names.includes("Polymarket gamma API")) {
    await page.evaluate(() => document.querySelector("#event-evidence")?.scrollIntoView({ block: "start" }))
    await pause(400)
  }
  const evidenceAfter = await bodyFacts(page)
  for (const name of ["Polymarket gamma API", "Polymarket", "Google blog"]) {
    assert(evidenceAfter.names.includes(name) || evidenceAfter.text.includes(name), `${label} missing source ${name}`)
  }
  assert(evidenceAfter.text.includes("Not recorded"), `${label} reliability is not shown as Not recorded`)
  assert(evidenceAfter.text.includes("Not stated by source"), `${label} unknown publication is not shown`)
  assert(evidenceAfter.text.includes("Sourced"), `${label} sourced provenance missing on the brief`)
  note("evidence", { file: await shot(page, `${label}-03-evidence.png`), names: evidenceAfter.names, focus: focused })

  await page.click(`button[aria-label="Follow ${TITLE}"]`)
  await pause(600)
  const followed = await page.evaluate(() => localStorage.getItem("omen-v0-following/v1/database"))
  assert(followed?.includes("evt-gemini-4-public-2026-10-31"), `${label} follow did not persist ${followed}`)
  note("followed", { storage: followed, file: await shot(page, `${label}-04-followed.png`) })

  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForSelector(`button[aria-label="Unfollow ${TITLE}"]`, { timeout: 15000 })
  await pause(700)
  const reloaded = await page.evaluate(() => localStorage.getItem("omen-v0-following/v1/database"))
  assert(reloaded?.includes("evt-gemini-4-public-2026-10-31"), `${label} follow did not survive reload`)
  note("reloaded", { storage: reloaded, file: await shot(page, `${label}-05-reloaded.png`) })

  const followingLinks = await page.$$("a[href='/watchlists']")
  let openedFollowing = false
  for (const link of followingLinks) {
    const box = await link.boundingBox()
    if (box && box.width > 0 && box.height > 0) {
      await link.click()
      openedFollowing = true
      break
    }
  }
  assert(openedFollowing, `${label} Following link was not visible`)
  await page.waitForSelector("h1", { timeout: 15000 })
  await pause(800)
  const following = await bodyFacts(page)
  assert(following.text.includes(TITLE), `${label} Following does not list the event`)
  assert(!following.text.includes("Nothing followed"), `${label} Following is empty after a saved follow`)
  note("following", { file: await shot(page, `${label}-06-following.png`), url: following.url })

  await page.goto(`${BASE}/archive?event=evt-gemini-4-public-2026-10-31&checkpoint=1`, {
    waitUntil: "domcontentloaded",
  })
  await page.waitForFunction(
    () => document.body.innerText.includes("Stored reconstruction") || document.body.innerText.includes("94.5%"),
    { timeout: 15000 },
  )
  await pause(1000)
  const archive = await bodyFacts(page)
  assert(archive.url.includes("checkpoint=1"), `${label} archive url lost the checkpoint: ${archive.url}`)
  assert(archive.text.includes(QUESTION) || archive.text.includes(TITLE), `${label} archive missing the event`)
  assert(archive.text.includes("94.5%") || archive.text.includes("94.5"), `${label} archive missing the stored probability`)
  assert(archive.text.includes("07 Oct") || archive.text.includes("2026-10-07"), `${label} archive missing the October 7 clock`)
  note("archive", { file: await shot(page, `${label}-07-archive.png`), url: archive.url })

  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.goto(`${BASE}${EVENT}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-testid='event-actions'] .aion-button")
  await pause(500)
  const motion = await page.$eval("[data-testid='event-actions'] .aion-button", (node) => getComputedStyle(node).transitionDuration)
  assert(motion === "0s" || motion === "0ms", `${label} reduced motion transition is ${motion}`)
  note("reduced-motion", { transitionDuration: motion, file: await shot(page, `${label}-08-reduced-motion.png`) })
  return notes
}

async function emptyFollowing(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${BASE}/watchlists`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("h2", { timeout: 15000 })
  await pause(400)
  let text = await page.evaluate(() => document.body.innerText)
  assert(text.includes("Nothing followed"), "fresh Following is not empty")
  await shot(page, "empty-following.png")
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForSelector("h2")
  text = await page.evaluate(() => document.body.innerText)
  assert(text.includes("Nothing followed"), "empty Following changed after refresh")
  await shot(page, "empty-following-refresh.png")
  await page.close()
}

async function guardPage(browser, url, file) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  await pause(400)
  const text = await page.evaluate(() => document.body.innerText)
  await shot(page, file)
  await page.close()
  return { url, status: response?.status() ?? null, text: text.slice(0, 500) }
}

const report = { base: BASE, walks: [], guards: [] }
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  headless: false,
  defaultViewport: null,
  env: { ...process.env, DISPLAY: ":1" },
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--window-position=40,40",
    "--window-size=1480,980",
    "--force-device-scale-factor=1",
  ],
})

const desktopVideo = path.join(ART, "oct08-desktop-walkthrough.mp4")
const phoneVideo = path.join(ART, "oct08-phone-walkthrough.mp4")
try {
  const desktopRecorder = startRecording(desktopVideo)
  try {
    await pause(400)
    const desktopContext = await browser.createBrowserContext()
    const desktop = await desktopContext.newPage()
    await desktop.setViewport({ width: 1440, height: 900 })
    report.walks.push(await walk(desktop, "desktop"))
    await pause(600)
    await desktopContext.close()
  } finally {
    await stopRecording(desktopRecorder)
  }

  const phoneRecorder = startRecording(phoneVideo)
  try {
    await pause(400)
    const phoneContext = await browser.createBrowserContext()
    const phone = await phoneContext.newPage()
    await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    report.walks.push(await walk(phone, "phone"))
    await pause(600)
    await phoneContext.close()
  } finally {
    await stopRecording(phoneRecorder)
  }

  await emptyFollowing(browser)
  report.guards.push(await guardPage(browser, "http://127.0.0.1:3312/pulse", "demo-pulse.png"))
  report.guards.push(await guardPage(browser, "http://127.0.0.1:3314/pulse", "unset-pulse.png"))
  report.guards.push(await guardPage(browser, "http://127.0.0.1:3316/pulse", "unavailable-db-pulse.png"))
} finally {
  await browser.close()
}

const routes = ["/markets", "/signals", "/agents", "/research", "/relations", "/alerts", "/graph"]
report.legacy = []
for (const route of routes) {
  const response = await fetch(`${BASE}${route}`)
  report.legacy.push({ route, status: response.status })
  assert(response.status === 404, `${route} status ${response.status}`)
}
const api = await fetch(`${BASE}/api/events`)
report.api = { status: api.status, body: await api.json() }
assert(report.api.status === 200, "database api not 200")
assert(report.api.body.events?.length === 1, "database api event count")
assert(report.api.body.events[0].timestamp === "2026-10-07T14:50:34.604Z", "api timestamp moved")

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: true, steps: report.walks.map((walk) => walk.steps.map((step) => step.step)) }, null, 2))
