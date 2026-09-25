import { isDomain } from "@/lib/data/mock-repository"
import { getRepository } from "@/lib/data/repository"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const domainParam = searchParams.get("domain")
  const domain = isDomain(domainParam) ? domainParam : undefined
  const events = await getRepository().listEvents(domain ? { domain } : undefined)
  return Response.json({ events })
}
