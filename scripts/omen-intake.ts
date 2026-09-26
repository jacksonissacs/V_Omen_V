/**
 * Operator-run source intake. Reads one allowlisted catalog into a local
 * review queue. It does not publish evidence, assign a probability, or
 * accept a source URL.
 *
 *   npm run intake -- refresh
 *   npm run intake -- list
 *   npm run intake -- show --item <id>
 *   npm run intake -- select --item <id> [--event <event-id>]
 *   npm run intake -- reject --item <id>
 *   npm run intake:check
 */
import { existsSync } from "node:fs"
import path from "node:path"

import { INTAKE_USAGE, IntakeUsageError, parseIntakeArgv } from "../src/lib/intake/command"
import { MatchConfigError } from "../src/lib/intake/match"
import { SourceRequestError, getSourceDocument } from "../src/lib/intake/network"
import { compareByStatedDate, MalformedCatalogError, parseKevCatalog } from "../src/lib/intake/parse-kev"
import { IntakeError, readQueue, rejectVersion, selectVersion, updateQueue } from "../src/lib/intake/queue"
import { listVersions, refreshSource } from "../src/lib/intake/refresh"
import type { IntakeVersion } from "../src/lib/intake/types"

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env.local")
  if (existsSync(file)) process.loadEnvFile(file)
}

function publication(version: IntakeVersion): string {
  if (version.sourcePublishedAt) return version.sourcePublishedAt
  if (version.sourcePublishedDate) return `${version.sourcePublishedDate} (time not stated)`
  return "publication time unknown"
}

function printSummary(version: IntakeVersion) {
  const event = version.candidateEventId ? `${version.association}:${version.candidateEventId}` : "no event"
  console.log(
    `${version.id}  ${version.reviewState}  ${publication(version)}  ${event}  ${version.vendorProject} / ${version.product}  ${version.title}`,
  )
}

async function main() {
  let command: ReturnType<typeof parseIntakeArgv>
  try {
    command = parseIntakeArgv(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof IntakeUsageError ? error.message : INTAKE_USAGE)
    process.exitCode = 2
    return
  }
  loadLocalEnv()

  if (command.command === "check") {
    const document = await getSourceDocument()
    const parsed = parseKevCatalog(document.body)
    const newest = [...parsed.entries].sort(compareByStatedDate)[0]
    console.log("CISA KEV feed reachable")
    console.log(`catalogVersion: ${parsed.catalogVersion ?? "unknown"}`)
    console.log(`entries: ${parsed.entries.length}`)
    console.log(`malformed entries: ${parsed.malformedEntries.length}`)
    if (newest) {
      const when = newest.sourcePublishedDate ? `${newest.sourcePublishedDate} (time not stated)` : "publication time unknown"
      console.log(`newest: ${newest.sourceItemId}  ${when}  ${newest.title}`)
    }
    console.log("Reuse of the catalog is CC0 1.0. Third-party note URLs were not requested.")
    console.log("Did not write the review queue.")
    return
  }

  if (command.command === "refresh") {
    const report = await refreshSource({
      queueDir: command.queueDir,
      matchesPath: command.matchesPath,
      limit: command.limit,
    })
    if (!report.ok) {
      console.error(`Intake failed (${report.failure?.kind ?? "unavailable"}): ${report.failure?.message ?? "Unknown failure."}`)
      process.exitCode = 1
      return
    }
    console.log(`Source ${report.sourceId}`)
    console.log(`Catalog ${report.sourceCatalogVersion ?? "unknown"}`)
    console.log(
      `Staged ${report.staged.length}, duplicates ${report.duplicates.length}, changed ${report.changed.length}, undated ${report.undated.length}`,
    )
    if (report.truncated) console.log(`Window kept ${report.windowSize} newest entries; older catalog entries were not staged.`)
    if (report.malformedEntries.length > 0) console.log(`Malformed entries skipped: ${report.malformedEntries.length}`)
    if (report.ambiguous.length > 0) console.log(`Ambiguous matches left unassociated: ${report.ambiguous.length}`)
    for (const version of report.staged) printSummary(version)
    console.log("Staged items are unpublished. No probability was assigned.")
    return
  }

  if (command.command === "list") {
    const queue = await readQueue(command.queueDir)
    const versions = listVersions(queue.versions, command.state)
    if (versions.length === 0) {
      console.log("Review queue is empty.")
      return
    }
    for (const version of versions) printSummary(version)
    return
  }

  if (command.command === "show") {
    const queue = await readQueue(command.queueDir)
    const version = queue.versions.find((item) => item.id === command.itemId)
    if (!version) throw new IntakeError(`Queue item ${command.itemId} is not in the review queue.`)
    console.log(JSON.stringify(version, null, 2))
    console.log("Unpublished queue item. No probability was assigned and no evidence was written.")
    return
  }

  if (command.command === "select") {
    const next = await updateQueue(command.queueDir, process.env, (queue) => ({
      ...queue,
      versions: selectVersion(queue.versions, command.itemId, command.eventId),
    }))
    const version = next.versions.find((item) => item.id === command.itemId)
    console.log(
      `Selected ${command.itemId} for event ${version?.candidateEventId ?? command.eventId}. It stays in the review queue. No probability was assigned and no evidence was published.`,
    )
    return
  }

  const next = await updateQueue(command.queueDir, process.env, (queue) => ({
    ...queue,
    versions: rejectVersion(queue.versions, command.itemId),
  }))
  const version = next.versions.find((item) => item.id === command.itemId)
  console.log(`Rejected ${version?.id ?? command.itemId}. The captured text was kept and nothing was published.`)
}

main().catch((error: unknown) => {
  const known = error instanceof IntakeError || error instanceof IntakeUsageError || error instanceof MatchConfigError || error instanceof MalformedCatalogError || error instanceof SourceRequestError
  console.error(known ? error.message : `omen-intake failed: ${(error as Error).message}`)
  process.exitCode = 1
})
