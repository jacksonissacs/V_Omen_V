import { getRepository } from "@/lib/data/repository"
import {
  ARBITRARY_TIME_UNSUPPORTED,
  validateReconstructionRequest,
  type HistoricalReconstruction,
  type ReconstructionOutcome,
} from "@/lib/domain/historical-reconstruction"

function json(status: number, body: unknown) {
  return Response.json(body, { status })
}

function reconstructionBody(
  storage: string,
  outcome: "reconstruction" | "pre_coverage",
  reconstruction: HistoricalReconstruction,
) {
  return {
    storage,
    outcome,
    eventId: reconstruction.eventId,
    checkpoint: reconstruction.checkpoint,
    coverage: reconstruction.coverage,
    provenance: reconstruction.provenance,
    semantics: reconstruction.semantics,
    observations: reconstruction.observations,
    evidence: reconstruction.evidence,
    moveLogs: reconstruction.moveLogs,
  }
}

/**
 * Replay one stored history checkpoint.
 * `?at=` and `?cutoff=` are refused: a wall-clock instant is not a verified
 * visibility boundary, and the handler does not read current or demo rows.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const { id, checkpointId } = await context.params
  const invalid = validateReconstructionRequest(id, checkpointId)
  if (invalid) {
    return json(400, { storage: getRepository().storage, outcome: invalid.outcome, error: invalid.message })
  }

  const url = new URL(request.url)
  if (url.searchParams.has("at") || url.searchParams.has("cutoff")) {
    return json(422, {
      storage: getRepository().storage,
      outcome: "unsupported_history",
      error: ARBITRARY_TIME_UNSUPPORTED,
    })
  }

  const repository = getRepository()
  try {
    const result: ReconstructionOutcome = await repository.reconstructEvent(id, checkpointId)
    switch (result.outcome) {
      case "reconstruction":
        return json(200, reconstructionBody(repository.storage, result.outcome, result.reconstruction))
      case "pre_coverage":
        return json(409, reconstructionBody(repository.storage, result.outcome, result.reconstruction))
      case "invalid_request":
        return json(400, { storage: repository.storage, outcome: result.outcome, error: result.message })
      case "unknown_event":
        return json(404, { storage: repository.storage, outcome: result.outcome, error: "Event not found" })
      case "unsupported_history":
        return json(422, { storage: repository.storage, outcome: result.outcome, error: result.message })
    }
  } catch (error) {
    console.error("Historical reconstruction unavailable", error)
    return json(503, {
      storage: repository.storage,
      outcome: "unavailable",
      error: "Event storage is unavailable",
    })
  }
}
