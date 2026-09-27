import type { ClientBase } from "pg"

import { inputContentIdentity, proposalContentIdentity } from "./content-identity"
import { ANALYST_LIMITS } from "./limits"
import { loadEventQuestion, loadSelectedEvidence } from "./load-evidence"
import { buildAnalystPrompt } from "./prompt"
import type { AnalystProvider } from "./providers/types"
import { finishRun, insertPendingRun, insertProposal } from "./store"
import {
  AnalystProviderError,
  AnalystValidationError,
  type AnalystProposalRecord,
  type AnalystRunRecord,
  type EvidenceInputRef,
} from "./types"
import { assertInputSize, parseProviderJsonOutput } from "./validate"

export interface ExecuteAnalystProposalArgs {
  eventId: string
  evidenceIds: string[]
  provider: AnalystProvider
  /** Override clock for tests. */
  now?: () => Date
  /** Override sleep for retry tests. */
  sleep?: (ms: number) => Promise<void>
}

export interface ExecuteAnalystProposalResult {
  run: AnalystRunRecord
  proposal: AnalystProposalRecord | null
  /** Explicit label for handoffs: synthetic runs are never live-model evaluations. */
  executionKind: AnalystRunRecord["executionKind"]
  reusedExistingProposal: boolean
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callProviderWithBounds(
  provider: AnalystProvider,
  request: Parameters<AnalystProvider["generate"]>[0],
  sleep: (ms: number) => Promise<void>,
): Promise<Awaited<ReturnType<AnalystProvider["generate"]>>> {
  let attempt = 0
  let lastFailure: Awaited<ReturnType<AnalystProvider["generate"]>> | null = null
  while (attempt <= ANALYST_LIMITS.maxRetries) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ANALYST_LIMITS.timeoutMs)
    try {
      const result = await provider.generate({ ...request, signal: controller.signal })
      if (result.ok) return result
      lastFailure = result
      if (result.errorCode === "unavailable") return result
      if (result.errorCode === "timeout" || result.errorCode === "provider_failure") {
        if (attempt === ANALYST_LIMITS.maxRetries) return result
        await sleep(ANALYST_LIMITS.retryBaseMs * 2 ** attempt)
        attempt += 1
        continue
      }
      return result
    } catch (error) {
      if (controller.signal.aborted) {
        lastFailure = { ok: false, errorCode: "timeout", message: "Analyst provider timed out." }
      } else {
        lastFailure = {
          ok: false,
          errorCode: "provider_failure",
          message: (error as Error).message,
        }
      }
      if (attempt === ANALYST_LIMITS.maxRetries) return lastFailure
      await sleep(ANALYST_LIMITS.retryBaseMs * 2 ** attempt)
      attempt += 1
    } finally {
      clearTimeout(timer)
    }
  }
  return lastFailure ?? { ok: false, errorCode: "provider_failure", message: "Analyst provider failed." }
}

/**
 * Manually invoked, nonproduction analyst run.
 * Receives selected stored inputs only. Does not publish.
 */
export async function executeAnalystProposal(
  client: ClientBase,
  args: ExecuteAnalystProposalArgs,
): Promise<ExecuteAnalystProposalResult> {
  const now = args.now ?? (() => new Date())
  const sleep = args.sleep ?? defaultSleep
  const startedAt = now()

  const question = await loadEventQuestion(client, args.eventId)
  const evidence = await loadSelectedEvidence(client, args.eventId, args.evidenceIds)
  assertInputSize(evidence.map((item) => item.summary))

  const inputRefs: EvidenceInputRef[] = evidence.map((item) => ({
    id: item.id,
    contentIdentity: item.contentIdentity,
  }))
  const inputIdentity = inputContentIdentity(inputRefs)
  const prompt = buildAnalystPrompt({
    eventId: args.eventId,
    eventQuestion: question,
    evidence,
  })

  const pending = await insertPendingRun(client, {
    eventId: args.eventId,
    providerId: args.provider.id,
    modelId: args.provider.modelId,
    executionKind: args.provider.executionKind,
    promptVersion: prompt.promptVersion,
    inputEvidence: inputRefs,
    inputContentIdentity: inputIdentity,
    startedAt,
  })

  const allowed = new Set(inputRefs.map((ref) => ref.id))
  const providerResult = await callProviderWithBounds(
    args.provider,
    {
      eventId: args.eventId,
      eventQuestion: question,
      evidence,
      promptVersion: prompt.promptVersion,
      system: prompt.system,
      user: prompt.user,
      signal: new AbortController().signal,
    },
    sleep,
  )

  const finishedAt = now()
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime())

  if (!providerResult.ok) {
    const status =
      providerResult.errorCode === "unavailable"
        ? "unavailable"
        : providerResult.errorCode === "timeout"
          ? "failed"
          : "failed"
    const run = await finishRun(client, {
      id: pending.id,
      status,
      finishedAt,
      durationMs,
      usage: null,
      errorCode: providerResult.errorCode,
      errorMessage: providerResult.message,
    })
    return {
      run,
      proposal: null,
      executionKind: args.provider.executionKind,
      reusedExistingProposal: false,
    }
  }

  try {
    const body = parseProviderJsonOutput(providerResult.rawText, allowed)
    if (body.eventId !== args.eventId) {
      throw new AnalystValidationError("Proposal eventId must match the selected event.")
    }
    for (const ref of body.inputEvidence) {
      const match = inputRefs.find((item) => item.id === ref.id)
      if (!match || match.contentIdentity !== ref.contentIdentity) {
        throw new AnalystValidationError(
          `Proposal inputEvidence content identity mismatch for ${ref.id}.`,
        )
      }
    }
    const contentIdentity = proposalContentIdentity(body)
    const before = await insertProposal(client, {
      runId: pending.id,
      eventId: args.eventId,
      contentIdentity,
      inputContentIdentity: inputIdentity,
      proposal: body,
    })
    const reusedExistingProposal = before.runId !== pending.id
    const run = await finishRun(client, {
      id: pending.id,
      status: "succeeded",
      finishedAt,
      durationMs,
      usage: providerResult.usage,
      errorCode: null,
      errorMessage: null,
    })
    return {
      run,
      proposal: before,
      executionKind: args.provider.executionKind,
      reusedExistingProposal,
    }
  } catch (error) {
    const message =
      error instanceof AnalystValidationError || error instanceof AnalystProviderError
        ? error.message
        : (error as Error).message
    const run = await finishRun(client, {
      id: pending.id,
      status: "rejected_output",
      finishedAt,
      durationMs,
      usage: providerResult.usage,
      errorCode: "rejected_output",
      errorMessage: message,
    })
    return {
      run,
      proposal: null,
      executionKind: args.provider.executionKind,
      reusedExistingProposal: false,
    }
  }
}
