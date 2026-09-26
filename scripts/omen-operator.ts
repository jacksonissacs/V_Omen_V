/**
 * Nonproduction OMEN operator CLI (private publishing workflow).
 *
 *   npm run operator -- review list [--status staged|approved|rejected] [--event <id>]
 *   npm run operator -- review show <id>
 *   npm run operator -- review approve <id> --by "<operator>" [--note "<text>"]
 *   npm run operator -- review reject <id> --by "<operator>" [--note "<text>"]
 *   npm run operator -- intake stage --file <intake.json>
 *   npm run operator -- publish preview --file <bundle.json>
 *   npm run operator -- publish run --file <bundle.json> --idempotency-key <key>
 *   npm run operator -- publish approved --review-item <id> --idempotency-key <key>
 *   npm run operator -- publish retry --idempotency-key <key>
 *   npm run operator -- checkpoint verify --id <checkpointId>
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { readQueue } from "../src/lib/intake/queue"

import { Client } from "pg"

import { isPositiveInt8Text } from "../src/lib/db/bigint-id"
import { assertPostgresUrl, productionMarker, StorageConfigError } from "../src/lib/db/config"
import { importIntakeVersion } from "../src/lib/db/intake-bridge"
import { BundleValidationError, parseEventBundle } from "../src/lib/db/event-bundle"
import { HistoryConflictError } from "../src/lib/db/event-store"
import { assertWritableDatabase, DatabaseSafetyError } from "../src/lib/db/migrate"
import {
  getPublicationOperation,
  publishApprovedReviewItem,
  publishEventBundle,
  retryPublicationOperation,
  verifyCheckpointDigest,
} from "../src/lib/db/publication"
import {
  previewPublicationBundle,
  publicationBundleIssues,
  validatePublicationBundle,
} from "../src/lib/db/publication-bundle"
import {
  approveSourceReviewItem,
  getSourceReviewItem,
  listSourceReviewItems,
  rejectSourceReviewItem,
  stageSourceReviewItem,
} from "../src/lib/db/source-review"

const USAGE = `Usage: omen-operator <command> [options]
  review list [--status staged|approved|rejected] [--event <id>]
  review show <id>
  review approve <id> --by <operator> [--note <text>] [--stance supports|contradicts|contextual] [--reliability <0-1>]
  review reject <id> --by <operator> [--note <text>]
  intake stage --file <intake.json>
  intake import --queue <queue.json> --item <id> --by <operator>
  publish preview --file <bundle.json>
  publish run --file <bundle.json> --idempotency-key <key>
  publish approved --review-item <id> --idempotency-key <key>
  publish retry --idempotency-key <key>
  checkpoint verify --id <checkpointId>`

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env.local")
  if (existsSync(file)) process.loadEnvFile(file)
}

async function connect(): Promise<Client> {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new StorageConfigError("DATABASE_URL is not set.")
  assertPostgresUrl(connectionString, "DATABASE_URL")
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, application_name: "omen-operator-cli" })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`Could not connect to the database named by DATABASE_URL (${(error as Error).message}).`)
  }
  return client
}

function readJsonFile(file: string | undefined, label: string): unknown {
  if (!file) throw new Error(`${label} needs --file <path>`)
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new Error(`Could not read ${file}: ${(error as Error).message}`)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      status: { type: "string" },
      event: { type: "string" },
      by: { type: "string" },
      note: { type: "string" },
      file: { type: "string" },
      "idempotency-key": { type: "string" },
      "review-item": { type: "string" },
      id: { type: "string" },
      queue: { type: "string" },
      item: { type: "string" },
      stance: { type: "string" },
      reliability: { type: "string" },
    },
    allowPositionals: true,
  })

  const [domain, action, ...rest] = positionals
  if (!domain) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  loadLocalEnv()
  const marker = productionMarker()
  if (marker && domain !== "checkpoint") {
    throw new DatabaseSafetyError(`Refusing to run operator commands: ${marker}=production.`)
  }

  const client = await connect()
  try {
    if (domain === "review" && action === "list") {
      const items = await listSourceReviewItems(client, {
        ...(values.status ? { status: values.status as "staged" | "approved" | "rejected" } : {}),
        ...(values.event ? { eventId: values.event } : {}),
      })
      console.log(JSON.stringify(items, null, 2))
      return
    }

    if (domain === "review" && action === "show") {
      const id = rest[0]
      if (!id) throw new Error("review show needs <id>")
      const item = await getSourceReviewItem(client, id)
      if (!item) throw new Error(`Review item ${id} was not found.`)
      console.log(JSON.stringify(item, null, 2))
      return
    }

    if (domain === "review" && action === "approve") {
      await assertWritableDatabase(client)
      const id = rest[0]
      if (!id || !values.by) throw new Error("review approve needs <id> and --by")
      const completion =
        values.stance || values.reliability
          ? {
              stance: values.stance as "supports" | "contradicts" | "contextual",
              reliability: Number(values.reliability),
            }
          : undefined
      if (completion && (completion.stance === undefined || !Number.isFinite(completion.reliability))) {
        throw new Error("review approve needs both --stance and --reliability when either is set")
      }
      const item = await approveSourceReviewItem(client, id, values.by, values.note, completion)
      console.log(JSON.stringify(item, null, 2))
      return
    }

    if (domain === "review" && action === "reject") {
      await assertWritableDatabase(client)
      const id = rest[0]
      if (!id || !values.by) throw new Error("review reject needs <id> and --by")
      const item = await rejectSourceReviewItem(client, id, values.by, values.note)
      console.log(JSON.stringify(item, null, 2))
      return
    }

    if (domain === "intake" && action === "import") {
      await assertWritableDatabase(client)
      if (!values.queue || !values.item || !values.by) {
        throw new Error("intake import needs --queue, --item and --by")
      }
      const queue = await readQueue(path.dirname(values.queue))
      const version = queue.versions.find((entry) => entry.id === values.item)
      if (!version) throw new Error(`Queue item ${values.item} is not in the review queue.`)
      const result = await importIntakeVersion(client, version, values.by)
      console.log(JSON.stringify(result, null, 2))
      console.log("Import did not approve or publish the capture.")
      return
    }

    if (domain === "intake" && action === "stage") {
      await assertWritableDatabase(client)
      const item = await stageSourceReviewItem(client, readJsonFile(values.file, "intake stage"))
      console.log(JSON.stringify(item, null, 2))
      return
    }

    if (domain === "publish" && action === "preview") {
      const bundle = previewPublicationBundle(readJsonFile(values.file, "publish preview"))
      await validatePublicationBundle(client, bundle).catch((error) => {
        throw new Error(publicationBundleIssues(error))
      })
      console.log(JSON.stringify({ valid: true, bundle }, null, 2))
      return
    }

    if (domain === "publish" && (action === "run" || action === "approved")) {
      await assertWritableDatabase(client)
      const idempotencyKey = values["idempotency-key"]
      if (!idempotencyKey) throw new Error("publish needs --idempotency-key")
      let result
      if (action === "run") {
        const bundle = parseEventBundle(readJsonFile(values.file, "publish run"))
        result = await publishEventBundle(client, bundle, { idempotencyKey })
      } else {
        const reviewId = values["review-item"]
        if (!reviewId) throw new Error("publish approved needs --review-item")
        const item = await getSourceReviewItem(client, reviewId)
        if (!item) throw new Error(`Review item ${reviewId} was not found.`)
        result = await publishApprovedReviewItem(client, item, idempotencyKey)
      }
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (domain === "publish" && action === "retry") {
      await assertWritableDatabase(client)
      const idempotencyKey = values["idempotency-key"]
      if (!idempotencyKey) throw new Error("publish retry needs --idempotency-key")
      const result = await retryPublicationOperation(client, idempotencyKey)
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (domain === "publish" && action === "status") {
      const idempotencyKey = values["idempotency-key"]
      if (!idempotencyKey) throw new Error("publish status needs --idempotency-key")
      const operation = await getPublicationOperation(client, idempotencyKey)
      if (!operation) throw new Error(`No publication operation for idempotency key ${idempotencyKey}.`)
      console.log(JSON.stringify(operation, null, 2))
      return
    }

    if (domain === "checkpoint" && action === "verify") {
      const checkpointId = values.id ?? rest[0]
      if (!checkpointId || !isPositiveInt8Text(checkpointId)) {
        throw new Error("checkpoint verify needs --id <decimal bigint>")
      }
      const result = await verifyCheckpointDigest(client, checkpointId)
      console.log(JSON.stringify({ checkpointId, result }, null, 2))
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
    error instanceof BundleValidationError ||
    error instanceof DatabaseSafetyError ||
    error instanceof HistoryConflictError ||
    error instanceof StorageConfigError
  console.error(known ? (error as Error).message : (error as Error).message)
  process.exitCode = 1
})
