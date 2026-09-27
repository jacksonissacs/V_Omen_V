/**
 * Nonproduction OMEN analyst CLI (bounded proposal generation).
 *
 *   npm run analyst -- propose --event <id> --evidence <id>[,<id>...] [--provider test] [--mode valid] [--stage] [--by <operator>]
 *   npm run analyst -- show run <id>
 *   npm run analyst -- show proposal <id>
 *   npm run analyst -- list runs [--event <id>]
 *   npm run analyst -- list proposals [--event <id>] [--status draft|staged|rejected|superseded]
 *   npm run analyst -- approve <proposalId> --by <operator>
 *   npm run analyst -- reject <proposalId> --by <operator> [--note <text>]
 *   npm run analyst -- stage <proposalId> --by <operator>
 *
 * Synthetic (--provider test) runs are never live-model evaluations.
 * Live providers stay unavailable until owner-approved activation.
 */
import { existsSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { Client } from "pg"

import {
  approveAnalystProposal,
  executeAnalystProposal,
  getAnalystProposal,
  getAnalystRun,
  listAnalystProposals,
  listAnalystRuns,
  rejectAnalystProposal,
  resolveAnalystProvider,
  stageAnalystProposalForReview,
} from "../src/lib/analyst"
import type { TestAdapterMode } from "../src/lib/analyst/providers/test-adapter"
import { AnalystProviderError, AnalystValidationError } from "../src/lib/analyst/types"
import { assertPostgresUrl, productionMarker, StorageConfigError } from "../src/lib/db/config"
import { assertWritableDatabase, DatabaseSafetyError } from "../src/lib/db/migrate"
import { PublicationValidationError } from "../src/lib/db/publication-bundle"

const USAGE = `Usage: omen-analyst <command> [options]
  propose --event <id> --evidence <id>[,<id>...] [--provider test|live] [--mode <test-mode>] [--stage] [--by <operator>]
  show run <id>
  show proposal <id>
  list runs [--event <id>]
  list proposals [--event <id>] [--status draft|staged|rejected|superseded]
  stage <proposalId> --by <operator>
  approve <proposalId> --by <operator>
  reject <proposalId> --by <operator> [--note <text>]

Test modes: valid, insufficient, unknown_citation, malformed, forbidden_fields, provider_failure, timeout, follow_source_injection
Synthetic runs are labeled executionKind=synthetic and are not live-model evaluations.`

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env.local")
  if (existsSync(file)) process.loadEnvFile(file)
}

async function connect(): Promise<Client> {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new StorageConfigError("DATABASE_URL is not set.")
  assertPostgresUrl(connectionString, "DATABASE_URL")
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    application_name: "omen-analyst-cli",
  })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`Could not connect to the database named by DATABASE_URL (${(error as Error).message}).`)
  }
  return client
}

async function main() {
  const argv = process.argv.slice(2)
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      event: { type: "string" },
      evidence: { type: "string" },
      provider: { type: "string" },
      mode: { type: "string" },
      stage: { type: "boolean", default: false },
      by: { type: "string" },
      note: { type: "string" },
      status: { type: "string" },
    },
    allowPositionals: true,
  })

  const [command, action, ...rest] = positionals
  if (!command) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  loadLocalEnv()
  const marker = productionMarker()
  if (marker) {
    throw new DatabaseSafetyError(`Refusing to run analyst commands: ${marker}=production.`)
  }

  const client = await connect()
  try {
    if (command === "propose") {
      await assertWritableDatabase(client)
      if (!values.event || !values.evidence) {
        throw new Error("propose needs --event and --evidence")
      }
      const evidenceIds = values.evidence.split(",").map((id) => id.trim()).filter(Boolean)
      const provider = resolveAnalystProvider({
        provider: values.provider,
        testMode: (values.mode as TestAdapterMode | undefined) ?? "valid",
      })
      const result = await executeAnalystProposal(client, {
        eventId: values.event,
        evidenceIds,
        provider,
      })

      let staging = null
      if (values.stage) {
        if (!result.proposal) {
          throw new Error("Cannot stage: proposal generation did not produce an accepted proposal.")
        }
        if (!values.by) throw new Error("propose --stage needs --by <operator>")
        staging = await stageAnalystProposalForReview(client, {
          proposalId: result.proposal.id,
          stagedBy: values.by,
        })
      }

      console.log(
        JSON.stringify(
          {
            executionKind: result.executionKind,
            syntheticNotLiveEvaluation: result.executionKind === "synthetic",
            reusedExistingProposal: result.reusedExistingProposal,
            run: result.run,
            proposal: staging?.proposal ?? result.proposal,
            staging: staging
              ? {
                  reviewItemId: staging.reviewItemId,
                  createdReviewItem: staging.createdReviewItem,
                }
              : null,
            publicationBoundary:
              "Proposals are not published. Convert to a Move Log/evidence candidate and use npm run operator -- publish after human review.",
          },
          null,
          2,
        ),
      )
      return
    }

    if (command === "show" && action === "run") {
      const id = rest[0]
      if (!id) throw new Error("show run needs <id>")
      const run = await getAnalystRun(client, id)
      if (!run) throw new Error(`Run ${id} was not found.`)
      console.log(
        JSON.stringify(
          {
            run,
            syntheticNotLiveEvaluation: run.executionKind === "synthetic",
          },
          null,
          2,
        ),
      )
      return
    }

    if (command === "show" && action === "proposal") {
      const id = rest[0]
      if (!id) throw new Error("show proposal needs <id>")
      const proposal = await getAnalystProposal(client, id)
      if (!proposal) throw new Error(`Proposal ${id} was not found.`)
      console.log(JSON.stringify(proposal, null, 2))
      return
    }

    if (command === "list" && action === "runs") {
      const runs = await listAnalystRuns(client, values.event ? { eventId: values.event } : {})
      console.log(JSON.stringify(runs, null, 2))
      return
    }

    if (command === "list" && action === "proposals") {
      const proposals = await listAnalystProposals(client, {
        ...(values.event ? { eventId: values.event } : {}),
        ...(values.status
          ? { status: values.status as "draft" | "staged" | "rejected" | "superseded" }
          : {}),
      })
      console.log(JSON.stringify(proposals, null, 2))
      return
    }

    if (command === "stage") {
      await assertWritableDatabase(client)
      const id = action
      if (!id || !values.by) throw new Error("stage needs <proposalId> and --by")
      const staging = await stageAnalystProposalForReview(client, {
        proposalId: id,
        stagedBy: values.by,
        ...(values.note ? { intakeNote: values.note } : {}),
      })
      console.log(JSON.stringify(staging, null, 2))
      return
    }

    if (command === "approve") {
      await assertWritableDatabase(client)
      const id = action
      if (!id || !values.by) throw new Error("approve needs <proposalId> and --by")
      const proposal = await approveAnalystProposal(client, { id, approvedBy: values.by })
      console.log(
        JSON.stringify(
          {
            proposal,
            note: "Approval is for the proposal draft only. It does not publish evidence or Move Logs.",
          },
          null,
          2,
        ),
      )
      return
    }

    if (command === "reject") {
      await assertWritableDatabase(client)
      const id = action
      if (!id || !values.by) throw new Error("reject needs <proposalId> and --by")
      const proposal = await rejectAnalystProposal(client, {
        id,
        rejectedBy: values.by,
        note: values.note,
      })
      console.log(JSON.stringify(proposal, null, 2))
      return
    }

    console.error(USAGE)
    process.exitCode = 2
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  const known =
    error instanceof AnalystValidationError ||
    error instanceof AnalystProviderError ||
    error instanceof DatabaseSafetyError ||
    error instanceof StorageConfigError ||
    error instanceof PublicationValidationError
  console.error(known ? (error as Error).message : (error as Error).message)
  process.exitCode = 1
})
