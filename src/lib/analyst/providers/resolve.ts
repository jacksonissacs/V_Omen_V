import { AnalystProviderError } from "../types"
import { TestAnalystProvider, type TestAdapterMode } from "./test-adapter"
import type { AnalystProvider } from "./types"
import { UnavailableAnalystProvider } from "./unavailable"

export interface ResolveProviderOptions {
  /** Explicit CLI/provider id: "test" | "live" | custom. */
  provider?: string
  /** Test adapter behavior when provider=test. */
  testMode?: TestAdapterMode
  env?: NodeJS.ProcessEnv
}

/**
 * Resolve a provider without activating paid APIs.
 * Missing live configuration → unavailable (not a successful run).
 */
export function resolveAnalystProvider(options: ResolveProviderOptions = {}): AnalystProvider {
  const env = options.env ?? process.env
  const requested = (options.provider ?? env.OMEN_ANALYST_PROVIDER ?? "test").trim().toLowerCase()

  if (requested === "test" || requested === "synthetic") {
    return new TestAnalystProvider(options.testMode ?? "valid")
  }

  if (requested === "live" || requested === "openai" || requested === "anthropic") {
    const configured = env.OMEN_ANALYST_LIVE_API_KEY?.trim()
    if (!configured) {
      return new UnavailableAnalystProvider(requested)
    }
    // Paid live providers require explicit owner approval and are not activated in this build.
    throw new AnalystProviderError(
      "misconfigured",
      `Provider "${requested}" has a key present but live execution is not activated in this build. Owner approval is required before enabling paid APIs.`,
    )
  }

  return new UnavailableAnalystProvider(requested || "unconfigured")
}
