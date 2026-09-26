import { getRepository } from "@/lib/data/repository"
import { parseHistoryListRequest, type CheckpointListOutcome } from "@/lib/domain/historical-reconstruction"

export const dynamic = "force-dynamic"

function json(status: number, body: unknown) {
  return Response.json(body, { status })
}

/**
 * Bounded discovery of published checkpoints for one event, newest sequence first.
 * The page does not include member rows. `?at=` and `?cutoff=` are refused.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const parsed = parseHistoryListRequest(id, new URL(request.url))
  if (parsed.outcome === "invalid_request") {
    return json(400, { storage: getRepository().storage, outcome: parsed.outcome, error: parsed.message })
  }
  if (parsed.outcome === "unsupported_history") {
    return json(422, { storage: getRepository().storage, outcome: parsed.outcome, error: parsed.message })
  }

  const repository = getRepository()
  try {
    const result: CheckpointListOutcome = await repository.listHistoryCheckpoints(id, {
      limit: parsed.limit,
      beforeSequence: parsed.beforeSequence,
    })
    switch (result.outcome) {
      case "checkpoints":
        return json(200, {
          storage: repository.storage,
          outcome: result.outcome,
          eventId: result.eventId,
          limit: result.limit,
          hasMore: result.hasMore,
          checkpoints: result.checkpoints,
        })
      case "invalid_request":
        return json(400, { storage: repository.storage, outcome: result.outcome, error: result.message })
      case "unknown_event":
        return json(404, { storage: repository.storage, outcome: result.outcome, error: "Event not found" })
      case "unsupported_history":
        return json(422, { storage: repository.storage, outcome: result.outcome, error: result.message })
    }
  } catch (error) {
    console.error("History checkpoint list unavailable", error)
    return json(503, {
      storage: repository.storage,
      outcome: "unavailable",
      error: "Event storage is unavailable",
    })
  }
}
