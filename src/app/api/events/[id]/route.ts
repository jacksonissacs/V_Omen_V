import { getRepository } from "@/lib/data/repository"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const event = await getRepository().getEvent(id)
  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 })
  }
  return Response.json({ event })
}
