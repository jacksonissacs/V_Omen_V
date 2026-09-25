import { getRepository } from "@/lib/data/repository"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const repository = getRepository()
  try {
    const event = await repository.getEvent(id)
    if (!event) {
      return Response.json({ storage: repository.storage, error: "Event not found" }, { status: 404 })
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
