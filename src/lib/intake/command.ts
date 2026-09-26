import { INTAKE_LIMITS } from "./source"
import { defaultMatchesPath, defaultQueueDir } from "./refresh"

export type IntakeArgv =
  | { command: "refresh"; limit: number; queueDir: string; matchesPath: string }
  | { command: "list"; state?: "pending" | "selected" | "rejected"; queueDir: string }
  | { command: "show"; itemId: string; queueDir: string }
  | { command: "select"; itemId: string; eventId?: string; queueDir: string }
  | { command: "reject"; itemId: string; queueDir: string }
  | { command: "check" }

export class IntakeUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IntakeUsageError"
  }
}

export const INTAKE_USAGE = `Usage: omen-intake <refresh|list|show|select|reject|check>
  refresh [--limit <1-${INTAKE_LIMITS.maxItemLimit}>] [--queue <dir>] [--matches <file>]
  list [--state pending|selected|rejected] [--queue <dir>]
  show --item <id> [--queue <dir>]
  select --item <id> [--event <event-id>] [--queue <dir>]
  reject --item <id> [--queue <dir>]
  check

There is no URL option. The source is the built-in allowlist.`

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) throw new IntakeUsageError(`${name} needs a value.`)
  return value
}

function rejectUnknown(argv: string[], allowed: readonly string[]): void {
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!
    if (!token.startsWith("--")) {
      throw new IntakeUsageError("This command does not accept a source URL or extra arguments.")
    }
    if (!allowed.includes(token)) throw new IntakeUsageError(`Unknown option ${token}. ${INTAKE_USAGE}`)
    index += 1
  }
}

export function parseIntakeArgv(argv: string[]): IntakeArgv {
  const [command, ...rest] = argv
  if (!command || command === "--help" || command === "-h") throw new IntakeUsageError(INTAKE_USAGE)
  if (rest.includes("--url") || rest.includes("--uri")) {
    throw new IntakeUsageError("This command does not accept a source URL.")
  }
  const queueDir = flag(rest, "--queue") ?? defaultQueueDir()
  if (command === "refresh") {
    rejectUnknown(rest, ["--limit", "--queue", "--matches"])
    const rawLimit = flag(rest, "--limit")
    const limit = rawLimit === undefined ? INTAKE_LIMITS.defaultItemLimit : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > INTAKE_LIMITS.maxItemLimit) {
      throw new IntakeUsageError(`--limit must be an integer from 1 to ${INTAKE_LIMITS.maxItemLimit}.`)
    }
    return { command, limit, queueDir, matchesPath: flag(rest, "--matches") ?? defaultMatchesPath() }
  }
  if (command === "list") {
    rejectUnknown(rest, ["--state", "--queue"])
    const state = flag(rest, "--state")
    if (state !== undefined && state !== "pending" && state !== "selected" && state !== "rejected") {
      throw new IntakeUsageError("--state must be pending, selected, or rejected.")
    }
    return { command, queueDir, ...(state ? { state } : {}) }
  }
  if (command === "show" || command === "reject") {
    rejectUnknown(rest, ["--item", "--queue"])
    const itemId = flag(rest, "--item")
    if (!itemId) throw new IntakeUsageError(`${command} needs --item <id>.`)
    return { command, itemId, queueDir }
  }
  if (command === "select") {
    rejectUnknown(rest, ["--item", "--event", "--queue"])
    const itemId = flag(rest, "--item")
    if (!itemId) throw new IntakeUsageError("select needs --item <id>.")
    const eventId = flag(rest, "--event")
    return { command, itemId, queueDir, ...(eventId ? { eventId } : {}) }
  }
  if (command === "check") {
    rejectUnknown(rest, [])
    return { command }
  }
  throw new IntakeUsageError(INTAKE_USAGE)
}
