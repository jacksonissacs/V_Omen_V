import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire("/tmp/omen-oct08-integrated/package.json")
const puppeteer = require("puppeteer-core")
const OUT = "/tmp/omen-oct08-proof/browser"
mkdirSync(OUT, { recursive: true })
const names = ["Polymarket gamma API", "Polymarket", "Google blog"]

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await page.goto("http://127.0.0.1:3310/events/evt-gemini-4-public-2026-10-31", { waitUntil: "domcontentloaded" })
await page.waitForSelector("#event-evidence")
await page.click("[data-testid='event-actions'] button")
for (const name of names) {
  const found = await page.evaluate((sourceName) => {
    const item = [...document.querySelectorAll("[data-testid='evidence-item']")].find((node) => {
      const title = node.querySelector(".aion-inspector-section")?.textContent?.replace(/\s+/g, " ").trim()
      return title === sourceName
    })
    if (!item) return false
    item.scrollIntoView({ block: "start" })
    return true
  }, name)
  if (!found) throw new Error(`missing ${name}`)
  await new Promise((resolve) => setTimeout(resolve, 250))
  const visible = await page.evaluate(() => {
    const viewBottom = window.innerHeight
    const parts = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const parent = node.parentElement
      const value = node.textContent?.replace(/\s+/g, " ").trim()
      if (!parent || !value) {
        node = walker.nextNode()
        continue
      }
      const rect = parent.getBoundingClientRect()
      if (rect.bottom > 1 && rect.top < viewBottom - 1) parts.push(value)
      node = walker.nextNode()
    }
    return parts.join("\n")
  })
  const file = `phone-source-${name.toLowerCase().replace(/\s+/g, "-")}.png`
  await page.screenshot({ path: path.join(OUT, file) })
  const needles = ["Sourced", name, "Not recorded", name === "Google blog" ? "30 Sept" : "Not stated by source"]
  for (const needle of needles) {
    if (!visible.includes(needle)) throw new Error(`${file} missing ${needle}`)
  }
  console.log("ok", file)
}
await browser.close()
