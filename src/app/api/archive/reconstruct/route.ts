import { loadArchiveReconstruction } from "@/lib/archive/load-archive-reconstruction"
import { getRepository } from "@/lib/data/repository"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get("event")?.trim()
  const cutoff = searchParams.get("cutoff")?.trim()
  const checkpoint = searchParams.get("checkpoint")?.trim() || undefined
  const repository = getRepository()

  if (!eventId || !cutoff) {
    return Response.json(
      { storage: repository.storage, error: "Both event and cutoff query parameters are required." },
      { status: 400 },
    )
  }

  const result = await loadArchiveReconstruction(eventId, cutoff, checkpoint)
  if (result.status === "unavailable") {
    return Response.json({ storage: repository.storage, error: "Archive storage is unavailable" }, { status: 503 })
  }
  if (result.status === "not_found") {
    return Response.json({ storage: repository.storage, error: "Event not found" }, { status: 404 })
  }
  if (result.status === "no_history") {
    return Response.json(
      { storage: repository.storage, eventId: result.eventId, error: "No recorded history at this cutoff" },
      { status: 422 },
    )
  }

  return Response.json({
    storage: repository.storage,
    provenance: result.provenance,
    reconstruction: result.reconstruction,
  })
}
