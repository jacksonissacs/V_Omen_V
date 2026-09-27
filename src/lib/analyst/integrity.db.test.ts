/** @vitest-environment node */

import { readFileSync } from "node:fs"
import path from "node:path"

import { Client } from "pg"
import { afterAll, describe, expect, it } from "vitest"

import { inputContentIdentity, proposalContentIdentity } from "@/lib/analyst/content-identity"
import { executeAnalystProposal } from "@/lib/analyst/execute"
import {
  AnalystConflictError,
  AnalystStaleContextError,
  assertProposalInputFresh,
} from "@/lib/analyst/freshness"
import { TestAnalystProvider } from "@/lib/analyst/providers/test-adapter"
import { stageAnalystProposalForReview } from "@/lib/analyst/stage"
import {
  approveAnalystProposal,
  getAnalystProposal,
  isApprovalCurrent,
  rejectAnalystProposal,
  replaceProposalBody,
} from "@/lib/analyst/store"
import { ANALYST_PROMPT_VERSION } from "@/lib/analyst/types"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { writeEventBundle } from "@/lib/db/event-store"
import { publishApprovedReviewItem } from "@/lib/db/publication"
import {
  parseStageSourceReviewInput,
  PublicationValidationError,
} from "@/lib/db/publication-bundle"
import {
  approveSourceReviewItem,
  getSourceReviewItem,
  stageSourceReviewItem,
} from "@/lib/db/source-review"
import { createMigratedDatabase, type DisposableDatabase, withClient } from "@/test/postgres-harness"

async function openClient(url: string, applicationName: string): Promise<Client> {
  const client = new Client({ connectionString: url, application_name: applicationName })
  await client.connect()
  return client
}

function createBarrier(): { wait: Promise<void>; release: () => void } {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

const ROOT = path.resolve(__dirname, "../../..")
const SEED = parseEventBundle(
  JSON.parse(readFileSync(path.join(ROOT, "db/fixtures/demo-evt-boc-cut.json"), "utf8")),
)

describe("analyst proposal integrity hardening (PostgreSQL)", () => {
  const databases: DisposableDatabase[] = []

  afterAll(async () => {
    for (const database of databases) await database.drop()
  })

  async function migrated(): Promise<DisposableDatabase> {
    const database = await createMigratedDatabase()
    databases.push(database)
    return database
  }

  async function seedProposal(url: string, evidenceIds = ["ev-boc-1"]) {
    return withClient(url, async (client) => {
      await writeEventBundle(client, SEED)
      const generated = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds,
        provider: new TestAnalystProvider("valid"),
        sleep: async () => undefined,
      })
      expect(generated.proposal).not.toBeNull()
      expect(generated.proposal!.reviewedEventQuestion).toBeTruthy()
      expect(generated.proposal!.reviewedPromptVersion).toBe(ANALYST_PROMPT_VERSION)
      return generated.proposal!
    })
  }

  it("invalidates approval and staging when only the event question changes", async () => {
    const database = await migrated()
    const proposal = await seedProposal(database.url)

    await withClient(database.url, async (client) => {
      const approved = await approveAnalystProposal(client, {
        id: proposal.id,
        approvedBy: "operator.test",
        expectedContentIdentity: proposal.contentIdentity,
        expectedInputContentIdentity: proposal.inputContentIdentity,
      })
      expect(isApprovalCurrent(approved)).toBe(true)

      const staged = await stageAnalystProposalForReview(client, {
        proposalId: proposal.id,
        stagedBy: "operator.test",
      })
      expect(staged.proposal.status).toBe("staged")

      await writeEventBundle(client, {
        eventId: "evt-boc-cut",
        event: {
          ...SEED.event!,
          question: "Will the Bank of Canada cut the overnight rate at a later 2026 decision?",
          correctionNote: "Question revised for analyst input-freshness verification.",
        },
        observations: [],
        evidence: [],
        moveLogRevisions: [],
      })

      const current = await getAnalystProposal(client, proposal.id)
      expect(current).toBeTruthy()
      await expect(assertProposalInputFresh(client, current!)).rejects.toBeInstanceOf(AnalystStaleContextError)
      expect(isApprovalCurrent(current!, current!.inputContentIdentity)).toBe(true)
      // Authoritative current identity no longer matches stored approval binding.
      const freshQuestion = (
        await client.query<{ question: string }>("SELECT question FROM events WHERE id = $1", ["evt-boc-cut"])
      ).rows[0]!.question
      const currentIdentity = inputContentIdentity({
        eventQuestion: freshQuestion,
        promptVersion: ANALYST_PROMPT_VERSION,
        evidence: current!.proposal.inputEvidence,
      })
      expect(isApprovalCurrent(current!, currentIdentity)).toBe(false)

      await expect(
        approveAnalystProposal(client, {
          id: proposal.id,
          approvedBy: "operator.test",
          expectedContentIdentity: current!.contentIdentity,
          expectedInputContentIdentity: current!.inputContentIdentity,
        }),
      ).rejects.toBeInstanceOf(AnalystStaleContextError)

      await expect(
        stageAnalystProposalForReview(client, {
          proposalId: proposal.id,
          stagedBy: "operator.test",
        }),
      ).rejects.toBeInstanceOf(AnalystStaleContextError)
    })
  })

  it("invalidates eligibility when only the prompt version changes", async () => {
    const database = await migrated()
    const proposal = await seedProposal(database.url)

    await withClient(database.url, async (client) => {
      await approveAnalystProposal(client, {
        id: proposal.id,
        approvedBy: "operator.test",
        expectedContentIdentity: proposal.contentIdentity,
        expectedInputContentIdentity: proposal.inputContentIdentity,
      })

      const staleIdentity = inputContentIdentity({
        eventQuestion: proposal.reviewedEventQuestion!,
        promptVersion: "omen-analyst-proposal-v0",
        evidence: proposal.proposal.inputEvidence,
      })
      await client.query(
        `UPDATE analyst_proposals
            SET reviewed_prompt_version = $2,
                input_content_identity = $3,
                approval_input_identity = $3
          WHERE id = $1`,
        [proposal.id, "omen-analyst-proposal-v0", staleIdentity],
      )

      const current = await getAnalystProposal(client, proposal.id)
      expect(current!.reviewedPromptVersion).toBe("omen-analyst-proposal-v0")
      expect(isApprovalCurrent(current!)).toBe(true)
      await expect(assertProposalInputFresh(client, current!)).rejects.toBeInstanceOf(AnalystStaleContextError)

      await expect(
        approveAnalystProposal(client, {
          id: proposal.id,
          approvedBy: "operator.test",
          expectedContentIdentity: current!.contentIdentity,
          expectedInputContentIdentity: current!.inputContentIdentity,
        }),
      ).rejects.toBeInstanceOf(AnalystStaleContextError)

      await expect(
        stageAnalystProposalForReview(client, {
          proposalId: proposal.id,
          stagedBy: "operator.test",
        }),
      ).rejects.toBeInstanceOf(AnalystStaleContextError)
    })
  })

  it("treats legacy context as unable to retain effective approval", async () => {
    const database = await migrated()
    const proposal = await seedProposal(database.url)

    await withClient(database.url, async (client) => {
      await approveAnalystProposal(client, {
        id: proposal.id,
        approvedBy: "operator.test",
        expectedContentIdentity: proposal.contentIdentity,
        expectedInputContentIdentity: proposal.inputContentIdentity,
      })

      await client.query(
        `UPDATE analyst_proposals
            SET reviewed_event_question = NULL,
                reviewed_prompt_version = NULL
          WHERE id = $1`,
        [proposal.id],
      )

      const legacy = await getAnalystProposal(client, proposal.id)
      expect(legacy!.approvedAt).not.toBeNull()
      expect(isApprovalCurrent(legacy!)).toBe(false)
      await expect(assertProposalInputFresh(client, legacy!)).rejects.toBeInstanceOf(AnalystStaleContextError)

      await expect(
        approveAnalystProposal(client, {
          id: proposal.id,
          approvedBy: "operator.test",
          expectedContentIdentity: legacy!.contentIdentity,
          expectedInputContentIdentity: legacy!.inputContentIdentity,
        }),
      ).rejects.toBeInstanceOf(AnalystStaleContextError)

      await expect(
        stageAnalystProposalForReview(client, {
          proposalId: proposal.id,
          stagedBy: "operator.test",
        }),
      ).rejects.toBeInstanceOf(AnalystStaleContextError)
    })
  })

  it("rejects invalid replacements and forged hashes without corrupting stored identity", async () => {
    const database = await migrated()
    const proposal = await seedProposal(database.url)

    await withClient(database.url, async (client) => {
      const before = await getAnalystProposal(client, proposal.id)
      const beforeIdentity = before!.contentIdentity
      const beforeBody = before!.proposal

      await expect(
        replaceProposalBody(client, {
          id: proposal.id,
          proposal: {
            ...beforeBody,
            interpretation: "This proves that the release caused by policy is certain at 73%.",
          },
          expectedProposalVersion: before!.proposalVersion,
        }),
      ).rejects.toThrow(/forbidden/)

      const afterInvalid = await getAnalystProposal(client, proposal.id)
      expect(afterInvalid!.contentIdentity).toBe(beforeIdentity)
      expect(afterInvalid!.proposal).toEqual(beforeBody)
      expect(afterInvalid!.proposalVersion).toBe(before!.proposalVersion)

      // Caller cannot supply a forged hash — content identity is computed internally.
      const validEdit = {
        ...beforeBody,
        interpretation: "Edited interpretation pending human review.",
      }
      const replaced = await replaceProposalBody(client, {
        id: proposal.id,
        proposal: validEdit,
        expectedProposalVersion: before!.proposalVersion,
      })
      expect(replaced.contentIdentity).toBe(proposalContentIdentity(validEdit))
      expect(replaced.contentIdentity).not.toBe(beforeIdentity)
      expect(replaced.proposalVersion).toBe(before!.proposalVersion + 1)
      expect(replaced.approvedAt).toBeNull()
    })
  })

  it("refuses a stale replacement that would overwrite a newer revision (concurrency)", async () => {
    const database = await migrated()
    const seeded = await seedProposal(database.url)

    const first = await openClient(database.url, "omen-integrity-replace-a")
    const second = await openClient(database.url, "omen-integrity-replace-b")
    try {
      const reachedBeforeWrite = createBarrier()
      const newerCommitted = createBarrier()

      const staleAttempt = replaceProposalBody(first, {
        id: seeded.id,
        proposal: {
          ...seeded.proposal,
          interpretation: "Stale caller interpretation that must not win.",
        },
        expectedProposalVersion: seeded.proposalVersion,
        beforeWrite: async () => {
          reachedBeforeWrite.release()
          await newerCommitted.wait
        },
      })

      await reachedBeforeWrite.wait
      const newer = await replaceProposalBody(second, {
        id: seeded.id,
        proposal: {
          ...seeded.proposal,
          interpretation: "Newer concurrent interpretation that must persist.",
        },
        expectedProposalVersion: seeded.proposalVersion,
      })
      expect(newer.proposalVersion).toBe(seeded.proposalVersion + 1)
      newerCommitted.release()

      await expect(staleAttempt).rejects.toBeInstanceOf(AnalystConflictError)

      const final = await getAnalystProposal(first, seeded.id)
      expect(final!.proposalVersion).toBe(newer.proposalVersion)
      expect(final!.proposal.interpretation).toBe("Newer concurrent interpretation that must persist.")
      expect(final!.contentIdentity).toBe(newer.contentIdentity)
    } finally {
      await first.end()
      await second.end()
    }
  })

  it("refuses a stale rejection against a newer revision (concurrency)", async () => {
    const database = await migrated()
    const seeded = await seedProposal(database.url)

    const rejector = await openClient(database.url, "omen-integrity-reject-stale")
    const editor = await openClient(database.url, "omen-integrity-reject-edit")
    try {
      const reachedBeforeWrite = createBarrier()
      const editCommitted = createBarrier()

      const staleReject = rejectAnalystProposal(rejector, {
        id: seeded.id,
        rejectedBy: "operator.reject",
        expectedProposalVersion: seeded.proposalVersion,
        beforeWrite: async () => {
          reachedBeforeWrite.release()
          await editCommitted.wait
        },
      })

      await reachedBeforeWrite.wait
      const edited = await replaceProposalBody(editor, {
        id: seeded.id,
        proposal: {
          ...seeded.proposal,
          interpretation: "Newer revision must survive a stale rejection.",
        },
        expectedProposalVersion: seeded.proposalVersion,
      })
      expect(edited.status).toBe("draft")
      editCommitted.release()

      await expect(staleReject).rejects.toBeInstanceOf(AnalystConflictError)

      const final = await getAnalystProposal(rejector, seeded.id)
      expect(final!.status).toBe("draft")
      expect(final!.proposalVersion).toBe(edited.proposalVersion)
      expect(final!.rejectedAt).toBeNull()
      expect(final!.proposal.interpretation).toBe("Newer revision must survive a stale rejection.")
    } finally {
      await rejector.end()
      await editor.end()
    }
  })

  it("invalidates the linked review item when a staged proposal is edited, and restages the current revision", async () => {
    const database = await migrated()
    const proposal = await seedProposal(database.url)

    await withClient(database.url, async (client) => {
      const staged = await stageAnalystProposalForReview(client, {
        proposalId: proposal.id,
        stagedBy: "operator.test",
      })
      const oldReviewId = staged.reviewItemId
      const oldReview = await getSourceReviewItem(client, oldReviewId)
      expect(oldReview?.status).toBe("staged")

      const edited = await replaceProposalBody(client, {
        id: proposal.id,
        proposal: {
          ...proposal.proposal,
          interpretation: "Replacement after staging must invalidate the old review item.",
        },
        expectedProposalVersion: proposal.proposalVersion,
      })
      expect(edited.sourceReviewItemId).toBeNull()
      expect(edited.status).toBe("draft")

      const invalidated = await getSourceReviewItem(client, oldReviewId)
      expect(invalidated?.status).toBe("rejected")
      expect(invalidated?.reviewNote).toMatch(/Superseded/i)
      // Audit history preserved: row still exists with original payload kind.
      expect(invalidated?.payload.kind).toBe("analyst_proposal")

      const restaged = await stageAnalystProposalForReview(client, {
        proposalId: proposal.id,
        stagedBy: "operator.test",
      })
      expect(restaged.createdReviewItem).toBe(true)
      expect(restaged.reviewItemId).not.toBe(oldReviewId)
      expect(restaged.proposal.sourceReviewItemId).toBe(restaged.reviewItemId)

      const again = await stageAnalystProposalForReview(client, {
        proposalId: proposal.id,
        stagedBy: "operator.test",
      })
      expect(again.createdReviewItem).toBe(false)
      expect(again.reviewItemId).toBe(restaged.reviewItemId)

      const active = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM source_review_items
          WHERE payload->>'proposalId' = $1 AND status = 'staged'`,
        [proposal.id],
      )
      expect(active.rows[0]!.count).toBe(1)
    })
  })

  it("handles concurrent edit and stage without leaving an actionable stale review item", async () => {
    const database = await migrated()
    const seeded = await seedProposal(database.url)

    const editor = await openClient(database.url, "omen-integrity-edit-stage")
    const stager = await openClient(database.url, "omen-integrity-stage-edit")
    try {
      // Stage first so there is a linked review item for the editor to invalidate.
      const staged = await stageAnalystProposalForReview(stager, {
        proposalId: seeded.id,
        stagedBy: "operator.stage",
      })

      const reachedBeforeWrite = createBarrier()
      const stageAttempted = createBarrier()

      const editAttempt = replaceProposalBody(editor, {
        id: seeded.id,
        proposal: {
          ...seeded.proposal,
          interpretation: "Edit racing with restage.",
        },
        expectedProposalVersion: seeded.proposalVersion,
        beforeWrite: async () => {
          reachedBeforeWrite.release()
          await stageAttempted.wait
        },
      })

      await reachedBeforeWrite.wait
      // Concurrent restage of the pre-edit revision (idempotent while still staged).
      const restage = await stageAnalystProposalForReview(stager, {
        proposalId: seeded.id,
        stagedBy: "operator.stage",
      })
      expect(restage.reviewItemId).toBe(staged.reviewItemId)
      stageAttempted.release()

      const edited = await editAttempt
      expect(edited.sourceReviewItemId).toBeNull()

      const oldItem = await getSourceReviewItem(editor, staged.reviewItemId)
      expect(oldItem?.status).toBe("rejected")

      const current = await getAnalystProposal(editor, seeded.id)
      const restaged = await stageAnalystProposalForReview(editor, {
        proposalId: seeded.id,
        stagedBy: "operator.stage",
      })
      expect(restaged.proposal.contentIdentity).toBe(current!.contentIdentity)
      expect(restaged.reviewItemId).not.toBe(staged.reviewItemId)

      const actionable = await editor.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM source_review_items
          WHERE payload->>'proposalId' = $1 AND status IN ('staged', 'approved')`,
        [seeded.id],
      )
      expect(actionable.rows[0]!.count).toBe(1)
      const active = await getSourceReviewItem(editor, restaged.reviewItemId)
      expect(active?.status).toBe("staged")
      expect(active?.payload.kind === "analyst_proposal" && active.payload.contentIdentity).toBe(
        current!.contentIdentity,
      )
    } finally {
      await editor.end()
      await stager.end()
    }
  })

  it("blocks generic intake from persisting an unvalidated analyst_proposal payload", async () => {
    const database = await migrated()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, SEED)

      expect(() =>
        parseStageSourceReviewInput({
          id: "src-bypass-analyst-1",
          eventId: "evt-boc-cut",
          stagedBy: "attacker",
          candidate: {
            kind: "analyst_proposal",
            proposalId: "aprop-forged",
            contentIdentity: "a".repeat(64),
            inputContentIdentity: "b".repeat(64),
            proposal: { forged: true },
          },
        }),
      ).toThrow(/dedicated analyst staging workflow/i)

      await expect(
        stageSourceReviewItem(client, {
          id: "src-bypass-analyst-1",
          eventId: "evt-boc-cut",
          stagedBy: "attacker",
          candidate: {
            kind: "analyst_proposal",
            proposalId: "aprop-forged",
            contentIdentity: "a".repeat(64),
            inputContentIdentity: "b".repeat(64),
            proposal: { forged: true },
          },
        }),
      ).rejects.toBeInstanceOf(PublicationValidationError)

      const { rows } = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM source_review_items WHERE id = $1`,
        ["src-bypass-analyst-1"],
      )
      expect(rows[0]!.count).toBe(0)
    })
  })

  it("still refuses analyst publication and produces zero new Move Log rows", async () => {
    const database = await migrated()
    const proposal = await seedProposal(database.url)

    await withClient(database.url, async (client) => {
      const before = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM move_logs WHERE event_id = $1",
        ["evt-boc-cut"],
      )
      const beforeRevisions = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM move_log_revisions mlr
           JOIN move_logs ml ON ml.id = mlr.move_log_id
          WHERE ml.event_id = $1`,
        ["evt-boc-cut"],
      )

      const staged = await stageAnalystProposalForReview(client, {
        proposalId: proposal.id,
        stagedBy: "operator.test",
      })
      await approveSourceReviewItem(client, staged.reviewItemId, "operator.test", "Looks fine")
      const item = await getSourceReviewItem(client, staged.reviewItemId)
      await expect(publishApprovedReviewItem(client, item!, "idem-integrity-pub-1")).rejects.toBeInstanceOf(
        PublicationValidationError,
      )

      const after = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM move_logs WHERE event_id = $1",
        ["evt-boc-cut"],
      )
      const afterRevisions = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM move_log_revisions mlr
           JOIN move_logs ml ON ml.id = mlr.move_log_id
          WHERE ml.event_id = $1`,
        ["evt-boc-cut"],
      )
      expect(after.rows[0]!.count).toBe(before.rows[0]!.count)
      expect(afterRevisions.rows[0]!.count).toBe(beforeRevisions.rows[0]!.count)
    })
  })
})
