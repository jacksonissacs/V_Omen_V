import type { AnalystExecutionKind, AnalystUsage, StoredEvidenceInput } from "../types"

export interface AnalystGenerateRequest {
  eventId: string
  eventQuestion: string
  evidence: StoredEvidenceInput[]
  promptVersion: string
  system: string
  user: string
  signal: AbortSignal
}

export type AnalystGenerateSuccess = {
  ok: true
  rawText: string
  usage: AnalystUsage | null
}

export type AnalystGenerateFailure = {
  ok: false
  errorCode: "timeout" | "provider_failure" | "unavailable"
  message: string
}

export type AnalystGenerateResult = AnalystGenerateSuccess | AnalystGenerateFailure

/**
 * Provider-neutral analyst interface.
 * Implementations must not browse, execute shell, or publish.
 */
export interface AnalystProvider {
  readonly id: string
  readonly modelId: string
  readonly executionKind: AnalystExecutionKind
  generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResult>
}
