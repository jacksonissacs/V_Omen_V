# Bounded AI analyst proposals (V0)

Operators select a tracked event and stored evidence. A private, manually invoked CLI asks an analyst provider for an evidence-grounded **draft**. Nothing is automatically approved or published.

This path reuses the existing source-review queue for staging visibility and keeps durable publication on the canonical `writeEventBundle` → checkpoint path. Converting an approved proposal into a Move Log (or evidence) candidate and publishing it remains an **explicit operator step** after human editing.

## Commands

Requires `DATABASE_URL`, a database identified as `development`, `test`, or `demo`, and the same production guards as `npm run operator`.

```bash
# Synthetic deterministic run (not a live-model evaluation)
npm run analyst -- propose \
  --event evt-boc-cut \
  --evidence ev-boc-1,ev-boc-2 \
  --provider test \
  --stage \
  --by "Demo Operator"

npm run analyst -- show proposal <proposalId>
npm run analyst -- list proposals --event evt-boc-cut --status staged
npm run analyst -- approve <proposalId> --by "Demo Operator"
npm run analyst -- reject <proposalId> --by "Demo Operator" --note "Needs stronger sources"

# Retry staging the same proposal (idempotent while still staged)
npm run analyst -- stage <proposalId> --by "Demo Operator"
```

`publish approved` on an `analyst_proposal` review item is **refused**. Publish only after an operator converts the draft into an authored Move Log or evidence candidate and uses `npm run operator -- publish` with a new idempotency key.

Generic `npm run operator -- intake stage` **rejects** `analyst_proposal` candidates. Stage through the dedicated analyst commands above.

## Proposal contract

Accepted drafts include:

| Field | Meaning |
| --- | --- |
| `eventId` | Tracked event |
| `inputEvidence` | Exact selected evidence ids + content identities |
| `evidenceSummary` | What the selected evidence reports |
| `interpretation` | Suggested interpretation / why it may matter (empty when abstaining) |
| `contradictionsLimitationsQuestions` | Contradictions, limitations, unanswered questions |
| `claims[]` | Claim text, `reported_fact` or `interpretation`, cited evidence ids |
| `abstention` | Explicit abstention when evidence is insufficient |

Validation **rejects specific regex patterns** associated with probabilities, deadlines, explained-percentage phrasing, source reliability scores, and a short list of proven-causality phrases (for example `proves that`, `caused by`). This is a heuristic filter, not a semantic guarantee. Interpretation fields also reject numeral `%` tokens; `reported_fact` / evidence-summary fields may still quote source numerals. Human review remains required.

**Citation membership** checks that claim evidence ids were among the selected inputs. Membership does **not** prove that a source supports the claim text. Evaluation fixtures cover support-checking gaps and prompt-injection attempts inside source text (source text is untrusted data, never instructions).

**Input identity** hashes the event question, prompt version, and selected evidence content identities. Proposals persist the reviewed question and prompt version. Approval and staging re-check the current authoritative question, prompt version, and evidence; a change invalidates prior eligibility. Legacy rows lacking reviewed context are treated as stale and require regeneration/review — approval is never silently refreshed.

Approval is applied only when the row is still `draft` or `staged`, reviewed context is present, and the reviewed `(content_identity, input_content_identity)` still match. Concurrent reject or edit makes the guarded approval UPDATE match no row; `isApprovalCurrent` is false for `rejected` / `superseded`, missing reviewed context, and identity mismatch.

Replacement validates the new body with the proposal schema and event-scoped evidence checks, computes the content hash internally, and refuses a stale `expectedProposalVersion`. Successful replacement atomically clears approval/staging and rejects the previous linked review item (audit row retained, no longer actionable). Rejection requires the reviewed `expectedProposalVersion` so a stale reject cannot close a newer revision.

## Providers

| Provider | Behavior |
| --- | --- |
| `test` (default) | Deterministic synthetic adapter. `executionKind=synthetic`. Never reported as a live-model success. |
| `live` / named vendors | Reports **unavailable** unless a key is present; even then this build refuses activation without owner approval for paid APIs. |

Missing live configuration → run status `unavailable`, not a successful proposal.

## Traceability

`analyst_runs` stores run id, provider/model ids, `executionKind`, prompt version, exact input refs/content identities, status, timing, and usage when known. Unknown usage/cost stays null. Secrets are never stored.

`analyst_proposals` stores the validated body, content identity, reviewed event question + prompt version, staging link to `source_review_items`, and human review attribution. Approval binds to `(content_identity, input_content_identity)`. Editing the proposal or changing inputs clears approval; a stale approval cannot authorize publication bypass.

Identical proposal content for the same inputs stages at most once (unique on event + input identity + content identity).

## Remaining publication boundary

This path delivers proposal generation, validation, run persistence, and staging for human review.

**Not included:** automatic conversion of proposals into Move Log revisions, autonomous publishing, paid live-provider activation, accounts, or public write endpoints. After human review, operators still use the existing Move Log authorship fields (`observedChange`, `citedEvidenceIds`, `interpretation`, `remainsUnknown`) and `npm run operator -- publish` with idempotency keys and checkpoint verification.

## Activation requirements

1. Owner approval before enabling any paid live analyst provider.
2. Independent review of integrity hardening; merge is separate from deploy.
3. Optional follow-up: guided “convert proposal → Move Log draft” operator command that preserves agent authorship and human review attribution on the published revision.

## Follow-up (nonblocking)

- Wire `assertProposalApprovalNotStale` (with current input identity) into any future proposal→Move Log conversion path before that path exists.
- A configured but gated live provider throws at resolve time instead of recording an `unavailable` run.
