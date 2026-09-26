import { createHash } from "node:crypto"

import { CISA_KEV, INTAKE_LIMITS, isCveId, kevItemUrl } from "./source"
import { sanitizeUntrustedText } from "./text"
import type { CapturedDraft, MalformedEntry } from "./types"

export class MalformedCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MalformedCatalogError"
  }
}

export interface ParsedCatalog {
  catalogVersion: string | null
  entries: CapturedDraft[]
  malformedEntries: MalformedEntry[]
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

/** A calendar date the source stated. Invalid text is rejected; a missing value stays unknown. */
export function calendarDate(value: string): string | null {
  const match = CALENDAR_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return value
}

function contentIdentity(fields: {
  sourceItemId: string
  canonicalUrl: string
  title: string
  description: string
  sourcePublishedDate: string | null
  vendorProject: string
  product: string
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        CISA_KEV.id,
        fields.sourceItemId,
        fields.canonicalUrl,
        fields.title,
        fields.description,
        fields.sourcePublishedDate,
        fields.vendorProject,
        fields.product,
      ]),
    )
    .digest("hex")
}

function draftFromEntry(record: Record<string, unknown>): CapturedDraft | MalformedEntry {
  const cveId = stringField(record, "cveID")?.trim() ?? ""
  if (!isCveId(cveId)) {
    return { sourceItemId: cveId || null, message: "Catalog entry has no CVE id." }
  }
  const title = sanitizeUntrustedText(stringField(record, "vulnerabilityName") ?? "", INTAKE_LIMITS.titleChars)
  const description = sanitizeUntrustedText(stringField(record, "shortDescription") ?? "", INTAKE_LIMITS.descriptionChars)
  const vendorProject = sanitizeUntrustedText(stringField(record, "vendorProject") ?? "", INTAKE_LIMITS.partyChars)
  const product = sanitizeUntrustedText(stringField(record, "product") ?? "", INTAKE_LIMITS.partyChars)
  if (!title || !description || !vendorProject || !product) {
    return { sourceItemId: cveId, message: `Catalog entry ${cveId} is missing a title, description, vendor, or product.` }
  }
  const rawDate = record.dateAdded
  let sourcePublishedDate: string | null = null
  if (typeof rawDate === "string" && rawDate.trim() !== "") {
    sourcePublishedDate = calendarDate(rawDate.trim())
    if (!sourcePublishedDate) {
      return { sourceItemId: cveId, message: `Catalog entry ${cveId} has a dateAdded value that is not a calendar date.` }
    }
  } else if (rawDate !== undefined && rawDate !== null && typeof rawDate !== "string") {
    return { sourceItemId: cveId, message: `Catalog entry ${cveId} has a dateAdded value that is not a calendar date.` }
  }
  const canonicalUrl = kevItemUrl(cveId)
  const excerpt = description.slice(0, INTAKE_LIMITS.excerptChars)
  return {
    sourceId: CISA_KEV.id,
    sourceItemId: cveId,
    canonicalUrl,
    title,
    excerpt,
    description,
    sourcePublishedAt: null,
    sourcePublishedDate,
    vendorProject,
    product,
    contentIdentity: contentIdentity({
      sourceItemId: cveId,
      canonicalUrl,
      title,
      description,
      sourcePublishedDate,
      vendorProject,
      product,
    }),
  }
}

/** Newer stated dates first. Equal dates keep the catalog's own order. Undated entries sort last. */
export function compareByStatedDate(
  left: { sourcePublishedDate: string | null },
  right: { sourcePublishedDate: string | null },
): number {
  if (left.sourcePublishedDate === right.sourcePublishedDate) return 0
  if (left.sourcePublishedDate === null) return 1
  if (right.sourcePublishedDate === null) return -1
  return left.sourcePublishedDate < right.sourcePublishedDate ? 1 : -1
}

function isDraft(value: CapturedDraft | MalformedEntry): value is CapturedDraft {
  return "contentIdentity" in value
}

/**
 * Parse the CISA KEV catalog document.
 * `dateReleased` on the catalog is not copied onto entries: each entry's
 * publication time stays unknown unless that entry states a clock time.
 * This feed states `dateAdded` as a calendar date, so `sourcePublishedAt` is null.
 * `notes` and any URLs inside them are ignored.
 */
export function parseKevCatalog(body: string): ParsedCatalog {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new MalformedCatalogError("CISA KEV document was not JSON.")
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.vulnerabilities)) {
    throw new MalformedCatalogError("CISA KEV document was not a catalog object.")
  }
  const catalogVersion = typeof parsed.catalogVersion === "string" ? parsed.catalogVersion : null
  const entries: CapturedDraft[] = []
  const malformedEntries: MalformedEntry[] = []
  const seen = new Set<string>()
  for (const item of parsed.vulnerabilities) {
    if (!isRecord(item)) {
      malformedEntries.push({ sourceItemId: null, message: "Catalog entry was not an object." })
      continue
    }
    const result = draftFromEntry(item)
    if (!isDraft(result)) {
      malformedEntries.push(result)
      continue
    }
    if (seen.has(result.sourceItemId)) {
      malformedEntries.push({ sourceItemId: result.sourceItemId, message: `Catalog entry ${result.sourceItemId} is repeated.` })
      continue
    }
    seen.add(result.sourceItemId)
    entries.push(result)
  }
  return { catalogVersion, entries, malformedEntries }
}
