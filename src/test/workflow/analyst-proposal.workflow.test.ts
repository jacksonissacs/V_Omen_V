/** @vitest-environment node */

import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  analyst,
  createWorkflowDatabase,
  operator,
  upsert,
  FIXTURES,
} from "./harness"
import type { DisposableDatabase } from "@/test/postgres-harness"

describe("analyst proposal staging workflow", () => {
  let database: DisposableDatabase

  beforeAll(async () => {
    database = await createWorkflowDatabase()
    await upsert(database.url, path.join(FIXTURES, "evt-temporal.json"))
  })

  afterAll(async () => {
    if (database) await database.drop()
  })

  it("generates a synthetic proposal, stages it, and refuses publish bypass", async () => {
    const proposed = await analyst(database.url, [
      "propose",
      "--event",
      "evt-test-temporal",
      "--evidence",
      "ev-test-temporal-1",
      "--provider",
      "test",
      "--stage",
      "--by",
      "workflow.analyst",
    ])
    expect(proposed.code, proposed.stderr || proposed.stdout).toBe(0)
    const body = JSON.parse(proposed.stdout) as {
      executionKind: string
      syntheticNotLiveEvaluation: boolean
      proposal: { id: string; status: string }
      staging: { reviewItemId: string; createdReviewItem: boolean }
    }
    expect(body.executionKind).toBe("synthetic")
    expect(body.syntheticNotLiveEvaluation).toBe(true)
    expect(body.proposal.status).toBe("staged")
    expect(body.staging.createdReviewItem).toBe(true)

    const again = await analyst(database.url, [
      "stage",
      body.proposal.id,
      "--by",
      "workflow.analyst",
    ])
    expect(again.code, again.stderr || again.stdout).toBe(0)
    const restage = JSON.parse(again.stdout) as { createdReviewItem: boolean; reviewItemId: string }
    expect(restage.createdReviewItem).toBe(false)
    expect(restage.reviewItemId).toBe(body.staging.reviewItemId)

    const approved = await operator(database.url, [
      "review",
      "approve",
      body.staging.reviewItemId,
      "--by",
      "workflow.reviewer",
    ])
    expect(approved.code, approved.stderr || approved.stdout).toBe(0)

    const published = await operator(database.url, [
      "publish",
      "approved",
      "--review-item",
      body.staging.reviewItemId,
      "--idempotency-key",
      "workflow-analyst-bypass-1",
    ])
    expect(published.code).not.toBe(0)
    expect(`${published.stderr}\n${published.stdout}`).toMatch(/not published|Move Log|evidence candidate/i)

    const unavailable = await analyst(database.url, [
      "propose",
      "--event",
      "evt-test-temporal",
      "--evidence",
      "ev-test-temporal-1",
      "--provider",
      "live",
    ])
    expect(unavailable.code).toBe(0)
    const liveBody = JSON.parse(unavailable.stdout) as {
      run: { status: string; errorCode: string | null }
      proposal: null
    }
    expect(liveBody.run.status).toBe("unavailable")
    expect(liveBody.proposal).toBeNull()
  })
})
