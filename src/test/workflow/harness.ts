import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import path from "node:path"
import { promisify } from "node:util"

import { Client } from "pg"

import { createMigratedDatabase, type DisposableDatabase } from "@/test/postgres-harness"

const execFileAsync = promisify(execFile)

export const ROOT = path.resolve(__dirname, "../../..")
export const FIXTURES = path.join(ROOT, "db/fixtures/test-workflow")
export const ARTIFACTS = path.join(ROOT, "test-artifacts")

/** main SHA this suite was written against. Runtime records the checked-out head separately. */
export const TESTED_MAIN_SHA = "d044ead2e627169b764ec223723f14af4680a919"

const DECIMAL_ID = /^[1-9]\d{0,18}$/
const TSX = path.join(ROOT, "node_modules/.bin/tsx")
const NEXT = path.join(ROOT, "node_modules/.bin/next")

export interface RunningServer {
  url: string
  port: number
  logs: string[]
  stop(): Promise<void>
}

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export function artifactDir(): string {
  mkdirSync(ARTIFACTS, { recursive: true })
  return ARTIFACTS
}

export function writeArtifact(name: string, contents: string): string {
  const file = path.join(artifactDir(), name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents)
  return file
}

export function requireProductionBuild(): void {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("BLOCKED: production build is missing. Run `npm run build` before `npm run test:workflow`.")
  }
}

export function gitRev(ref: string): string {
  try {
    return execFileSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" }).trim()
  } catch {
    return "unavailable"
  }
}

/** Checkpoint ids on this branch are decimal bigint text, not UUIDs. */
export function parseUpsertCheckpointId(stdout: string): string {
  const match = stdout.match(/checkpoint:\s+id\s+([1-9]\d{0,18})\b/)
  if (!match?.[1] || !DECIMAL_ID.test(match[1])) {
    throw new Error(`Could not parse decimal checkpoint id from upsert output:\n${stdout}`)
  }
  return match[1]
}

export function parseOperatorCheckpointId(stdout: string): string {
  const start = stdout.indexOf("{")
  const end = stdout.lastIndexOf("}")
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(stdout.slice(start, end + 1)) as {
      summary?: { checkpoint?: { id?: string } }
      operation?: { checkpointId?: string | null }
    }
    const id = parsed.summary?.checkpoint?.id ?? parsed.operation?.checkpointId ?? ""
    if (DECIMAL_ID.test(id)) return id
  }
  throw new Error(`Could not parse decimal checkpoint id from operator output:\n${stdout}`)
}

async function runTsx(args: string[], databaseUrl: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, args, {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "development", DATABASE_URL: databaseUrl },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message: string }
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    }
  }
}

export async function upsert(databaseUrl: string, file: string): Promise<CommandResult> {
  const result = await runTsx(["scripts/omen-db.ts", "upsert", "--file", file], databaseUrl)
  if (result.code !== 0) {
    throw new Error(
      `omen-db upsert failed for ${path.basename(file)}: ${result.stderr || result.stdout || "unknown failure"}`,
    )
  }
  return result
}

export async function upsertExit(databaseUrl: string, file: string): Promise<CommandResult> {
  return runTsx(["scripts/omen-db.ts", "upsert", "--file", file], databaseUrl)
}

export async function operator(databaseUrl: string, args: string[]): Promise<CommandResult> {
  return runTsx(["scripts/omen-operator.ts", ...args], databaseUrl)
}

export async function queryRows<T extends Record<string, unknown>>(
  databaseUrl: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl, application_name: "omen-workflow" })
  await client.connect()
  try {
    const result = await client.query<T>(sql, params)
    return result.rows
  } finally {
    await client.end()
  }
}

export async function queryCount(databaseUrl: string, sql: string, params: unknown[] = []): Promise<number> {
  const rows = await queryRows<{ count: number }>(databaseUrl, sql, params)
  return rows[0]?.count ?? 0
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a port")))
        return
      }
      const port = address.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
    server.on("error", reject)
  })
}

export async function startProductionServer(env: Record<string, string>): Promise<RunningServer> {
  requireProductionBuild()
  const port = await freePort()
  const child: ChildProcess = spawn(NEXT, ["start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const logs: string[] = []
  child.stdout?.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr?.on("data", (chunk) => logs.push(String(chunk)))
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 60_000
  let lastError = ""
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited ${child.exitCode} before becoming ready:\n${logs.join("")}`)
    }
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status > 0) {
        return {
          url,
          port,
          logs,
          stop: async () => {
            child.kill("SIGTERM")
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                child.kill("SIGKILL")
                resolve()
              }, 5_000)
              child.once("exit", () => {
                clearTimeout(timer)
                resolve()
              })
            })
          },
        }
      }
    } catch (error) {
      lastError = (error as Error).message
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  child.kill("SIGKILL")
  throw new Error(`next start did not become ready on ${url}: ${lastError}\n${logs.join("")}`)
}

export async function createWorkflowDatabase(): Promise<DisposableDatabase> {
  return createMigratedDatabase()
}

export async function fetchJson(
  server: RunningServer,
  pathname: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(pathname, server.url), { cache: "no-store" })
  const body = (await response.json()) as Record<string, unknown>
  return { status: response.status, body }
}

export async function fetchText(server: RunningServer, pathname: string): Promise<{ status: number; text: string }> {
  const response = await fetch(new URL(pathname, server.url), { cache: "no-store" })
  return { status: response.status, text: await response.text() }
}

export function visibleHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
}
