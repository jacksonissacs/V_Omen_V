/** @vitest-environment node */

import { readFileSync } from "node:fs"
import path from "node:path"

import { Client } from "pg"
import { afterAll, describe, expect, it } from "vitest"

import { executeAnalystProposal } from "@/lib/analyst/execute"
import {
  approveAnalystProposal,
  getAnalystProposal,
  isApprovalCurrent,
  listAnalystProposals,
  rejectAnalystProposal,
  replaceProposalBody,
} from "@/lib/analyst/store"
import { stageAnalystProposalForReview } from "@/lib/analyst/stage"
import { TestAnalystProvider } from "@/lib/analyst/providers/test-adapter"
import { UnavailableAnalystProvider } from "@/lib/analyst/providers/unavailable"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { writeEventBundle } from "@/lib/db/event-store"
import {
  getSourceReviewItem,
  approveSourceReviewItem,
} from "@/lib/db/source-review"
import { publishApprovedReviewItem } from "@/lib/db/publication"
import { PublicationValidationError } from "@/lib/db/publication-bundle"
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

describe("analyst proposal workflow (PostgreSQL)", () => {
  const databases: DisposableDatabase[] = []

  afterAll(async () => {
    for (const database of databases) await database.drop()
  })

  async function migrated(): Promise<DisposableDatabase> {
    const database = await createMigratedDatabase()
    databases.push(database)
    return database
  }

  it("runs synthetic propose → stage → refuse publish → stale approval on edit → idempotent restage", async () => {
    const database = await migrated()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, SEED)

      const first = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1", "ev-boc-2"],
        provider: new TestAnalystProvider("valid"),
        sleep: async () => undefined,
      })
      expect(first.run.status).toBe("succeeded")
      expect(first.run.executionKind).toBe("synthetic")
      expect(first.proposal).not.toBeNull()
      expect(first.proposal!.status).toBe("draft")

      const staged = await stageAnalystProposalForReview(client, {
        proposalId: first.proposal!.id,
        stagedBy: "operator.test",
      })
      expect(staged.createdReviewItem).toBe(true)
      expect(staged.proposal.status).toBe("staged")
      const review = await getSourceReviewItem(client, staged.reviewItemId)
      expect(review?.payload.kind).toBe("analyst_proposal")

      // Repeated stage while still staged does not create a duplicate review item.
      const restage = await stageAnalystProposalForReview(client, {
        proposalId: first.proposal!.id,
        stagedBy: "operator.test",
      })
      expect(restage.createdReviewItem).toBe(false)
      expect(restage.reviewItemId).toBe(staged.reviewItemId)

      // Repeated execution with the same inputs reuses proposal content identity.
      const second = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1", "ev-boc-2"],
        provider: new TestAnalystProvider("valid"),
        sleep: async () => undefined,
      })
      expect(second.run.status).toBe("succeeded")
      expect(second.proposal!.id).toBe(first.proposal!.id)
      expect(second.reusedExistingProposal).toBe(true)

      await approveSourceReviewItem(client, staged.reviewItemId, "operator.test", "Looks fine")
      await expect(
        publishApprovedReviewItem(client, (await getSourceReviewItem(client, staged.reviewItemId))!, "idem-analyst-1"),
      ).rejects.toBeInstanceOf(PublicationValidationError)

      const approved = await approveAnalystProposal(client, {
        id: first.proposal!.id,
        approvedBy: "operator.test",
        expectedContentIdentity: first.proposal!.contentIdentity,
        expectedInputContentIdentity: first.proposal!.inputContentIdentity,
      })
      expect(isApprovalCurrent(approved)).toBe(true)

      const editedBody = {
        ...approved.proposal,
        interpretation: "Edited interpretation after human review.",
      }
      const edited = await replaceProposalBody(client, {
        id: approved.id,
        proposal: editedBody,
        expectedProposalVersion: approved.proposalVersion,
      })
      expect(edited.proposalVersion).toBeGreaterThan(approved.proposalVersion)
      expect(isApprovalCurrent(edited)).toBe(false)
      expect(edited.status).toBe("draft")
      expect(edited.sourceReviewItemId).toBeNull()

      // Unknown citation path rejects output.
      const badCite = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("unknown_citation"),
        sleep: async () => undefined,
      })
      expect(badCite.run.status).toBe("rejected_output")
      expect(badCite.proposal).toBeNull()

      // Provider failure / timeout / unavailable.
      const failed = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("provider_failure"),
        sleep: async () => undefined,
      })
      expect(failed.run.status).toBe("failed")
      expect(failed.run.errorCode).toBe("provider_failure")

      const timedOut = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("timeout"),
        sleep: async () => undefined,
      })
      expect(timedOut.run.status).toBe("failed")
      expect(timedOut.run.errorCode).toBe("timeout")

      const unavailable = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new UnavailableAnalystProvider("live"),
        sleep: async () => undefined,
      })
      expect(unavailable.run.status).toBe("unavailable")
      expect(unavailable.proposal).toBeNull()

      // Insufficient evidence abstains successfully.
      const abstained = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("insufficient"),
        sleep: async () => undefined,
      })
      expect(abstained.run.status).toBe("succeeded")
      expect(abstained.proposal?.proposal.abstention.abstained).toBe(true)

      const listed = await listAnalystProposals(client, { eventId: "evt-boc-cut" })
      expect(listed.length).toBeGreaterThan(0)
    })
  })

  it("refuses a stale approval write when rejection commits first (B1)", async () => {
    const database = await migrated()
    const proposalId = await withClient(database.url, async (client) => {
      await writeEventBundle(client, SEED)
      const generated = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("valid"),
        sleep: async () => undefined,
      })
      return generated.proposal!.id
    })

    const approver = await openClient(database.url, "omen-analyst-approve-race")
    const rejector = await openClient(database.url, "omen-analyst-reject-race")
    try {
      const current = await getAnalystProposal(approver, proposalId)
      expect(current?.status).toBe("draft")

      const reachedBeforeWrite = createBarrier()
      const rejectCommitted = createBarrier()

      const approveAttempt = approveAnalystProposal(approver, {
        id: proposalId,
        approvedBy: "operator.approve",
        expectedContentIdentity: current!.contentIdentity,
        expectedInputContentIdentity: current!.inputContentIdentity,
        beforeWrite: async () => {
          reachedBeforeWrite.release()
          await rejectCommitted.wait
        },
      })

      await reachedBeforeWrite.wait
      const rejected = await rejectAnalystProposal(rejector, {
        id: proposalId,
        rejectedBy: "operator.reject",
        expectedProposalVersion: current!.proposalVersion,
        note: "Concurrent reject wins",
      })
      expect(rejected.status).toBe("rejected")
      expect(isApprovalCurrent(rejected)).toBe(false)
      rejectCommitted.release()

      await expect(approveAttempt).rejects.toThrow(/rejected and cannot be approved/)

      const final = await getAnalystProposal(approver, proposalId)
      expect(final?.status).toBe("rejected")
      expect(final?.approvedAt).toBeNull()
      expect(final?.approvalContentIdentity).toBeNull()
      expect(final?.approvalInputIdentity).toBeNull()
      expect(isApprovalCurrent(final!)).toBe(false)
    } finally {
      await approver.end()
      await rejector.end()
    }
  })

  it("clears approval when rejection follows a successful approve", async () => {
    const database = await migrated()
    await withClient(database.url, async (client) => {
      await writeEventBundle(client, SEED)
      const generated = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("valid"),
        sleep: async () => undefined,
      })
      const approved = await approveAnalystProposal(client, {
        id: generated.proposal!.id,
        approvedBy: "operator.approve",
        expectedContentIdentity: generated.proposal!.contentIdentity,
        expectedInputContentIdentity: generated.proposal!.inputContentIdentity,
      })
      expect(isApprovalCurrent(approved)).toBe(true)

      const rejected = await rejectAnalystProposal(client, {
        id: approved.id,
        rejectedBy: "operator.reject",
        expectedProposalVersion: approved.proposalVersion,
      })
      expect(rejected.status).toBe("rejected")
      expect(rejected.approvedAt).toBeNull()
      expect(isApprovalCurrent(rejected)).toBe(false)
    })
  })

  it("refuses approval when a concurrent edit changes content identity first", async () => {
    const database = await migrated()
    const seeded = await withClient(database.url, async (client) => {
      await writeEventBundle(client, SEED)
      const generated = await executeAnalystProposal(client, {
        eventId: "evt-boc-cut",
        evidenceIds: ["ev-boc-1"],
        provider: new TestAnalystProvider("valid"),
        sleep: async () => undefined,
      })
      return generated.proposal!
    })

    const approver = await openClient(database.url, "omen-analyst-approve-edit")
    const editor = await openClient(database.url, "omen-analyst-edit-race")
    try {
      const reachedBeforeWrite = createBarrier()
      const editCommitted = createBarrier()

      const approveAttempt = approveAnalystProposal(approver, {
        id: seeded.id,
        approvedBy: "operator.approve",
        expectedContentIdentity: seeded.contentIdentity,
        expectedInputContentIdentity: seeded.inputContentIdentity,
        beforeWrite: async () => {
          reachedBeforeWrite.release()
          await editCommitted.wait
        },
      })

      await reachedBeforeWrite.wait
      const editedBody = {
        ...seeded.proposal,
        interpretation: "Concurrently edited interpretation must not inherit prior review.",
      }
      const edited = await replaceProposalBody(editor, {
        id: seeded.id,
        proposal: editedBody,
        expectedProposalVersion: seeded.proposalVersion,
      })
      expect(edited.contentIdentity).not.toBe(seeded.contentIdentity)
      expect(isApprovalCurrent(edited)).toBe(false)
      editCommitted.release()

      await expect(approveAttempt).rejects.toThrow(/changed since review/)

      const final = await getAnalystProposal(approver, seeded.id)
      expect(final?.contentIdentity).toBe(edited.contentIdentity)
      expect(final?.approvedAt).toBeNull()
      expect(isApprovalCurrent(final!)).toBe(false)
    } finally {
      await approver.end()
      await editor.end()
    }
  })
})
