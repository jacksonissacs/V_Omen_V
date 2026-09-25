import { getRepository, summarizeProvenance } from "@/lib/data/repository"
import { isDomain } from "@/lib/domain/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const domainParam = searchParams.get("domain")
  const domain = isDomain(domainParam) ? domainParam : undefined
  const repository = getRepository()
  try {
    const events = await repository.listEvents(domain ? { domain } : undefined)
    return Response.json({
      storage: repository.storage,
      provenance: summarizeProvenance(events),
      events,
    })
  } catch (error) {
    console.error("Event list unavailable", error)
    return Response.json(
      { storage: repository.storage, error: "Event storage is unavailable" },
      { status: 503 },
    )
  }
}
