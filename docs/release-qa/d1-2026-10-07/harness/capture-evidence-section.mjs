/**
 * Evidence-section capture for the D1 production book.
 *
 * Requires the production server already running:
 *   NODE_ENV=production OMEN_STORAGE_MODE=database next start -H 127.0.0.1 -p 3210
 * from clean tested code SHA 79596c41232b092dbf5640979039d14f49a0d83c.
 *
 *   CHROME_PATH=/usr/bin/chromium node docs/release-qa/d1-2026-10-07/harness/capture-evidence-section.mjs
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../package.json"))
const puppeteer = require("puppeteer-core")

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "browser", "evidence-section")
mkdirSync(OUT, { recursive: true })

const BASE = process.env.OMEN_PROOF_BASE ?? "http://127.0.0.1:3210"
const EVENT_PATH = "/events/evt-gemini-4-public-2026-10-31"
const PAGE_URL = `${BASE}${EVENT_PATH}`
const SOURCE_URLS = [
  "https://gamma-api.polymarket.com/events?slug=gemini-4pt0-released-by-june-30-2026",
  "https://polymarket.com/event/gemini-4pt0-released-by-june-30-2026",
  "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/",
]
const SOURCE_NAMES = ["Polymarket gamma API", "Google blog", "Polymarket"]

const mobile = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
const desktop = { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function evidenceState(page) {
  return page.evaluate(() => {
    const viewTop = 0
    const viewBottom = window.innerHeight
    const overlaps = (rect) => rect.bottom > viewTop + 1 && rect.top < viewBottom - 1
    const items = [...document.querySelectorAll("[data-testid='evidence-item']")].map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        name: node.querySelector(".aion-inspector-section")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        text: node.innerText.replace(/\s+/g, " ").trim(),
        hrefs: [...node.querySelectorAll("a")].map((anchor) => anchor.href),
        top: rect.top,
        bottom: rect.bottom,
        visible: overlaps(rect),
      }
    })
    const parts = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode()
    while (textNode) {
      const parent = textNode.parentElement
      const value = textNode.textContent?.replace(/\s+/g, " ").trim()
      if (parent && value && overlaps(parent.getBoundingClientRect())) parts.push(value)
      textNode = walker.nextNode()
    }
    const visibleText = parts.join("\n")
    return {
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      items,
      visibleText,
      header: document.body.innerText.includes("Sourced data"),
    }
  })
}

async function scrollEvidenceToTop(page) {
  await page.evaluate(() => {
    const target = document.querySelector("#event-evidence")
    if (!target) throw new Error("evidence section missing")
    target.scrollIntoView({ block: "start", inline: "nearest" })
  })
  await new Promise((resolve) => setTimeout(resolve, 250))
}

async function scrollItem(page, name) {
  const found = await page.evaluate((sourceName) => {
    const item = [...document.querySelectorAll("[data-testid='evidence-item']")].find((node) => {
      const name = node.querySelector(".aion-inspector-section")?.textContent?.replace(/\s+/g, " ").trim()
      return name === sourceName
    })
    if (!item) return false
    item.scrollIntoView({ block: "start", inline: "nearest" })
    return true
  }, name)
  assert(found, `evidence item ${name} was not in the document`)
  await new Promise((resolve) => setTimeout(resolve, 250))
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})

const report = { pageUrl: PAGE_URL, sourceUrls: SOURCE_URLS, shots: [] }
try {
  const page = await browser.newPage()
  await page.setViewport(mobile)
  const response = await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  assert(response?.ok(), `event page status ${response?.status()}`)
  await page.waitForSelector("#event-evidence", { timeout: 15000 })
  await page.click("button.aion-button[data-primary='true']")
  await scrollEvidenceToTop(page)

  const documentEvidence = await page.evaluate(() => {
    const root = document.querySelector("#event-evidence")
    return {
      text: root?.innerText ?? "",
      hrefs: [...(root?.querySelectorAll("a") ?? [])].map((anchor) => anchor.href),
      names: [...document.querySelectorAll("[data-testid='evidence-item'] .aion-inspector-section")].map((node) =>
        node.textContent.replace(/\s+/g, " ").trim(),
      ),
    }
  })
  assert(documentEvidence.names.includes("Polymarket gamma API"), "gamma source name missing")
  assert(documentEvidence.names.includes("Google blog"), "Google source name missing")
  assert(documentEvidence.names.includes("Polymarket"), "Polymarket page source name missing")
  for (const url of SOURCE_URLS) {
    assert(documentEvidence.hrefs.includes(url), `missing source link ${url}`)
  }
  assert(documentEvidence.text.includes("Not recorded"), "reliability is not shown as Not recorded")
  assert(documentEvidence.text.includes("Not stated by source"), "unknown publication time is not shown")

  for (const name of SOURCE_NAMES) {
    await scrollItem(page, name)
    const state = await evidenceState(page)
    const file = `evidence-390-${name.toLowerCase().replace(/\s+/g, "-")}.png`
    await page.screenshot({ path: path.join(OUT, file) })
    const item = state.items.find((entry) => entry.name === name)
    assert(item?.visible, `${name} is not inside the 390 viewport after scroll`)
    const visibleNeedles = ["Sourced", name, "Not recorded"]
    if (name === "Google blog") visibleNeedles.push("30 Sept")
    else visibleNeedles.push("Not stated by source")
    for (const needle of visibleNeedles) {
      assert(state.visibleText.includes(needle), `390 viewport for ${name} does not show ${needle}`)
    }
    report.shots.push({
      file,
      url: state.url,
      viewport: state.viewport,
      scrolledTo: name,
      visibleNames: state.items.filter((entry) => entry.visible).map((entry) => entry.name),
      visibleAssertions: visibleNeedles,
      hrefs: item.hrefs,
    })
  }

  await scrollEvidenceToTop(page)
  const panel = await page.$("#event-evidence")
  assert(panel, "evidence root missing for element capture")
  await panel.screenshot({ path: path.join(OUT, "evidence-390-panel.png") })
  report.shots.push({
    file: "evidence-390-panel.png",
    url: PAGE_URL,
    viewport: mobile,
    scrolledTo: "element screenshot of #event-evidence",
    names: documentEvidence.names,
    hrefs: documentEvidence.hrefs,
  })

  await page.click("[role='tab'][aria-selected], .aion-inspector-tabs .aion-tab")
  const recordTab = await page.evaluateHandle(() =>
    [...document.querySelectorAll(".aion-inspector-tabs .aion-tab")].find((node) => node.textContent.trim() === "Record"),
  )
  const recordElement = recordTab.asElement()
  assert(recordElement, "Record tab missing")
  await recordElement.click()
  await new Promise((resolve) => setTimeout(resolve, 200))
  const recordText = await page.evaluate(() => document.querySelector(".aion-inspector")?.innerText ?? "")
  assert(recordText.includes("Sourced"), "Record tab does not show Sourced provenance")
  await page.screenshot({ path: path.join(OUT, "record-390-sourced.png") })
  report.shots.push({
    file: "record-390-sourced.png",
    url: page.url(),
    viewport: { width: 390, height: 844 },
    scrolledTo: "Record tab",
    visibleProvenance: "Sourced",
  })

  await page.setViewport(desktop)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForSelector("#event-evidence", { timeout: 15000 })
  await scrollEvidenceToTop(page)
  const desktopState = await evidenceState(page)
  await page.screenshot({ path: path.join(OUT, "evidence-1440-viewport.png") })
  const desktopPanel = await page.$("#event-evidence")
  await desktopPanel.screenshot({ path: path.join(OUT, "evidence-1440-panel.png") })
  const desktopVisible = desktopState.items.filter((entry) => entry.visible).map((entry) => entry.name)
  assert(desktopVisible.includes("Polymarket gamma API"), "desktop viewport does not show the gamma source")
  report.shots.push({
    file: "evidence-1440-viewport.png",
    url: desktopState.url,
    viewport: desktopState.viewport,
    visibleNames: desktopVisible,
  })
  report.shots.push({
    file: "evidence-1440-panel.png",
    url: PAGE_URL,
    viewport: desktop,
    scrolledTo: "element screenshot of #event-evidence",
    names: documentEvidence.names,
  })
} finally {
  await browser.close()
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
