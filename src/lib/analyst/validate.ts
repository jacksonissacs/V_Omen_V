import { ANALYST_LIMITS } from "./limits"
import { AnalystValidationError, type AnalystProposalBody, type EvidenceInputRef } from "./types"

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/
const SHA256 = /^[a-f0-9]{64}$/

/**
 * Patterns forbidden in interpretation and generated analysis.
 * Reported-fact fields may quote source numerals; they still forbid probability /
 * deadline / reliability / causality language.
 */
const INTERPRETATION_FORBIDDEN: Array<{ re: RegExp; label: string }> = [
  { re: /\b\d{1,3}(?:\.\d+)?\s*%/, label: "percentage or probability" },
  { re: /\bprobability\b/i, label: "probability language" },
  { re: /\bdeadline\b/i, label: "deadline language" },
  { re: /\bexplained\s*(pct|percent|percentage|share)\b/i, label: "explained percentage" },
  { re: /\breliability\s*(score|rating)?\b/i, label: "reliability score" },
  { re: /\bproves?\s+that\b/i, label: "proven causality claim" },
  { re: /\bcaused\s+by\b/i, label: "proven causality claim" },
  { re: /\bthis\s+proves\b/i, label: "proven causality claim" },
]

const REPORT_FORBIDDEN: Array<{ re: RegExp; label: string }> = [
  { re: /\bprobability\b/i, label: "probability language" },
  { re: /\bdeadline\b/i, label: "deadline language" },
  { re: /\bexplained\s*(pct|percent|percentage|share)\b/i, label: "explained percentage" },
  { re: /\breliability\s*(score|rating)?\b/i, label: "reliability score" },
  { re: /\bproves?\s+that\b/i, label: "proven causality claim" },
  { re: /\bcaused\s+by\b/i, label: "proven causality claim" },
  { re: /\bthis\s+proves\b/i, label: "proven causality claim" },
]

function scanForbidden(
  text: string,
  label: string,
  patterns: Array<{ re: RegExp; label: string }> = INTERPRETATION_FORBIDDEN,
): void {
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      throw new AnalystValidationError(`${label} contains forbidden ${pattern.label}.`)
    }
  }
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8")
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new AnalystValidationError(`${label} must be a string.`)
  return value
}

function assertBoundedString(value: unknown, label: string, maxChars: number): string {
  const text = assertString(value, label).trim()
  if (text.length > maxChars) {
    throw new AnalystValidationError(`${label} exceeds ${maxChars} characters.`)
  }
  return text
}

function parseInputEvidence(raw: unknown): EvidenceInputRef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AnalystValidationError("inputEvidence must be a non-empty array.")
  }
  if (raw.length > ANALYST_LIMITS.maxEvidenceItems) {
    throw new AnalystValidationError(`inputEvidence exceeds ${ANALYST_LIMITS.maxEvidenceItems} items.`)
  }
  const refs: EvidenceInputRef[] = []
  const seen = new Set<string>()
  for (const [index, item] of raw.entries()) {
    if (typeof item !== "object" || item === null) {
      throw new AnalystValidationError(`inputEvidence[${index}] must be an object.`)
    }
    const row = item as Record<string, unknown>
    const id = assertString(row.id, `inputEvidence[${index}].id`).trim()
    const contentIdentity = assertString(row.contentIdentity, `inputEvidence[${index}].contentIdentity`).trim()
    if (!ID.test(id)) throw new AnalystValidationError(`inputEvidence[${index}].id is not a valid evidence id.`)
    if (!SHA256.test(contentIdentity)) {
      throw new AnalystValidationError(`inputEvidence[${index}].contentIdentity must be a sha256 hex digest.`)
    }
    if (seen.has(id)) throw new AnalystValidationError(`inputEvidence duplicates evidence id ${id}.`)
    seen.add(id)
    refs.push({ id, contentIdentity })
  }
  return refs
}

/**
 * Parse and validate a proposal body.
 * `allowedEvidenceIds` are the operator-selected input ids for membership checks.
 *
 * Membership validation does not prove that a cited source supports the claim text.
 * Callers must treat that as an evaluation case, not a guarantee.
 */
export function parseAnalystProposalBody(
  input: unknown,
  allowedEvidenceIds: ReadonlySet<string>,
): AnalystProposalBody {
  if (typeof input !== "object" || input === null) {
    throw new AnalystValidationError("Proposal must be a JSON object.")
  }
  const raw = input as Record<string, unknown>
  const eventId = assertString(raw.eventId, "eventId").trim()
  if (!ID.test(eventId)) throw new AnalystValidationError("eventId is not a valid event id.")

  const inputEvidence = parseInputEvidence(raw.inputEvidence)
  for (const ref of inputEvidence) {
    if (!allowedEvidenceIds.has(ref.id)) {
      throw new AnalystValidationError(
        `inputEvidence cites unknown evidence id ${ref.id} (not in the selected inputs).`,
      )
    }
  }
  if (inputEvidence.length !== allowedEvidenceIds.size) {
    throw new AnalystValidationError("inputEvidence must list exactly the selected evidence inputs.")
  }

  const evidenceSummary = assertBoundedString(
    raw.evidenceSummary,
    "evidenceSummary",
    ANALYST_LIMITS.maxEvidenceSummaryChars,
  )
  if (!evidenceSummary) throw new AnalystValidationError("evidenceSummary is required.")
  scanForbidden(evidenceSummary, "evidenceSummary", REPORT_FORBIDDEN)

  if (typeof raw.abstention !== "object" || raw.abstention === null) {
    throw new AnalystValidationError("abstention must be an object.")
  }
  const abstentionRaw = raw.abstention as Record<string, unknown>
  if (typeof abstentionRaw.abstained !== "boolean") {
    throw new AnalystValidationError("abstention.abstained must be a boolean.")
  }
  const abstained = abstentionRaw.abstained
  let reason: string | null = null
  if (abstentionRaw.reason === null || abstentionRaw.reason === undefined) {
    reason = null
  } else {
    reason = assertBoundedString(
      abstentionRaw.reason,
      "abstention.reason",
      ANALYST_LIMITS.maxAbstentionReasonChars,
    )
    if (!reason) reason = null
  }
  if (abstained && !reason) {
    throw new AnalystValidationError("abstention.reason is required when abstained is true.")
  }
  if (!abstained && reason) {
    throw new AnalystValidationError("abstention.reason must be null when abstained is false.")
  }
    if (reason) scanForbidden(reason, "abstention.reason", REPORT_FORBIDDEN)

  const interpretation = assertBoundedString(
    raw.interpretation,
    "interpretation",
    ANALYST_LIMITS.maxInterpretationChars,
  )
  if (!abstained) {
    if (!interpretation) throw new AnalystValidationError("interpretation is required unless abstaining.")
    scanForbidden(interpretation, "interpretation")
  } else if (interpretation) {
    throw new AnalystValidationError("interpretation must be empty when abstaining.")
  }

  if (!Array.isArray(raw.contradictionsLimitationsQuestions)) {
    throw new AnalystValidationError("contradictionsLimitationsQuestions must be an array.")
  }
  if (raw.contradictionsLimitationsQuestions.length > ANALYST_LIMITS.maxQuestions) {
    throw new AnalystValidationError(
      `contradictionsLimitationsQuestions exceeds ${ANALYST_LIMITS.maxQuestions} items.`,
    )
  }
  const contradictionsLimitationsQuestions = raw.contradictionsLimitationsQuestions.map((item, index) => {
    const text = assertBoundedString(
      item,
      `contradictionsLimitationsQuestions[${index}]`,
      ANALYST_LIMITS.maxQuestionChars,
    )
    if (!text) {
      throw new AnalystValidationError(`contradictionsLimitationsQuestions[${index}] must not be empty.`)
    }
    scanForbidden(text, `contradictionsLimitationsQuestions[${index}]`, REPORT_FORBIDDEN)
    return text
  })
  if (abstained && contradictionsLimitationsQuestions.length === 0) {
    throw new AnalystValidationError(
      "When abstaining, contradictionsLimitationsQuestions must state what is insufficient.",
    )
  }

  if (!Array.isArray(raw.claims)) throw new AnalystValidationError("claims must be an array.")
  if (raw.claims.length > ANALYST_LIMITS.maxClaims) {
    throw new AnalystValidationError(`claims exceeds ${ANALYST_LIMITS.maxClaims} items.`)
  }
  if (!abstained && raw.claims.length === 0) {
    throw new AnalystValidationError("claims must include at least one claim unless abstaining.")
  }
  if (abstained && raw.claims.length > 0) {
    throw new AnalystValidationError("claims must be empty when abstaining.")
  }

  const claims = raw.claims.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new AnalystValidationError(`claims[${index}] must be an object.`)
    }
    const claim = item as Record<string, unknown>
    const text = assertBoundedString(claim.text, `claims[${index}].text`, ANALYST_LIMITS.maxClaimTextChars)
    if (!text) throw new AnalystValidationError(`claims[${index}].text is required.`)
    const kind = claim.kind
    if (kind !== "reported_fact" && kind !== "interpretation") {
      throw new AnalystValidationError(`claims[${index}].kind must be "reported_fact" or "interpretation".`)
    }
    scanForbidden(
      text,
      `claims[${index}].text`,
      kind === "reported_fact" ? REPORT_FORBIDDEN : INTERPRETATION_FORBIDDEN,
    )
    if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0) {
      throw new AnalystValidationError(`claims[${index}].evidenceIds must be a non-empty array.`)
    }
    const evidenceIds = claim.evidenceIds.map((id, evidIndex) => {
      if (typeof id !== "string" || !ID.test(id.trim())) {
        throw new AnalystValidationError(`claims[${index}].evidenceIds[${evidIndex}] is not a valid evidence id.`)
      }
      const trimmed = id.trim()
      if (!allowedEvidenceIds.has(trimmed)) {
        throw new AnalystValidationError(
          `claims[${index}] cites unknown evidence id ${trimmed}. Citation membership requires a selected input.`,
        )
      }
      return trimmed
    })
    return { text, kind: kind as "reported_fact" | "interpretation", evidenceIds: [...new Set(evidenceIds)] }
  })

  // Reject unexpected top-level keys that look like forbidden product fields.
  for (const key of Object.keys(raw)) {
    if (
      [
        "probability",
        "probabilityPct",
        "deadline",
        "explainedPct",
        "reliability",
        "reliabilityScore",
        "causality",
      ].includes(key)
    ) {
      throw new AnalystValidationError(`Proposal must not include field "${key}".`)
    }
  }

  return {
    eventId,
    inputEvidence,
    evidenceSummary,
    interpretation,
    contradictionsLimitationsQuestions,
    claims,
    abstention: { abstained, reason },
  }
}

export function parseProviderJsonOutput(rawText: string, allowedEvidenceIds: ReadonlySet<string>): AnalystProposalBody {
  if (utf8Bytes(rawText) > ANALYST_LIMITS.maxOutputBytes) {
    throw new AnalystValidationError(`Provider output exceeds ${ANALYST_LIMITS.maxOutputBytes} bytes.`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new AnalystValidationError("Provider output is not valid JSON.")
  }
  return parseAnalystProposalBody(parsed, allowedEvidenceIds)
}

export function assertInputSize(evidenceSummaries: string[]): void {
  const total = evidenceSummaries.reduce((sum, text) => sum + utf8Bytes(text), 0)
  if (total > ANALYST_LIMITS.maxInputBytes) {
    throw new AnalystValidationError(`Selected evidence exceeds ${ANALYST_LIMITS.maxInputBytes} input bytes.`)
  }
  if (evidenceSummaries.length > ANALYST_LIMITS.maxEvidenceItems) {
    throw new AnalystValidationError(`Selected evidence exceeds ${ANALYST_LIMITS.maxEvidenceItems} items.`)
  }
}
