import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { productionMarker } from "@/lib/db/config"

import { matchDraft } from "./match"
import { CISA_KEV } from "./source"
import type { CapturedDraft, IntakeQueue, IntakeVersion, MatchRule } from "./types"

export class IntakeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IntakeError"
  }
}

type Env = Record<string, string | undefined>

const REVIEW_STATES = new Set(["pending", "selected", "rejected"])
const ASSOCIATIONS = new Set(["none", "configured", "operator"])

export function assertIntakeWritable(env: Env = process.env): void {
  const marker = productionMarker(env)
  if (marker) throw new IntakeError(`Refusing to write the intake queue: ${marker}=production.`)
}

export function emptyQueue(): IntakeQueue {
  return { schema: 1, sourceId: CISA_KEV.id, lastRequestAt: null, versions: [] }
}

function isVersion(value: unknown): value is IntakeVersion {
  if (typeof value !== "object" || value === null) return false
  const record = value as IntakeVersion
  return (
    typeof record.id === "string" &&
    record.sourceId === CISA_KEV.id &&
    typeof record.sourceItemId === "string" &&
    Number.isInteger(record.version) &&
    typeof record.canonicalUrl === "string" &&
    typeof record.title === "string" &&
    typeof record.excerpt === "string" &&
    (record.sourcePublishedAt === null || typeof record.sourcePublishedAt === "string") &&
    (record.sourcePublishedDate === null || typeof record.sourcePublishedDate === "string") &&
    typeof record.firstFetchedAt === "string" &&
    typeof record.contentIdentity === "string" &&
    typeof record.vendorProject === "string" &&
    typeof record.product === "string" &&
    (record.candidateEventId === null || typeof record.candidateEventId === "string") &&
    ASSOCIATIONS.has(record.association) &&
    REVIEW_STATES.has(record.reviewState) &&
    (record.priorVersionId === null || typeof record.priorVersionId === "string")
  )
}

export function parseQueue(input: unknown): IntakeQueue {
  if (typeof input !== "object" || input === null) throw new IntakeError("Intake queue file is damaged.")
  const record = input as IntakeQueue
  if (record.schema !== 1 || record.sourceId !== CISA_KEV.id || !Array.isArray(record.versions) || !record.versions.every(isVersion)) {
    throw new IntakeError("Intake queue file is damaged.")
  }
  if (record.lastRequestAt !== null && typeof record.lastRequestAt !== "string") {
    throw new IntakeError("Intake queue file is damaged.")
  }
  return record
}

export function queuePath(dir: string): string {
  return path.join(dir, "queue.json")
}

export async function readQueue(dir: string): Promise<IntakeQueue> {
  try {
    const raw = await readFile(queuePath(dir), "utf8")
    return parseQueue(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyQueue()
    if (error instanceof IntakeError || error instanceof SyntaxError) {
      throw new IntakeError("Intake queue file is damaged. It was not replaced.")
    }
    throw error
  }
}

export async function writeQueue(dir: string, queue: IntakeQueue): Promise<void> {
  await mkdir(dir, { recursive: true })
  const file = queuePath(dir)
  const temporary = `${file}.tmp`
  await writeFile(temporary, `${JSON.stringify(queue, null, 2)}\n`)
  await rename(temporary, file)
}

export interface CaptureApply {
  versions: IntakeVersion[]
  staged: IntakeVersion[]
  duplicates: string[]
  changed: { id: string; priorVersionId: string; sourceItemId: string }[]
  undated: string[]
  ambiguous: string[]
}

function versionId(sourceItemId: string, version: number): string {
  return `${CISA_KEV.id}-${sourceItemId.toLowerCase()}-v${version}`
}

/**
 * Append captures. Existing version objects are returned unchanged.
 * A matching content identity is a duplicate. A new identity keeps the prior version.
 */
export function applyCapture(
  existing: readonly IntakeVersion[],
  drafts: readonly CapturedDraft[],
  now: string,
  rules: readonly MatchRule[],
): CaptureApply {
  let versions = [...existing]
  const staged: IntakeVersion[] = []
  const duplicates: string[] = []
  const changed: CaptureApply["changed"] = []
  const undated: string[] = []
  const ambiguous: string[] = []

  for (const draft of drafts) {
    const prior = versions.filter((version) => version.sourceItemId === draft.sourceItemId)
    if (prior.some((version) => version.contentIdentity === draft.contentIdentity)) {
      duplicates.push(draft.sourceItemId)
      continue
    }
    const latest = prior.reduce<IntakeVersion | undefined>((best, version) => {
      if (!best || version.version > best.version) return version
      return best
    }, undefined)
    const versionNumber = latest ? latest.version + 1 : 1
    const matched = matchDraft(draft, rules)
    const created: IntakeVersion = {
      id: versionId(draft.sourceItemId, versionNumber),
      sourceId: draft.sourceId,
      sourceItemId: draft.sourceItemId,
      version: versionNumber,
      canonicalUrl: draft.canonicalUrl,
      title: draft.title,
      excerpt: draft.excerpt,
      sourcePublishedAt: null,
      sourcePublishedDate: draft.sourcePublishedDate,
      firstFetchedAt: now,
      contentIdentity: draft.contentIdentity,
      vendorProject: draft.vendorProject,
      product: draft.product,
      candidateEventId: matched.status === "matched" ? matched.eventId : null,
      association: matched.status === "matched" ? "configured" : "none",
      reviewState: "pending",
      priorVersionId: latest?.id ?? null,
    }
    if (matched.status === "ambiguous") ambiguous.push(created.id)
    if (created.sourcePublishedDate === null) undated.push(created.id)
    if (latest) changed.push({ id: created.id, priorVersionId: latest.id, sourceItemId: draft.sourceItemId })
    versions = [...versions, created]
    staged.push(created)
  }

  return { versions, staged, duplicates, changed, undated, ambiguous }
}

export function selectVersion(versions: readonly IntakeVersion[], itemId: string, eventId: string | undefined): IntakeVersion[] {
  const current = versions.find((version) => version.id === itemId)
  if (!current) throw new IntakeError(`Queue item ${itemId} is not in the review queue.`)
  const resolved = eventId ?? current.candidateEventId
  if (!resolved) throw new IntakeError(`Queue item ${itemId} has no candidate event. Pass --event. Intake will not create one.`)
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(resolved)) {
    throw new IntakeError(`Event id ${resolved} is not a valid OMEN event id.`)
  }
  return versions.map((version) => {
    if (version.id !== itemId) return version
    return {
      ...version,
      candidateEventId: resolved,
      association: eventId !== undefined || current.association === "none" ? "operator" : current.association,
      reviewState: "selected" as const,
    }
  })
}

export function rejectVersion(versions: readonly IntakeVersion[], itemId: string): IntakeVersion[] {
  const current = versions.find((version) => version.id === itemId)
  if (!current) throw new IntakeError(`Queue item ${itemId} is not in the review queue.`)
  return versions.map((version) => (version.id === itemId ? { ...version, reviewState: "rejected" as const } : version))
}

export async function updateQueue(dir: string, env: Env, update: (queue: IntakeQueue) => IntakeQueue): Promise<IntakeQueue> {
  assertIntakeWritable(env)
  const current = await readQueue(dir)
  const next = update(current)
  await writeQueue(dir, next)
  return next
}
