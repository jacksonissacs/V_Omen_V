/** @vitest-environment node */

import { readFileSync } from "node:fs"
import path from "node:path"

import { afterAll, describe, expect, it } from "vitest"

import { executeAnalystProposal } from "@/lib/analyst/execute"
import {
  approveAnalystProposal,
  isApprovalCurrent,
  listAnalystProposals,
  replaceProposalBody,
} from "@/lib/analyst/store"
import { stageAnalystProposalForReview } from "@/lib/analyst/stage"
import { TestAnalystProvider } from "@/lib/analyst/providers/test-adapter"
import { UnavailableAnalystProvider } from "@/lib/analyst/providers/unavailable"
import { proposalContentIdentity } from "@/lib/analyst/content-identity"
import { parseEventBundle } from "@/lib/db/event-bundle"
import { writeEventBundle } from "@/lib/db/event-store"
import {
  getSourceReviewItem,
  approveSourceReviewItem,
} from "@/lib/db/source-review"
import { publishApprovedReviewItem } from "@/lib/db/publication"
import { PublicationValidationError } from "@/lib/db/publication-bundle"
import { createMigratedDatabase, type DisposableDatabase, withClient } from "@/test/postgres-harness"

const ROOT = path.resolve(__dirname, "../../..")
const SEED = parseEventBundle(
  JSON.parse(readFileSync(path.join(ROOT, "db/fixtures/demo-evt-boc-cut.json"), "utf8")),
)

describe("analyst proposal workflow (PostgreSQL)", () => {
  let database: DisposableDatabase

  afterAll(async () => {
    if (database) await database.drop()
  })

  it("runs synthetic propose → stage → refuse publish → stale approval on edit → idempotent restage", async () => {
    database = await createMigratedDatabase()
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
      })
      expect(isApprovalCurrent(approved)).toBe(true)

      const editedBody = {
        ...approved.proposal,
        interpretation: "Edited interpretation after human review.",
      }
      const edited = await replaceProposalBody(client, {
        id: approved.id,
        proposal: editedBody,
        contentIdentity: proposalContentIdentity(editedBody),
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
})
