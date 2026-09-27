import type { AnalystGenerateRequest, AnalystGenerateResult, AnalystProvider } from "./types"

/**
 * Reports that a live provider is not configured.
 * Missing configuration must never look like a successful model run.
 */
export class UnavailableAnalystProvider implements AnalystProvider {
  readonly id: string
  readonly modelId = "unconfigured"
  readonly executionKind = "live" as const

  constructor(id = "unconfigured") {
    this.id = id
  }

  async generate(_request: AnalystGenerateRequest): Promise<AnalystGenerateResult> {
    void _request
    return {
      ok: false,
      errorCode: "unavailable",
      message:
        "Live analyst provider is unavailable. No paid API is configured. Use --provider test for synthetic runs, or obtain owner approval before activating a live provider.",
    }
  }
}
