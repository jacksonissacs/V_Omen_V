import { EVENT_CATEGORIES, type EventCategory, type EventStatus, type Significance } from "../../types/event"

export type Provenance = "demo" | "sourced"
export type ObservationSourceKind = "provider" | "author"
export type ProbabilityType = "market_implied" | "forecaster_estimate" | "model_estimate"
export type EvidenceStance = "supports" | "contradicts" | "contextual"

/** Presentation-only context. Not part of the durable event contract. */
export interface EventDisplayInput {
  displayTime?: string
  confidence?: "High" | "Medium" | "Low"
  sourceTier?: 1 | 2
  sigma?: number
  duration?: string
  catalystLabel?: string
  catalyst?: string
  catalystTime?: string
  entities?: string[]
  signals?: unknown[]
  relatedMarkets?: unknown[]
  analogues?: unknown[]
  timeline?: unknown[]
  anomaly?: { title: string; body: string; interpretations: string[] }
}

export interface EventRecordInput {
  id: string
  title: string
  question: string
  status: EventStatus
  deadline: string
  resolutionCriteria: string
  category: EventCategory
  significance: Significance
  region: string
  summary: string
  tags: string[]
  relatedEventIds: string[]
  provenance: Provenance
  followedByDefault: boolean
  catalogPosition: number
  display: EventDisplayInput
}

export interface ObservationInput {
  sourceKind: ObservationSourceKind
  sourceName: string
  probabilityType: ProbabilityType
  /** Percentage points, 0–100, at most two decimals. */
  probabilityPct: number
  observedAt: string
  capturedAt?: string
  note?: string
  provenance: Provenance
}

export interface EvidenceInput {
  id: string
  sourceName: string
  sourceUrl?: string
  /** `null` when the source carries no publication date. */
  sourcePublishedAt: string | null
  firstObservedAt: string
  capturedAt?: string
  summary: string
  stance: EvidenceStance
  reliability: number
  recordedBy: string
  provenance: Provenance
}

export interface MoveLogRevisionInput {
  moveLogId: string
  version: number
  publishedAt: string
  author: string
  whatChanged: string
  likelyCause: string
  explainedPct: number
  unexplainedFactors: string[]
  evidenceIds: string[]
  correctionNote?: string
  provenance: Provenance
}

export interface EventBundle {
  eventId: string
  event?: EventRecordInput
  observations: ObservationInput[]
  evidence: EvidenceInput[]
  moveLogRevisions: MoveLogRevisionInput[]
}

export class BundleValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid event bundle:\n- ${issues.join("\n- ")}`)
    this.name = "BundleValidationError"
  }
}

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/
const PROVENANCE = ["demo", "sourced"] as const
const STATUSES = ["watch", "active", "resolved"] as const
const SIGNIFICANCES = ["critical", "high", "medium", "low"] as const
const SOURCE_KINDS = ["provider", "author"] as const
const PROBABILITY_TYPES = ["market_implied", "forecaster_estimate", "model_estimate"] as const
const STANCES = ["supports", "contradicts", "contextual"] as const

type Json = Record<string, unknown>

class Reader {
  constructor(
    private readonly issues: string[],
    private readonly value: Json,
    private readonly path: string,
  ) {}

  private fail(key: string, message: string): undefined {
    this.issues.push(`${this.path}.${key} ${message}`)
    return undefined
  }

  issue(key: string, message: string): void {
    this.fail(key, message)
  }

  has(key: string): boolean {
    return this.value[key] !== undefined
  }

  string(key: string, options: { min?: number; max?: number; optional?: boolean } = {}): string {
    const raw = this.value[key]
    if (raw === undefined && options.optional) return undefined as unknown as string
    if (typeof raw !== "string") return this.fail(key, "must be a string") as never
    const length = raw.trim().length
    if (length < (options.min ?? 1)) return this.fail(key, `must have at least ${options.min ?? 1} characters`) as never
    if (options.max !== undefined && length > options.max) return this.fail(key, `must have at most ${options.max} characters`) as never
    return raw.trim()
  }

  id(key: string): string {
    const value = this.string(key)
    if (value !== undefined && !ID.test(value)) this.fail(key, "must be lowercase letters, digits and hyphens (3–80 chars)")
    return value
  }

  timestamp(key: string, options: { optional?: boolean; nullable?: boolean } = {}): string {
    const raw = this.value[key]
    if (raw === null && options.nullable) return null as unknown as string
    if (raw === undefined && options.optional) return undefined as unknown as string
    if (raw === undefined && options.nullable) return this.fail(key, "is required (use null when unknown)") as never
    if (typeof raw !== "string" || !ISO_TIMESTAMP.test(raw) || Number.isNaN(Date.parse(raw))) {
      return this.fail(key, "must be an ISO-8601 timestamp with a timezone") as never
    }
    return new Date(raw).toISOString()
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const raw = this.value[key]
    if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
      return this.fail(key, `must be one of ${allowed.join(", ")}`) as never
    }
    return raw as T
  }

  number(key: string, options: { min: number; max: number; decimals?: number; integer?: boolean }): number {
    const raw = this.value[key]
    if (typeof raw !== "number" || !Number.isFinite(raw)) return this.fail(key, "must be a finite number") as never
    if (raw < options.min || raw > options.max) return this.fail(key, `must be between ${options.min} and ${options.max}`) as never
    if (options.integer && !Number.isInteger(raw)) return this.fail(key, "must be an integer") as never
    const scaled = options.decimals === undefined ? 0 : raw * 10 ** options.decimals
    if (options.decimals !== undefined && Math.abs(Math.round(scaled) - scaled) > 1e-6) {
      return this.fail(key, `must have at most ${options.decimals} decimal places`) as never
    }
    return raw
  }

  boolean(key: string, fallback: boolean): boolean {
    const raw = this.value[key]
    if (raw === undefined) return fallback
    if (typeof raw !== "boolean") return this.fail(key, "must be a boolean") as never
    return raw
  }

  strings(key: string, options: { optional?: boolean } = {}): string[] {
    const raw = this.value[key]
    if (raw === undefined && options.optional) return []
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string" || !item.trim())) {
      return this.fail(key, "must be an array of non-empty strings") as never
    }
    return raw.map((item: string) => item.trim())
  }

  objects(key: string, options: { optional?: boolean } = {}): Json[] {
    const raw = this.value[key]
    if (raw === undefined && options.optional) return []
    if (!Array.isArray(raw) || raw.some((item) => !isObject(item))) {
      return (this.fail(key, "must be an array of objects") as never) ?? []
    }
    return raw as Json[]
  }

  object(key: string, options: { optional?: boolean } = {}): Json | undefined {
    const raw = this.value[key]
    if (raw === undefined && options.optional) return undefined
    if (!isObject(raw)) return this.fail(key, "must be an object")
    return raw
  }

  child(value: Json, path: string): Reader {
    return new Reader(this.issues, value, `${this.path}.${path}`)
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readDisplay(reader: Reader, raw: Json | undefined): EventDisplayInput {
  if (!raw) return {}
  const display = reader.child(raw, "display")
  const out: EventDisplayInput = {}
  if (display.has("displayTime")) out.displayTime = display.string("displayTime")
  if (display.has("confidence")) out.confidence = display.oneOf("confidence", ["High", "Medium", "Low"] as const)
  if (display.has("sourceTier")) {
    const tier = display.number("sourceTier", { min: 1, max: 2, integer: true })
    out.sourceTier = tier as 1 | 2
  }
  if (display.has("sigma")) out.sigma = display.number("sigma", { min: 0, max: 100 })
  for (const key of ["duration", "catalystLabel", "catalyst", "catalystTime"] as const) {
    if (display.has(key)) out[key] = display.string(key)
  }
  if (display.has("entities")) out.entities = display.strings("entities")
  for (const key of ["signals", "relatedMarkets", "analogues", "timeline"] as const) {
    if (display.has(key)) out[key] = display.objects(key)
  }
  const anomaly = display.object("anomaly", { optional: true })
  if (anomaly) {
    const reader = display.child(anomaly, "anomaly")
    out.anomaly = {
      title: reader.string("title"),
      body: reader.string("body"),
      interpretations: reader.strings("interpretations"),
    }
  }
  return out
}

function readEvent(reader: Reader, raw: Json): EventRecordInput {
  const event = reader.child(raw, "event")
  const question = event.string("question", { min: 15, max: 500 })
  if (question !== undefined && !question.endsWith("?")) {
    event.issue("question", "must be phrased as a question ending in ?")
  }
  return {
    id: event.id("id"),
    title: event.string("title", { min: 3, max: 200 }),
    question,
    status: event.oneOf("status", STATUSES),
    deadline: event.timestamp("deadline"),
    resolutionCriteria: event.string("resolutionCriteria", { min: 20 }),
    category: event.oneOf("category", EVENT_CATEGORIES),
    significance: event.oneOf("significance", SIGNIFICANCES),
    region: event.string("region"),
    summary: event.string("summary"),
    tags: event.strings("tags", { optional: true }),
    relatedEventIds: event.strings("relatedEventIds", { optional: true }),
    provenance: event.oneOf("provenance", PROVENANCE),
    followedByDefault: event.boolean("followedByDefault", false),
    catalogPosition: event.has("catalogPosition")
      ? event.number("catalogPosition", { min: 0, max: 1_000_000, integer: true })
      : 0,
    display: readDisplay(event, event.object("display", { optional: true })),
  }
}

/** Validates an untrusted JSON bundle. Throws `BundleValidationError` listing every problem. */
export function parseEventBundle(input: unknown): EventBundle {
  const issues: string[] = []
  if (!isObject(input)) throw new BundleValidationError(["bundle must be a JSON object"])
  const root = new Reader(issues, input, "bundle")

  const eventRaw = root.object("event", { optional: true })
  const event = eventRaw ? readEvent(root, eventRaw) : undefined
  const eventId = event ? event.id : root.id("eventId")
  if (event && input.eventId !== undefined && input.eventId !== event.id) {
    issues.push("bundle.eventId must match bundle.event.id")
  }

  const observations = root.objects("observations", { optional: true }).map((raw, index): ObservationInput => {
    const item = root.child(raw, `observations[${index}]`)
    const note = item.string("note", { optional: true })
    return {
      sourceKind: item.oneOf("sourceKind", SOURCE_KINDS),
      sourceName: item.string("sourceName"),
      probabilityType: item.oneOf("probabilityType", PROBABILITY_TYPES),
      probabilityPct: item.number("probabilityPct", { min: 0, max: 100, decimals: 2 }),
      observedAt: item.timestamp("observedAt"),
      capturedAt: item.timestamp("capturedAt", { optional: true }),
      ...(note === undefined ? {} : { note }),
      provenance: item.oneOf("provenance", PROVENANCE),
    }
  })

  const evidence = root.objects("evidence", { optional: true }).map((raw, index): EvidenceInput => {
    const item = root.child(raw, `evidence[${index}]`)
    const sourceUrl = item.string("sourceUrl", { optional: true })
    if (sourceUrl !== undefined && !/^https?:\/\//.test(sourceUrl)) {
      issues.push(`bundle.evidence[${index}].sourceUrl must start with http:// or https://`)
    }
    const record: EvidenceInput = {
      id: item.id("id"),
      sourceName: item.string("sourceName"),
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
      sourcePublishedAt: item.timestamp("sourcePublishedAt", { nullable: true }),
      firstObservedAt: item.timestamp("firstObservedAt"),
      capturedAt: item.timestamp("capturedAt", { optional: true }),
      summary: item.string("summary"),
      stance: item.oneOf("stance", STANCES),
      reliability: item.number("reliability", { min: 0, max: 1, decimals: 2 }),
      recordedBy: item.string("recordedBy"),
      provenance: item.oneOf("provenance", PROVENANCE),
    }
    if (
      record.sourcePublishedAt &&
      record.firstObservedAt &&
      record.sourcePublishedAt > record.firstObservedAt
    ) {
      issues.push(`bundle.evidence[${index}].sourcePublishedAt must not be after firstObservedAt`)
    }
    return record
  })

  const moveLogRevisions = root
    .objects("moveLogRevisions", { optional: true })
    .map((raw, index): MoveLogRevisionInput => {
      const item = root.child(raw, `moveLogRevisions[${index}]`)
      const version = item.number("version", { min: 1, max: 100_000, integer: true })
      const correctionNote = item.string("correctionNote", { optional: true })
      if (version > 1 && correctionNote === undefined) {
        issues.push(`bundle.moveLogRevisions[${index}].correctionNote is required for version ${version}`)
      }
      if (version === 1 && correctionNote !== undefined) {
        issues.push(`bundle.moveLogRevisions[${index}].correctionNote is only allowed on corrections (version > 1)`)
      }
      return {
        moveLogId: item.id("moveLogId"),
        version,
        publishedAt: item.timestamp("publishedAt"),
        author: item.string("author"),
        whatChanged: item.string("whatChanged"),
        likelyCause: item.string("likelyCause"),
        explainedPct: item.number("explainedPct", { min: 0, max: 100, decimals: 2 }),
        unexplainedFactors: item.strings("unexplainedFactors", { optional: true }),
        evidenceIds: item.strings("evidenceIds", { optional: true }),
        ...(correctionNote === undefined ? {} : { correctionNote }),
        provenance: item.oneOf("provenance", PROVENANCE),
      }
    })

  if (event && observations.length === 0) {
    issues.push("bundle.observations must include at least one observation when bundle.event is present")
  }
  if (!event && observations.length + evidence.length + moveLogRevisions.length === 0) {
    issues.push("bundle has nothing to write")
  }

  if (issues.length > 0) throw new BundleValidationError(issues)
  return { eventId, event, observations, evidence, moveLogRevisions }
}
