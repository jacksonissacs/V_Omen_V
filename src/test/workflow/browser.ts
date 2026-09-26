import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import puppeteer, { type Browser, type Page } from "puppeteer-core"

import { ARTIFACTS, artifactDir } from "@/test/workflow/harness"

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter((value): value is string => Boolean(value))

export function chromePath(): string {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      "BLOCKED: Chrome is not installed, so browser workflow tests cannot run. Set CHROME_PATH or install google-chrome.",
    )
  }
  return found
}

export async function launchWorkflowBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  })
}

export async function saveFailureTrace(page: Page, name: string): Promise<void> {
  const dir = path.join(artifactDir(), "failures")
  mkdirSync(dir, { recursive: true })
  const safe = name.replace(/[^\w.-]+/g, "_")
  const png = path.join(dir, `${safe}.png`) as `${string}.png`
  await page.screenshot({ path: png, fullPage: true })
  const html = await page.content()
  const { writeFileSync } = await import("node:fs")
  writeFileSync(path.join(dir, `${safe}.html`), html)
}

export async function saveScreenshot(page: Page, name: string): Promise<string> {
  const dir = path.join(ARTIFACTS, "screenshots")
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.png`) as `${string}.png`
  await page.screenshot({ path: file, fullPage: true })
  return file
}

export async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
}

/** Pulse/Events/Watchlists stream a loading shell before repository HTML arrives. */
export async function waitForWorkspaceReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return (
        text.length > 0 &&
        !text.includes("Loading the book") &&
        !text.includes("Reading events from the workspace repository")
      )
    },
    { timeout: 20_000 },
  )
}
