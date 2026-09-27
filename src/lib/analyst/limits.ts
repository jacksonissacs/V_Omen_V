/** Bounds for analyst proposal generation. No arbitrary browsing or shell. */

export const ANALYST_LIMITS = {
  /** Provider call timeout. */
  timeoutMs: 20_000,
  /** Bounded retries for transient provider failures (not validation failures). */
  maxRetries: 2,
  retryBaseMs: 100,
  /** Max UTF-8 bytes across all selected evidence summaries + metadata in the prompt. */
  maxInputBytes: 48_000,
  /** Max UTF-8 bytes of raw provider output. */
  maxOutputBytes: 32_000,
  /** Max selected evidence items per run. */
  maxEvidenceItems: 12,
  /** Field length caps in the proposal body. */
  maxEvidenceSummaryChars: 2_000,
  maxInterpretationChars: 2_000,
  maxClaimTextChars: 800,
  maxClaims: 24,
  maxQuestionChars: 500,
  maxQuestions: 16,
  maxAbstentionReasonChars: 1_000,
} as const
