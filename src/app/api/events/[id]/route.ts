import { getRepository } from "@/lib/data/repository"
import {
  historicalViewUnavailableMessage,
  requestedHistoricalView,
} from "@/lib/history/historical-request"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const repository = getRepository()
  const historical = requestedHistoricalView(new URL(request.url).searchParams)
  try {
    const event = await repository.getEvent(id)
    if (!event) {
      return Response.json({ storage: repository.storage, error: "Event not found" }, { status: 404 })
    }
    if (historical) {
      return Response.json(
        {
          storage: repository.storage,
          error: historicalViewUnavailableMessage(historical),
          historical: { available: false, ...historical, eventId: id },
        },
        { status: 422 },
      )
    }
    return Response.json({ storage: repository.storage, provenance: event.provenance, event })
  } catch (error) {
    console.error("Event unavailable", error)
    return Response.json(
      { storage: repository.storage, error: "Event storage is unavailable" },
      { status: 503 },
    )
  }
}
