import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"

const require = createRequire("/tmp/omen-004-baseline/package.json")
const puppeteer = require("puppeteer-core")

const OUT = "/tmp/omen-004-evidence-staging/browser"
mkdirSync(OUT, { recursive: true })

const SEEDED = [
  "evt-boc-cut",
  "Bank of Canada cuts rates in October",
  "Extra-territorial GPU license expansion",
  "Frontier model released before December 1",
  "USD/CAD",
  "BoC Oct cut",
]

const SERVERS = {
  empty: "http://127.0.0.1:3210",
  demoProduction: "http://127.0.0.1:3212",
  unset: "http://127.0.0.1:3214",
}

const desktop = { width: 1440, height: 900 }
const mobile = { width: 390, height: 844, isMobile: true, hasTouch: true }

async function snap(page, url, file, viewport) {
  await page.setViewport(viewport)
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForSelector("body", { timeout: 15000 })
  await new Promise((resolve) => setTimeout(resolve, 400))
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true })
  const observed = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".aion-chip")].map((node) => ({
      text: node.innerText.replace(/\s+/g, " ").trim(),
      display: getComputedStyle(node).display,
    }))
    return {
      title: document.title,
      h1: document.querySelector("h1")?.innerText?.trim() ?? "",
      text: document.body.innerText,
      chips,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      eventHrefs: [...document.querySelectorAll("a")]
        .map((node) => node.getAttribute("href"))
        .filter((href) => href && href.startsWith("/events/")),
    }
  })
  return {
    requested: url,
    finalUrl: page.url(),
    httpStatus: response?.status() ?? null,
    file,
    viewport,
    ...observed,
  }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})

const report = { shots: [] }
try {
  const page = await browser.newPage()

  report.shots.push(await snap(page, `${SERVERS.empty}/`, "proof-01-marketing-1440.png", desktop))
  const cta = await page.$("a.btn-primary")
  if (!cta) throw new Error("Marketing primary CTA missing")
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    cta.click(),
  ])
  await new Promise((resolve) => setTimeout(resolve, 400))
  await page.screenshot({ path: `${OUT}/proof-02-after-cta-pulse-1440.png`, fullPage: true })
  const afterCta = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.innerText?.trim() ?? "",
    text: document.body.innerText,
    chips: [...document.querySelectorAll(".aion-chip")].map((node) => ({
      text: node.innerText.replace(/\s+/g, " ").trim(),
      display: getComputedStyle(node).display,
    })),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    eventHrefs: [...document.querySelectorAll("a")]
      .map((node) => node.getAttribute("href"))
      .filter((href) => href && href.startsWith("/events/")),
  }))
  report.shots.push({
    requested: "click a.btn-primary from /",
    finalUrl: page.url(),
    file: "proof-02-after-cta-pulse-1440.png",
    viewport: desktop,
    ...afterCta,
  })

  report.shots.push(await snap(page, `${SERVERS.empty}/pulse`, "discover-pulse-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.empty}/pulse`, "discover-pulse-390.png", mobile))
  report.shots.push(await snap(page, `${SERVERS.empty}/events`, "discover-explore-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.empty}/events`, "discover-explore-390.png", mobile))
  report.shots.push(await snap(page, `${SERVERS.empty}/watchlists`, "return-following-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.empty}/archive`, "return-archive-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.demoProduction}/pulse`, "quarantine-pulse-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.demoProduction}/markets`, "quarantine-markets-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.demoProduction}/agents`, "quarantine-agents-1440.png", desktop))
  report.shots.push(await snap(page, `${SERVERS.unset}/pulse`, "unset-mode-pulse-1440.png", desktop))
} finally {
  await browser.close()
}

for (const shot of report.shots) {
  const hits = SEEDED.filter((needle) => shot.text?.includes(needle))
  shot.seededHits = hits
  shot.textLength = shot.text?.length ?? 0
  shot.textExcerpt = (shot.text ?? "").slice(0, 1800)
  delete shot.text
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report.shots.map((shot) => ({
  file: shot.file,
  finalUrl: shot.finalUrl,
  httpStatus: shot.httpStatus,
  h1: shot.h1,
  chips: shot.chips,
  eventHrefs: shot.eventHrefs,
  seededHits: shot.seededHits,
  overflow: shot.overflow,
})), null, 2))
