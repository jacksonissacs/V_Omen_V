import { describe, expect, it } from "vitest"

import {
  authoredMoveLogToRevision,
  evidenceFromSourceCapture,
  parseStageSourceReviewInput,
} from "@/lib/db/publication-bundle"

describe("publication-bundle", () => {
  it("maps authored Move Log sections and rejects missing author or evidence", () => {
    const revision = authoredMoveLogToRevision(
      {
        moveLogId: "ml-test",
        publishedAt: "2026-09-26T12:00:00.000Z",
        author: "Author One",
        observedChange: "Probability moved up.",
        citedEvidenceIds: ["ev-1"],
        interpretation: "The cited release explains the move.",
        remainsUnknown: ["Follow-through next week"],
        provenance: "sourced",
      },
      1,
    )
    expect(revision.whatChanged).toBe("Probability moved up.")
    expect(revision.likelyCause).toContain("cited release")
    expect(revision.unexplainedFactors).toEqual(["Follow-through next week"])
    expect(revision.explainedPct).toBeUndefined()

    expect(() =>
      authoredMoveLogToRevision(
        {
          moveLogId: "ml-test",
          publishedAt: "2026-09-26T12:00:00.000Z",
          author: "",
          observedChange: "x",
          citedEvidenceIds: [],
          interpretation: "y",
          remainsUnknown: [],
          provenance: "sourced",
        },
        1,
      ),
    ).toThrow(/author/)
  })

  it("parses intake payloads for the review queue", () => {
    const parsed = parseStageSourceReviewInput({
      id: "src-1",
      eventId: "evt-boc-cut",
      stagedBy: "operator",
      candidate: {
        kind: "evidence",
        evidence: {
          id: "ev-1",
          sourceName: "Example",
          sourcePublishedAt: null,
          firstObservedAt: "2026-09-26T12:00:00.000Z",
          summary: "Example evidence",
          stance: "contextual",
          reliability: 0.5,
          recordedBy: "operator",
          provenance: "sourced",
        },
      },
    })
    expect(parsed.candidate.kind).toBe("evidence")
  })

  it("keeps a calendar date out of the evidence publication timestamp and adds no probability", () => {
    const bundle = evidenceFromSourceCapture(
      "evt-boc-cut",
      {
        sourceId: "cisa-kev",
        sourceItemId: "CVE-2026-0001",
        version: 1,
        intakeVersionId: "cisa-kev-cve-2026-0001-v1",
        canonicalUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json#CVE-2026-0001",
        title: "Example",
        excerpt: "Captured excerpt",
        sourcePublishedAt: null,
        sourcePublishedDate: "2026-09-01",
        firstFetchedAt: "2026-09-02T12:00:00.000Z",
        contentIdentity: "a".repeat(64),
        provenance: "sourced",
      },
      { stance: "contextual", reliability: 0.4, recordedBy: "reviewer.test" },
    )
    expect(bundle.observations).toEqual([])
    expect(bundle.evidence[0]).toMatchObject({
      sourcePublishedAt: null,
      provenance: "sourced",
      firstObservedAt: "2026-09-02T12:00:00.000Z",
    })
    expect(() =>
      evidenceFromSourceCapture(
        "evt-boc-cut",
        {
          sourceId: "cisa-kev",
          sourceItemId: "CVE-2026-0001",
          version: 1,
          intakeVersionId: "cisa-kev-cve-2026-0001-v1",
          canonicalUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json#CVE-2026-0001",
          title: "Example",
          excerpt: "Captured excerpt",
          sourcePublishedAt: "2026-09-01",
          sourcePublishedDate: "2026-09-01",
          firstFetchedAt: "2026-09-02T12:00:00.000Z",
          contentIdentity: "a".repeat(64),
          provenance: "sourced",
        },
        { stance: "contextual", reliability: 0.4, recordedBy: "reviewer.test" },
      ),
    ).toThrow(/calendar date/)
  })
})
