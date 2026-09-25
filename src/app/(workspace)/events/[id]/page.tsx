import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { EventIntelligenceView } from "@/components/intelligence/event-intelligence-view"
import { getRepository } from "@/lib/data/repository"

const loadEvent = cache((id: string) => getRepository().getEvent(id))

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const event = await loadEvent(id)
  if (!event) return { title: "Event not found" }
  return { title: event.title }
}

export default async function EventIntelligencePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await loadEvent(id)
  if (!event) notFound()
  const related = await getRepository().getRelatedEvents(event.id)
  return <EventIntelligenceView event={event} related={related} />
}
