import { existsSync, mkdirSync, writeFileSync } from "node:fs"
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

export function attachBrowserDiagnostics(page: Page): void {
  const consoleErrors: string[] = []
  const pending = new Map<string, string>()
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("request", (request) => {
    if (request.url().startsWith("http")) pending.set(request.url(), request.resourceType())
  })
  page.on("requestfinished", (request) => pending.delete(request.url()))
  page.on("requestfailed", (request) => pending.delete(request.url()))
  ;(page as Page & { __omenDiagnostics?: { consoleErrors: string[]; pending: Map<string, string> } }).__omenDiagnostics =
    { consoleErrors, pending }
}

export async function saveFailureTrace(page: Page, name: string): Promise<void> {
  const dir = path.join(artifactDir(), "failures")
  mkdirSync(dir, { recursive: true })
  const safe = name.replace(/[^\w.-]+/g, "_")
  const png = path.join(dir, `${safe}.png`) as `${string}.png`
  await page.screenshot({ path: png, fullPage: true })
  const html = await page.content()
  writeFileSync(path.join(dir, `${safe}.html`), html)
  const diagnostics = (page as Page & { __omenDiagnostics?: { consoleErrors: string[]; pending: Map<string, string> } })
    .__omenDiagnostics
  if (diagnostics) {
    writeFileSync(
      path.join(dir, `${safe}.diagnostics.json`),
      JSON.stringify(
        {
          url: page.url(),
          consoleErrors: diagnostics.consoleErrors,
          pendingRequests: [...diagnostics.pending.entries()].map(([url, type]) => ({ url, type })),
        },
        null,
        2,
      ),
    )
  }
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

/** Marketing `/` streams static HTML; Link prefetch can keep network idle from settling. */
export async function waitForMarketingReady(page: Page): Promise<void> {
  await page.waitForSelector("h1#hero-title", { timeout: 20_000 })
  await page.waitForFunction(
    () => document.querySelector("h1#hero-title")?.textContent?.includes("Every probability") ?? false,
    { timeout: 5_000 },
  )
}

export async function gotoMarketingHome(page: Page, baseUrl: string): Promise<void> {
  await page.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" })
  await waitForMarketingReady(page)
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

export async function clickThrough(page: Page, selector: string): Promise<void> {
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(selector)])
}

export async function gotoWorkspacePath(page: Page, baseUrl: string, pathname: string): Promise<void> {
  await page.goto(new URL(pathname, baseUrl).toString(), { waitUntil: "domcontentloaded" })
  await waitForWorkspaceReady(page)
}
