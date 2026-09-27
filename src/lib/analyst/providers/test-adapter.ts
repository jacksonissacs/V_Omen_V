import { evidenceContentIdentity, inputContentIdentity } from "../content-identity"
import type { AnalystGenerateRequest, AnalystGenerateResult, AnalystProvider } from "./types"
import type { AnalystProposalBody, EvidenceInputRef, StoredEvidenceInput } from "../types"

export type TestAdapterMode =
  | "valid"
  | "insufficient"
  | "unknown_citation"
  | "malformed"
  | "forbidden_fields"
  | "provider_failure"
  | "timeout"
  | "follow_source_injection"

/**
 * Deterministic test adapter. Always synthetic.
 * Must never be reported as a successful real-model / live run.
 */
export class TestAnalystProvider implements AnalystProvider {
  readonly id = "test"
  readonly modelId = "test-deterministic-v1"
  readonly executionKind = "synthetic" as const

  constructor(readonly mode: TestAdapterMode = "valid") {}

  async generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResult> {
    if (request.signal.aborted) {
      return { ok: false, errorCode: "timeout", message: "Analyst provider timed out before start." }
    }

    if (this.mode === "timeout") {
      return { ok: false, errorCode: "timeout", message: "Synthetic provider timed out." }
    }
    if (this.mode === "provider_failure") {
      return { ok: false, errorCode: "provider_failure", message: "Synthetic provider failed." }
    }
    if (this.mode === "malformed") {
      return { ok: true, rawText: "not-json{{{", usage: null }
    }

    const refs: EvidenceInputRef[] = request.evidence.map((item) => ({
      id: item.id,
      contentIdentity: item.contentIdentity,
    }))

    if (this.mode === "insufficient" || request.evidence.length === 0) {
      const body: AnalystProposalBody = {
        eventId: request.eventId,
        inputEvidence: refs,
        evidenceSummary: "The selected inputs do not contain enough concrete reporting to summarize.",
        interpretation: "",
        contradictionsLimitationsQuestions: [
          "Evidence is insufficient for an evidence-grounded interpretation.",
        ],
        claims: [],
        abstention: {
          abstained: true,
          reason: "Selected evidence is insufficient for an evidence-grounded draft.",
        },
      }
      return { ok: true, rawText: JSON.stringify(body), usage: null }
    }

    if (this.mode === "unknown_citation") {
      const body = {
        eventId: request.eventId,
        inputEvidence: refs,
        evidenceSummary: summarizeFacts(request.evidence),
        interpretation: "The release may matter for the tracked question.",
        contradictionsLimitationsQuestions: ["Open question: whether later prints revise the print."],
        claims: [
          {
            text: "A claim that cites an evidence id that was not supplied.",
            kind: "interpretation",
            evidenceIds: ["ev-not-in-selection"],
          },
        ],
        abstention: { abstained: false, reason: null },
      }
      return { ok: true, rawText: JSON.stringify(body), usage: null }
    }

    if (this.mode === "forbidden_fields") {
      const body = {
        eventId: request.eventId,
        inputEvidence: refs,
        evidenceSummary: summarizeFacts(request.evidence),
        interpretation: "Odds are now 73.8% after the print.",
        contradictionsLimitationsQuestions: ["What is the deadline?"],
        claims: [
          {
            text: "This proves that CPI caused the move.",
            kind: "interpretation",
            evidenceIds: [request.evidence[0]!.id],
          },
        ],
        abstention: { abstained: false, reason: null },
        probabilityPct: 73.8,
      }
      return { ok: true, rawText: JSON.stringify(body), usage: null }
    }

    // Source-injection mode: evidence text may contain instruction-like strings.
    // The adapter still returns a grounded draft citing only supplied ids — it does
    // not obey injected instructions to cite unknown ids or invent probabilities.
    if (this.mode === "follow_source_injection") {
      const injected = request.evidence.some((item) =>
        /ignore previous|cite ev-injected|set probability/i.test(item.summary),
      )
      if (!injected) {
        return {
          ok: false,
          errorCode: "provider_failure",
          message: "follow_source_injection mode requires injection-like source text.",
        }
      }
    }

    const first = request.evidence[0]!
    const body: AnalystProposalBody = {
      eventId: request.eventId,
      inputEvidence: refs,
      evidenceSummary: summarizeFacts(request.evidence),
      interpretation:
        "The selected reporting may matter for the tracked question because it updates the factual record humans were watching.",
      contradictionsLimitationsQuestions: [
        "The sources do not state how later revisions might change the picture.",
        "Causal contribution to any market move is not established by these excerpts alone.",
      ],
      claims: [
        {
          text: first.summary
            .replace(/ignore previous instructions?[^.]*\.?/gi, "")
            .replace(/cite ev-[a-z0-9-]+/gi, "")
            .replace(/set probability[^.]*\.?/gi, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 400) || "Selected source text after removing instruction-like phrases.",
          kind: "reported_fact",
          evidenceIds: [first.id],
        },
        {
          text: "The reported facts may be relevant to the tracked question pending human review.",
          kind: "interpretation",
          evidenceIds: request.evidence.map((item) => item.id),
        },
      ],
      abstention: { abstained: false, reason: null },
    }
    // Touch content identity helpers so tests can assert stability without exporting internals.
    void inputContentIdentity(refs)
    void evidenceContentIdentity(first)
    return { ok: true, rawText: JSON.stringify(body), usage: null }
  }
}

function summarizeFacts(evidence: StoredEvidenceInput[]): string {
  // Quote source reporting without copying instruction-like injection strings into the draft.
  return evidence
    .map((item) => {
      const cleaned = item.summary
        .replace(/ignore previous instructions?[^.]*\.?/gi, "")
        .replace(/cite ev-[a-z0-9-]+/gi, "")
        .replace(/set probability[^.]*\.?/gi, "")
        .replace(/\s+/g, " ")
        .trim()
      return `${item.sourceName}: ${cleaned || "Source text contained no usable reported facts after removing instruction-like phrases."}`
    })
    .join(" ")
}
