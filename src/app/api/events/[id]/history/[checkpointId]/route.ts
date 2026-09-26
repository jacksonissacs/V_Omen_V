import { historicalViewUnavailableMessage } from "@/lib/history/historical-request"
import { getRepository } from "@/lib/data/repository"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const { id, checkpointId } = await context.params
  const repository = getRepository()
  try {
    const event = await repository.getEvent(id)
    if (!event) {
      return Response.json({ storage: repository.storage, error: "Event not found" }, { status: 404 })
    }
    const request = { kind: "checkpoint" as const, value: checkpointId }
    return Response.json(
      {
        storage: repository.storage,
        error: historicalViewUnavailableMessage(request),
        historical: { available: false, kind: "checkpoint", value: checkpointId, eventId: id },
      },
      { status: 422 },
    )
  } catch (error) {
    console.error("Event history unavailable", error)
    return Response.json(
      { storage: repository.storage, error: "Event storage is unavailable" },
      { status: 503 },
    )
  }
}
